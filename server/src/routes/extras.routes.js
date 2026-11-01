/**
 * Bonus features: before/after gallery, membership plans & subscriptions,
 * gift cards, walk-in queue, AI hairstyle recommendations, coupon validation.
 */
import { Router } from 'express';
import { z } from 'zod';
import { one, many, query } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';
import { heavyLimiter } from '../middleware/rateLimit.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { idParam, uuid, email, phone } from '../validators/common.js';
import { createPayment } from '../services/payment.service.js';
import { validateCoupon } from '../services/pricing.service.js';
import { recommendHairstyles } from '../services/ai.service.js';
import { notifyUser, sendEmail } from '../services/notification.service.js';
import { emit } from '../services/socket.js';
import { randomCode } from '../utils/helpers.js';
import { dayjs } from '../utils/time.js';

const router = Router();

// ------------------------------------------------------------ coupons (public check)
router.post('/coupons/validate', optionalAuth, validate({ body: z.object({ code: z.string().max(40), amount: z.coerce.number().min(0) }) }),
  asyncHandler(async (req, res) => {
    const c = await validateCoupon(req.body.code, req.user?.id, req.body.amount);
    res.json({ coupon: { code: c.code, description: c.description, discount_type: c.discount_type, discount_value: c.discount_value } });
  }));

// ------------------------------------------------------------ gallery
router.get('/gallery', validate({ query: z.object({ barberId: uuid.optional(), tag: z.string().max(40).optional() }) }), asyncHandler(async (req, res) => {
  res.json({ items: await many(
    `SELECT g.*, u.name AS barber_name FROM gallery_items g LEFT JOIN barbers b ON b.id = g.barber_id LEFT JOIN users u ON u.id = b.user_id
      WHERE ($1::uuid IS NULL OR g.barber_id = $1) AND ($2::text IS NULL OR $2 = ANY(g.tags)) ORDER BY g.created_at DESC LIMIT 60`,
    [req.query.barberId || null, req.query.tag || null]) });
}));

router.post('/gallery', authenticate, authorize('barber', 'admin'), validate({
  body: z.object({ title: z.string().min(2).max(100), before_url: z.string().url().max(500), after_url: z.string().url().max(500),
    tags: z.array(z.string().max(30)).max(8).default([]), barber_id: uuid.optional() }),
}), asyncHandler(async (req, res) => {
  const barberId = req.user.role === 'barber' ? req.user.barber_id : req.body.barber_id || null;
  res.status(201).json({ item: await one(
    'INSERT INTO gallery_items (barber_id, title, before_url, after_url, tags) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [barberId, req.body.title, req.body.before_url, req.body.after_url, req.body.tags]) });
}));

router.delete('/gallery/:id', authenticate, authorize('barber', 'admin'), validate({ params: idParam }), asyncHandler(async (req, res) => {
  await query('DELETE FROM gallery_items WHERE id = $1 AND ($2::uuid IS NULL OR barber_id = $2)', [req.params.id, req.user.role === 'barber' ? req.user.barber_id : null]);
  res.status(204).end();
}));

// ------------------------------------------------------------ memberships / subscriptions
router.get('/memberships/plans', asyncHandler(async (_req, res) => {
  res.json({ plans: await many('SELECT * FROM membership_plans WHERE is_active ORDER BY price_monthly') });
}));

router.get('/memberships/me', authenticate, asyncHandler(async (req, res) => {
  res.json({ membership: await one(
    `SELECT m.*, p.name AS plan_name, p.discount_percent, p.perks, p.price_monthly, p.included_cuts
       FROM memberships m JOIN membership_plans p ON p.id = m.plan_id WHERE m.user_id = $1 AND m.status = 'active'`, [req.user.id]) });
}));

router.post('/memberships/subscribe', authenticate, authorize('customer'), validate({ body: z.object({ planId: uuid }) }), asyncHandler(async (req, res) => {
  const plan = await one('SELECT * FROM membership_plans WHERE id = $1 AND is_active', [req.body.planId]);
  if (!plan) throw ApiError.notFound('Plan not found');
  if (await one("SELECT 1 FROM memberships WHERE user_id = $1 AND status = 'active'", [req.user.id])) throw ApiError.conflict('You already have an active membership');
  const payment = await createPayment({ userId: req.user.id, purpose: 'membership', amount: plan.price_monthly, method: 'card' });
  // Mock payments settle instantly; with Stripe the membership is activated by the webhook.
  const status = payment.status === 'paid' ? 'active' : 'cancelled';
  const membership = await one(
    "INSERT INTO memberships (user_id, plan_id, status, renews_at) VALUES ($1,$2,$3, now() + interval '1 month') RETURNING *",
    [req.user.id, plan.id, status]);
  if (status === 'active') notifyUser(req.user.id, { type: 'membership', title: `Welcome to ${plan.name}!`, body: `Your membership is active. Enjoy ${plan.discount_percent}% off every visit.`, sms: false });
  res.status(201).json({ membership, payment });
}));

router.post('/memberships/cancel', authenticate, asyncHandler(async (req, res) => {
  const m = await one("UPDATE memberships SET status = 'cancelled', cancelled_at = now() WHERE user_id = $1 AND status = 'active' RETURNING *", [req.user.id]);
  if (!m) throw ApiError.notFound('No active membership');
  res.json({ membership: m });
}));

router.post('/memberships/plans', authenticate, authorize('admin'), validate({
  body: z.object({ name: z.string().min(2).max(60), description: z.string().max(300).optional(), price_monthly: z.number().positive(),
    discount_percent: z.number().min(0).max(100).default(0), included_cuts: z.number().int().min(0).default(0),
    points_multiplier: z.number().min(1).max(5).default(1), perks: z.array(z.string().max(80)).max(10).default([]) }),
}), asyncHandler(async (req, res) => {
  const p = req.body;
  res.status(201).json({ plan: await one(
    `INSERT INTO membership_plans (name, description, price_monthly, discount_percent, included_cuts, points_multiplier, perks)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [p.name, p.description, p.price_monthly, p.discount_percent, p.included_cuts, p.points_multiplier, p.perks]) });
}));

// ------------------------------------------------------------ gift cards
router.post('/gift-cards/purchase', authenticate, validate({
  body: z.object({ amount: z.number().min(10).max(1000), recipientName: z.string().min(2).max(80), recipientEmail: email, message: z.string().max(300).optional() }),
}), asyncHandler(async (req, res) => {
  const code = randomCode(12);
  const payment = await createPayment({ userId: req.user.id, purpose: 'gift_card', amount: req.body.amount, method: 'card', metadata: { giftCardCode: code } });
  const active = payment.status === 'paid';
  const card = await one(
    `INSERT INTO gift_cards (code, initial_amount, balance, purchaser_id, recipient_name, recipient_email, message, is_active, expires_at)
     VALUES ($1,$2,$2,$3,$4,$5,$6,$7, now() + interval '1 year') RETURNING *`,
    [code, req.body.amount, req.user.id, req.body.recipientName, req.body.recipientEmail, req.body.message || null, active]);
  if (active) {
    sendEmail(req.body.recipientEmail, `You received a $${req.body.amount} Klippers gift card!`,
      `${req.user.name} sent you a gift card${req.body.message ? `:\n"${req.body.message}"` : '.'}\n\nCode: ${code}\nUse it at checkout for any service.`);
  }
  res.status(201).json({ giftCard: card, payment });
}));

router.get('/gift-cards/mine', authenticate, asyncHandler(async (req, res) => {
  res.json({ giftCards: await many('SELECT * FROM gift_cards WHERE purchaser_id = $1 ORDER BY created_at DESC', [req.user.id]) });
}));

router.get('/gift-cards/:code/balance', heavyLimiter, asyncHandler(async (req, res) => {
  const g = await one('SELECT code, balance, initial_amount, expires_at, is_active FROM gift_cards WHERE code = $1', [String(req.params.code).toUpperCase()]);
  if (!g) throw ApiError.notFound('Gift card not found');
  res.json({ giftCard: g });
}));

router.get('/gift-cards', authenticate, authorize('admin'), asyncHandler(async (_req, res) => {
  res.json({ giftCards: await many('SELECT g.*, u.name AS purchaser_name FROM gift_cards g LEFT JOIN users u ON u.id = g.purchaser_id ORDER BY g.created_at DESC') });
}));

// ------------------------------------------------------------ walk-in queue
const queueSelect = `
  SELECT q.*, s.name AS service_name, s.duration_min, bu.name AS barber_name
    FROM queue_entries q LEFT JOIN services s ON s.id = q.service_id
    LEFT JOIN barbers b ON b.id = q.barber_id LEFT JOIN users bu ON bu.id = b.user_id`;

async function queueSnapshot(locationId) {
  const rows = await many(`${queueSelect} WHERE q.status IN ('waiting','serving') AND ($1::uuid IS NULL OR q.location_id = $1) ORDER BY q.joined_at`, [locationId || null]);
  // Estimated wait: cumulative duration of people ahead, spread over active barbers
  const { n } = await one('SELECT GREATEST(count(*),1)::int AS n FROM barbers WHERE is_approved AND ($1::uuid IS NULL OR location_id = $1)', [locationId || null]);
  let ahead = 0;
  return rows.map((r, i) => {
    const entry = { ...r, position: i + 1, est_wait_min: r.status === 'serving' ? 0 : Math.round(ahead / n) };
    ahead += r.duration_min || 30;
    return entry;
  });
}

const broadcastQueue = async (locationId) => emit(`location:${locationId}`, 'queue:updated', await queueSnapshot(locationId));

router.get('/queue', optionalAuth, validate({ query: z.object({ locationId: uuid.optional() }) }), asyncHandler(async (req, res) => {
  const queue = await queueSnapshot(req.query.locationId);
  const isStaff = req.user && req.user.role !== 'customer';
  // Public lobby display masks personal details
  res.json({ queue: isStaff ? queue : queue.map((q) => ({ ...q, name: `${q.name.split(' ')[0]} ${q.name.split(' ')[1]?.[0] || ''}.`.trim(), phone: undefined })) });
}));

router.post('/queue', heavyLimiter, optionalAuth, validate({
  body: z.object({ locationId: uuid, name: z.string().min(2).max(80), phone: phone.optional(), serviceId: uuid.optional(), barberId: uuid.optional() }),
}), asyncHandler(async (req, res) => {
  const entry = await one(
    'INSERT INTO queue_entries (location_id, barber_id, customer_id, name, phone, service_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.body.locationId, req.body.barberId || null, req.user?.id || null, req.body.name, req.body.phone || null, req.body.serviceId || null]);
  await broadcastQueue(req.body.locationId);
  const snap = await queueSnapshot(req.body.locationId);
  res.status(201).json({ entry: snap.find((e) => e.id === entry.id) });
}));

router.patch('/queue/:id', authenticate, authorize('barber', 'admin'), validate({
  params: idParam, body: z.object({ status: z.enum(['waiting', 'serving', 'done', 'left']), barberId: uuid.optional() }),
}), asyncHandler(async (req, res) => {
  const barberId = req.body.barberId || (req.user.role === 'barber' ? req.user.barber_id : null);
  const entry = await one(
    `UPDATE queue_entries SET status = $2, barber_id = COALESCE($3, barber_id),
            served_at = CASE WHEN $2 = 'serving' THEN now() ELSE served_at END WHERE id = $1 RETURNING *`,
    [req.params.id, req.body.status, barberId]);
  if (!entry) throw ApiError.notFound('Queue entry not found');
  if (req.body.status === 'serving' && entry.customer_id) {
    notifyUser(entry.customer_id, { type: 'queue_called', title: "You're up!", body: 'Your barber is ready for you now.', email: false });
  }
  await broadcastQueue(entry.location_id);
  res.json({ entry });
}));

// ------------------------------------------------------------ AI hairstyle recommendations
router.post('/ai/recommendations', heavyLimiter, validate({
  body: z.object({
    faceShape: z.enum(['oval', 'round', 'square', 'oblong', 'heart', 'diamond']),
    hairType: z.enum(['straight', 'wavy', 'curly', 'coily']),
    hairLength: z.enum(['short', 'medium', 'long']),
    beard: z.enum(['none', 'stubble', 'short', 'full']).optional(),
    maintenance: z.enum(['low', 'medium', 'high']).optional(),
    lifestyle: z.string().max(100).optional(),
    notes: z.string().max(300).optional(),
  }),
}), asyncHandler(async (req, res) => {
  res.json({ result: await recommendHairstyles(req.body), generatedAt: dayjs().toISOString() });
}));

export default router;
