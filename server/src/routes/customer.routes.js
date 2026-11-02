/**
 * Customer engagement: reviews, favourites, loyalty points, notifications,
 * waiting list and the customer dashboard summary.
 */
import { Router } from 'express';
import { z } from 'zod';
import { one, many, query, withTransaction } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { idParam, uuid, dateStr } from '../validators/common.js';
import { adjustPoints, tierFor } from '../services/loyalty.service.js';
import { getSettings } from '../services/settings.service.js';
import { activeMembership } from '../services/pricing.service.js';
import { APPT_SELECT } from './appointments.routes.js';
import { dayjs } from '../utils/time.js';

const router = Router();

/** Recalculate a barber's cached rating aggregate. */
const refreshRating = (db, barberId) => db.query(
  `UPDATE barbers SET rating_avg = COALESCE((SELECT round(avg(rating)::numeric, 2) FROM reviews WHERE barber_id = $1 AND is_visible), 0),
          rating_count = (SELECT count(*) FROM reviews WHERE barber_id = $1 AND is_visible) WHERE id = $1`, [barberId]);

// ------------------------------------------------------------ dashboard
router.get('/dashboard', authenticate, authorize('customer'), asyncHandler(async (req, res) => {
  const uid = req.user.id;
  const [upcoming, past, favorites, user, membership] = await Promise.all([
    many(`${APPT_SELECT} WHERE a.customer_id = $1 AND a.start_at >= now() AND a.status IN ('pending','confirmed','checked_in') ORDER BY a.start_at LIMIT 5`, [uid]),
    many(`${APPT_SELECT} WHERE a.customer_id = $1 AND a.start_at < now() ORDER BY a.start_at DESC LIMIT 5`, [uid]),
    many(`SELECT b.id, u.name, b.title, COALESCE(b.photo_url, u.avatar_url) AS photo_url, b.rating_avg, b.specialties
            FROM favorites f JOIN barbers b ON b.id = f.barber_id JOIN users u ON u.id = b.user_id WHERE f.user_id = $1`, [uid]),
    one(`SELECT loyalty_points, (SELECT COALESCE(sum(points),0)::int FROM loyalty_transactions WHERE user_id = $1 AND points > 0 AND reason NOT LIKE 'Points restored%') AS lifetime,
                (SELECT count(*)::int FROM appointments WHERE customer_id = $1 AND status = 'completed') AS visits,
             (SELECT count(*)::int FROM appointments WHERE customer_id = $1 AND start_at >= now() AND status IN ('pending','confirmed','checked_in')) AS upcoming_count
           FROM users WHERE id = $1`, [uid]),
    activeMembership(uid),
  ]);
  const { loyalty_redeem_rate: rate } = await getSettings();
  res.json({ upcoming, past, favorites, membership,
    upcomingCount: user.upcoming_count,
    rewards: { points: user.loyalty_points, lifetime: user.lifetime, visits: user.visits, tier: tierFor(user.lifetime), cashValue: Math.round(user.loyalty_points * rate * 100) / 100 } });
}));

// ------------------------------------------------------------ reviews
router.post('/reviews', authenticate, authorize('customer'), validate({
  body: z.object({ appointmentId: uuid, rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() }),
}), asyncHandler(async (req, res) => {
  const appt = await one('SELECT * FROM appointments WHERE id = $1 AND customer_id = $2', [req.body.appointmentId, req.user.id]);
  if (!appt) throw ApiError.notFound('Appointment not found');
  if (appt.status !== 'completed') throw ApiError.badRequest('You can review an appointment once it is completed');
  if (await one('SELECT 1 FROM reviews WHERE appointment_id = $1', [appt.id])) throw ApiError.conflict('You have already reviewed this appointment');
  const settings = await getSettings();
  const review = await withTransaction(async (c) => {
    const { rows: [r] } = await c.query(
      'INSERT INTO reviews (appointment_id, customer_id, barber_id, rating, comment) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [appt.id, req.user.id, appt.barber_id, req.body.rating, req.body.comment || null]);
    await refreshRating(c, appt.barber_id);
    await adjustPoints(c, { userId: req.user.id, points: settings.review_bonus_points, reason: 'Review bonus', appointmentId: appt.id });
    return r;
  });
  res.status(201).json({ review, bonusPoints: settings.review_bonus_points });
}));

/** Review management (admin: all; barber: own). */
router.get('/reviews', authenticate, authorize('admin', 'barber'), asyncHandler(async (req, res) => {
  const scope = req.user.role === 'barber' ? req.user.barber_id : null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
  const [reviews, { n }] = await Promise.all([
    many(`SELECT r.*, u.name AS customer_name, bu.name AS barber_name
            FROM reviews r JOIN users u ON u.id = r.customer_id JOIN barbers b ON b.id = r.barber_id JOIN users bu ON bu.id = b.user_id
           WHERE ($1::uuid IS NULL OR r.barber_id = $1) ORDER BY r.created_at DESC LIMIT $2`, [scope, limit]),
    one('SELECT count(*)::int AS n FROM reviews WHERE ($1::uuid IS NULL OR barber_id = $1)', [scope]),
  ]);
  res.json({ reviews, total: n });
}));

router.patch('/reviews/:id/visibility', authenticate, authorize('admin'), validate({ params: idParam, body: z.object({ is_visible: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const r = await one('UPDATE reviews SET is_visible = $2 WHERE id = $1 RETURNING *', [req.params.id, req.body.is_visible]);
    if (!r) throw ApiError.notFound('Review not found');
    await refreshRating({ query }, r.barber_id);
    res.json({ review: r });
  }));

router.patch('/reviews/:id/reply', authenticate, authorize('barber', 'admin'), validate({ params: idParam, body: z.object({ reply: z.string().min(1).max(1000) }) }),
  asyncHandler(async (req, res) => {
    const r = await one('UPDATE reviews SET barber_reply = $2 WHERE id = $1 AND ($3::uuid IS NULL OR barber_id = $3) RETURNING *',
      [req.params.id, req.body.reply, req.user.role === 'barber' ? req.user.barber_id : null]);
    if (!r) throw ApiError.notFound('Review not found');
    res.json({ review: r });
  }));

router.delete('/reviews/:id', authenticate, authorize('admin'), validate({ params: idParam }), asyncHandler(async (req, res) => {
  const r = await one('DELETE FROM reviews WHERE id = $1 RETURNING barber_id', [req.params.id]);
  if (r) await refreshRating({ query }, r.barber_id);
  res.status(204).end();
}));

// ------------------------------------------------------------ favourites
router.get('/favorites', authenticate, asyncHandler(async (req, res) => {
  res.json({ favorites: await many(
    `SELECT b.id, u.name, b.title, COALESCE(b.photo_url, u.avatar_url) AS photo_url, b.rating_avg, b.rating_count, b.specialties
       FROM favorites f JOIN barbers b ON b.id = f.barber_id JOIN users u ON u.id = b.user_id
      WHERE f.user_id = $1 ORDER BY f.created_at DESC`, [req.user.id]) });
}));
router.post('/favorites/:id', authenticate, validate({ params: idParam }), asyncHandler(async (req, res) => {
  await query('INSERT INTO favorites (user_id, barber_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]);
  res.status(201).json({ ok: true });
}));
router.delete('/favorites/:id', authenticate, validate({ params: idParam }), asyncHandler(async (req, res) => {
  await query('DELETE FROM favorites WHERE user_id = $1 AND barber_id = $2', [req.user.id, req.params.id]);
  res.status(204).end();
}));

// ------------------------------------------------------------ loyalty
router.get('/loyalty', authenticate, asyncHandler(async (req, res) => {
  const s = await getSettings();
  const u = await one(`SELECT loyalty_points, (SELECT COALESCE(sum(points),0)::int FROM loyalty_transactions WHERE user_id = $1 AND points > 0 AND reason NOT LIKE 'Points restored%') AS lifetime FROM users WHERE id = $1`, [req.user.id]);
  const history = await many('SELECT * FROM loyalty_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  res.json({
    points: u.loyalty_points, lifetime: u.lifetime, tier: tierFor(u.lifetime), history,
    rules: { perDollar: s.loyalty_points_per_dollar, redeemRate: s.loyalty_redeem_rate, minRedeem: s.loyalty_min_redeem, reviewBonus: s.review_bonus_points },
    cashValue: Math.round(u.loyalty_points * s.loyalty_redeem_rate * 100) / 100,
  });
}));

// ------------------------------------------------------------ notifications
router.get('/notifications', authenticate, asyncHandler(async (req, res) => {
  const [items, unread] = await Promise.all([
    many('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]),
    one('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND NOT is_read', [req.user.id]),
  ]);
  res.json({ notifications: items, unread: unread.n });
}));
router.patch('/notifications/read-all', authenticate, asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
}));
router.patch('/notifications/:id/read', authenticate, validate({ params: idParam }), asyncHandler(async (req, res) => {
  await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------ waiting list
router.post('/waitlist', authenticate, authorize('customer'), validate({
  body: z.object({ barberId: uuid.optional().nullable(), serviceId: uuid, desiredDate: dateStr }),
}), asyncHandler(async (req, res) => {
  const today = dayjs().tz((await getSettings()).default_timezone).format('YYYY-MM-DD');
  if (req.body.desiredDate < today) throw ApiError.badRequest('Choose today or a future date for the waiting list');
  const dup = await one("SELECT id FROM waitlist WHERE customer_id = $1 AND desired_date = $2 AND status = 'waiting'", [req.user.id, req.body.desiredDate]);
  if (dup) throw ApiError.conflict('You are already on the waiting list for that day');
  res.status(201).json({ entry: await one(
    'INSERT INTO waitlist (customer_id, barber_id, service_id, desired_date) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, req.body.barberId || null, req.body.serviceId, req.body.desiredDate]) });
}));
router.get('/waitlist', authenticate, asyncHandler(async (req, res) => {
  const filter = { customer: 'w.customer_id = $1', barber: '(w.barber_id = $1 OR w.barber_id IS NULL)', admin: '$1::uuid IS NOT NULL' }[req.user.role];
  res.json({ waitlist: await many(
    `SELECT w.*, u.name AS customer_name, s.name AS service_name, bu.name AS barber_name
       FROM waitlist w JOIN users u ON u.id = w.customer_id JOIN services s ON s.id = w.service_id
       LEFT JOIN barbers b ON b.id = w.barber_id LEFT JOIN users bu ON bu.id = b.user_id
      WHERE ${filter} AND w.desired_date >= current_date AND w.status IN ('waiting','notified') ORDER BY w.desired_date, w.created_at`,
    [req.user.role === 'barber' ? req.user.barber_id : req.user.id]) });
}));
router.delete('/waitlist/:id', authenticate, validate({ params: idParam }), asyncHandler(async (req, res) => {
  await query("UPDATE waitlist SET status = 'cancelled' WHERE id = $1 AND (customer_id = $2 OR $3)", [req.params.id, req.user.id, req.user.role === 'admin']);
  res.status(204).end();
}));

export default router;
