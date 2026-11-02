/**
 * Price quote calculation shared by "preview price" and "create booking".
 * Order of operations:
 *   subtotal (barber-specific price overrides)
 *   − membership discount (percent)
 *   − coupon discount (percent | fixed, with min amount / usage limits)
 *   − loyalty points redemption
 *   + tax (on the discounted amount)
 */
import { one, many } from '../db/pool.js';
import { money, formatMoney } from '../utils/helpers.js';
import { ApiError } from '../utils/ApiError.js';
import { getSettings } from './settings.service.js';

/** Resolve services for a barber, applying custom price/duration. */
export async function resolveServices(barberId, serviceIds) {
  const unique = [...new Set(serviceIds)];
  const rows = await many(
    `SELECT s.id, s.name, s.category,
            COALESCE(bs.custom_price, s.price) AS price,
            COALESCE(bs.custom_duration, s.duration_min) AS duration_min
       FROM services s JOIN barber_services bs ON bs.service_id = s.id AND bs.barber_id = $1
      WHERE s.id = ANY($2::uuid[]) AND s.is_active`,
    [barberId, unique],
  );
  if (rows.length !== unique.length) throw ApiError.badRequest('One or more services are not offered by this barber');
  return rows;
}

/** Validate a coupon for a user and amount. Returns the coupon row. */
export async function validateCoupon(code, userId, amount) {
  const c = await one('SELECT * FROM coupons WHERE upper(code) = upper($1)', [code]);
  if (!c || !c.is_active) throw ApiError.badRequest('Invalid coupon code');
  const now = new Date();
  if (c.valid_from > now || (c.valid_until && c.valid_until < now)) throw ApiError.badRequest('Coupon has expired');
  if (c.max_uses !== null && c.used_count >= c.max_uses) throw ApiError.badRequest('Coupon usage limit reached');
  if (amount < Number(c.min_amount)) throw ApiError.badRequest(`Coupon requires a minimum spend of ${formatMoney(c.min_amount)}`);
  if (userId) {
    const { count } = await one('SELECT count(*)::int AS count FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2', [c.id, userId]);
    if (count >= c.per_user_limit) throw ApiError.badRequest('You have already used this coupon');
  }
  return c;
}

export async function activeMembership(userId) {
  if (!userId) return null;
  return one(
    `SELECT m.*, p.name AS plan_name, p.discount_percent, p.points_multiplier
       FROM memberships m JOIN membership_plans p ON p.id = m.plan_id
      WHERE m.user_id = $1 AND m.status = 'active' AND m.renews_at > now()`,
    [userId],
  );
}

/**
 * @param {{barberId:string, serviceIds:string[], couponCode?:string, userId?:string, redeemPoints?:number}} p
 */
export async function quote({ barberId, serviceIds, couponCode, userId, redeemPoints = 0 }) {
  const settings = await getSettings();
  const items = await resolveServices(barberId, serviceIds);
  const subtotal = money(items.reduce((s, i) => s + Number(i.price), 0));
  const durationMin = items.reduce((s, i) => s + i.duration_min, 0);

  let running = subtotal;
  const membership = await activeMembership(userId);
  const membershipDiscount = membership ? money(running * (Number(membership.discount_percent) / 100)) : 0;
  running -= membershipDiscount;

  let coupon = null;
  let couponDiscount = 0;
  if (couponCode) {
    coupon = await validateCoupon(couponCode, userId, running);
    couponDiscount = coupon.discount_type === 'percent'
      ? money(running * (Number(coupon.discount_value) / 100))
      : Math.min(Number(coupon.discount_value), running);
    running -= couponDiscount;
  }

  let pointsUsed = 0;
  let pointsDiscount = 0;
  if (redeemPoints > 0) {
    if (!userId) throw ApiError.badRequest('Sign in to redeem points');
    const { loyalty_points: balance } = await one('SELECT loyalty_points FROM users WHERE id = $1', [userId]);
    if (redeemPoints < settings.loyalty_min_redeem) throw ApiError.badRequest(`Minimum redemption is ${settings.loyalty_min_redeem} points`);
    if (redeemPoints > balance) throw ApiError.badRequest('Not enough loyalty points');
    // Never let points take the price below zero
    const maxPoints = Math.floor(running / settings.loyalty_redeem_rate);
    pointsUsed = Math.min(redeemPoints, maxPoints);
    pointsDiscount = money(pointsUsed * settings.loyalty_redeem_rate);
    running -= pointsDiscount;
  }

  const discount = money(membershipDiscount + couponDiscount + pointsDiscount);
  const taxable = Math.max(money(subtotal - discount), 0);
  const tax = money(taxable * (Number(settings.tax_rate) / 100));
  return {
    items, durationMin, subtotal,
    membershipDiscount, couponDiscount, pointsDiscount, pointsUsed,
    discount, tax, taxRate: Number(settings.tax_rate), total: money(taxable + tax),
    coupon: coupon && { id: coupon.id, code: coupon.code },
    membership: membership && { plan: membership.plan_name, discountPercent: Number(membership.discount_percent) },
  };
}
