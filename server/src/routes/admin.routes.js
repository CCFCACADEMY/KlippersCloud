/**
 * Admin module: dashboard KPIs, user management (suspend/activate, roles),
 * barber onboarding/approval, coupons and business settings.
 * Every route here requires role = admin.
 */
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { one, many, query, withTransaction } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { idParam, uuid, email, phone, password, isoDate } from '../validators/common.js';
import { getSettings, updateSettings, DEFAULT_SETTINGS } from '../services/settings.service.js';
import { notifyUser } from '../services/notification.service.js';
import { paginate } from '../utils/helpers.js';

const router = Router();
router.use(authenticate, authorize('admin'));

// ------------------------------------------------------------ dashboard
router.get('/dashboard', asyncHandler(async (_req, res) => {
  const [kpis, revenue, popular, barbers, recent, statusBreakdown] = await Promise.all([
    one(`SELECT
          (SELECT count(*)::int FROM appointments) AS total_bookings,
          (SELECT count(*)::int FROM appointments WHERE start_at::date = current_date AND status NOT IN ('cancelled','rejected')) AS today_bookings,
          (SELECT count(*)::int FROM appointments WHERE status = 'pending' AND start_at > now()) AS pending_requests,
          (SELECT COALESCE(sum(amount - refunded_amount),0) FROM payments WHERE status IN ('paid','partially_refunded')) AS total_revenue,
          (SELECT COALESCE(sum(amount - refunded_amount),0) FROM payments WHERE status IN ('paid','partially_refunded') AND paid_at::date >= current_date - 29) AS revenue_30d,
          (SELECT COALESCE(sum(amount - refunded_amount),0) FROM payments WHERE status IN ('paid','partially_refunded') AND paid_at::date >= current_date - 59 AND paid_at::date < current_date - 29) AS revenue_prev_30d,
          (SELECT count(DISTINCT customer_id)::int FROM appointments WHERE start_at > now() - interval '90 days' AND customer_id IS NOT NULL) AS active_customers,
          (SELECT count(*)::int FROM users WHERE role = 'customer') AS total_customers,
          (SELECT count(*)::int FROM barbers WHERE is_approved) AS active_barbers,
          (SELECT count(*)::int FROM barbers WHERE NOT is_approved) AS pending_barbers,
          (SELECT COALESCE(round(avg(rating)::numeric, 2), 0) FROM reviews WHERE is_visible) AS avg_rating`),
    many(`SELECT to_char(d, 'YYYY-MM-DD') AS date, COALESCE(sum(p.amount - p.refunded_amount), 0) AS revenue, count(p.id)::int AS payments
            FROM generate_series(current_date - 29, current_date, '1 day') d
            LEFT JOIN payments p ON p.paid_at::date = d AND p.status IN ('paid','partially_refunded')
           GROUP BY d ORDER BY d`),
    many(`SELECT s.name, sv.category, count(*)::int AS bookings, sum(s.price) AS revenue
            FROM appointment_services s JOIN appointments a ON a.id = s.appointment_id JOIN services sv ON sv.id = s.service_id
           WHERE a.status NOT IN ('cancelled','rejected') GROUP BY s.name, sv.category ORDER BY bookings DESC LIMIT 8`),
    many(`SELECT b.id, u.name, b.rating_avg, b.rating_count,
                 count(a.id) FILTER (WHERE a.status = 'completed')::int AS completed,
                 count(a.id) FILTER (WHERE a.status IN ('cancelled','no_show'))::int AS lost,
                 COALESCE(sum(a.total - a.tax) FILTER (WHERE a.status = 'completed'), 0) AS revenue
            FROM barbers b JOIN users u ON u.id = b.user_id LEFT JOIN appointments a ON a.barber_id = b.id
           WHERE b.is_approved GROUP BY b.id, u.name ORDER BY revenue DESC`),
    many(`SELECT a.id, a.start_at, a.status, a.total, COALESCE(u.name, a.guest_name) AS customer_name, bu.name AS barber_name
            FROM appointments a LEFT JOIN users u ON u.id = a.customer_id JOIN barbers b ON b.id = a.barber_id JOIN users bu ON bu.id = b.user_id
           ORDER BY a.created_at DESC LIMIT 8`),
    many('SELECT status, count(*)::int AS count FROM appointments GROUP BY status'),
  ]);
  res.json({ kpis, revenue, popular, barbers, recent, statusBreakdown });
}));

// ------------------------------------------------------------ users
router.get('/users', validate({
  query: z.object({ role: z.enum(['customer', 'barber', 'admin']).optional(), search: z.string().max(80).optional(),
    status: z.enum(['active', 'suspended']).optional(), page: z.coerce.number().optional(), limit: z.coerce.number().optional() }),
}), asyncHandler(async (req, res) => {
  const { limit, offset, page } = paginate(req.query, 25);
  const params = [req.query.role || null, req.query.search || null, req.query.status ? req.query.status === 'active' : null];
  const where = `WHERE ($1::user_role IS NULL OR u.role = $1)
     AND ($2::text IS NULL OR u.name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%')
     AND ($3::boolean IS NULL OR u.is_active = $3)`;
  const users = await many(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.loyalty_points, u.created_at, u.last_login_at,
            (SELECT count(*)::int FROM appointments a WHERE a.customer_id = u.id) AS bookings,
            (SELECT COALESCE(sum(total),0) FROM appointments a WHERE a.customer_id = u.id AND a.status = 'completed') AS spent
       FROM users u ${where} ORDER BY u.created_at DESC LIMIT $4 OFFSET $5`, [...params, limit, offset]);
  const { count } = await one(`SELECT count(*)::int AS count FROM users u ${where}`, params);
  res.json({ users, total: count, page });
}));

/** Suspend / activate a user. Suspension also revokes their sessions. */
router.patch('/users/:id/status', validate({ params: idParam, body: z.object({ is_active: z.boolean() }) }), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw ApiError.badRequest('You cannot suspend yourself');
  const u = await one('UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING id, name, is_active', [req.params.id, req.body.is_active]);
  if (!u) throw ApiError.notFound('User not found');
  if (!u.is_active) await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [u.id]);
  res.json({ user: u });
}));

router.patch('/users/:id/role', validate({ params: idParam, body: z.object({ role: z.enum(['customer', 'barber', 'admin']) }) }), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw ApiError.badRequest('You cannot change your own role');
  const u = await withTransaction(async (c) => {
    const { rows: [user] } = await c.query('UPDATE users SET role = $2 WHERE id = $1 RETURNING id, name, role', [req.params.id, req.body.role]);
    if (!user) throw ApiError.notFound('User not found');
    if (req.body.role === 'barber') {
      await c.query('INSERT INTO barbers (user_id, is_approved) VALUES ($1, TRUE) ON CONFLICT (user_id) DO NOTHING', [user.id]);
    }
    return user;
  });
  res.json({ user: u });
}));

/** Award or deduct loyalty points manually. */
router.post('/users/:id/points', validate({ params: idParam, body: z.object({ points: z.number().int('Points must be a whole number').refine((n) => n !== 0, 'Points cannot be 0'), reason: z.string().min(2).max(200) }) }),
  asyncHandler(async (req, res) => {
    await withTransaction(async (c) => {
      await c.query('INSERT INTO loyalty_transactions (user_id, points, reason) VALUES ($1,$2,$3)', [req.params.id, req.body.points, req.body.reason]);
      await c.query('UPDATE users SET loyalty_points = GREATEST(loyalty_points + $2, 0) WHERE id = $1', [req.params.id, req.body.points]);
    });
    res.json({ ok: true });
  }));

// ------------------------------------------------------------ barbers
router.get('/barbers', asyncHandler(async (_req, res) => {
  res.json({ barbers: await many(
    `SELECT b.*, u.name, u.email, u.phone, u.is_active, l.name AS location_name,
            (SELECT count(*)::int FROM appointments a WHERE a.barber_id = b.id AND a.status = 'completed') AS completed
       FROM barbers b JOIN users u ON u.id = b.user_id LEFT JOIN locations l ON l.id = b.location_id ORDER BY b.is_approved, u.name`) });
}));

/** Create a barber account directly (pre-approved). */
/**
 * Barber photo: an https URL, or an uploaded image sent as a data URL
 * (the admin UI resizes uploads to ~400px JPEG, typically 20–60 KB).
 */
const photo = z.string().max(400_000).refine(
  (v) => /^(https:\/\/\S+|\/images\/[\w./-]+)$/i.test(v) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
  'Photo must be an https URL or an uploaded JPEG/PNG/WebP image',
);
const barberProfile = {
  title: z.string().trim().max(60).optional(),
  bio: z.string().max(2000).optional().nullable(),
  experience_years: z.coerce.number().int().min(0).max(70).optional(),
  specialties: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  photo_url: photo.optional().nullable(),
  location_id: uuid.optional().nullable(),
  commission_rate: z.coerce.number().min(0).max(100).optional(),
  auto_confirm: z.boolean().optional(),
};

router.post('/barbers', validate({
  body: z.object({ name: z.string().trim().min(2).max(80), email, phone: phone.optional(), password, ...barberProfile }),
}), asyncHandler(async (req, res) => {
  const b = req.body;
  const barber = await withTransaction(async (c) => {
    const { rows: [u] } = await c.query(
      "INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1,$2,$3,$4,'barber') RETURNING id",
      [b.name, b.email, b.phone || null, await bcrypt.hash(b.password, 12)]);
    const { rows: [br] } = await c.query(
      `INSERT INTO barbers (user_id, location_id, title, bio, experience_years, specialties, photo_url, commission_rate, auto_confirm, is_approved)
       VALUES ($1,$2,COALESCE($3,'Barber'),$4,COALESCE($5,0),COALESCE($6::text[],'{}'),$7,COALESCE($8,60),COALESCE($9,FALSE),TRUE) RETURNING *`,
      [u.id, b.location_id || null, b.title || null, b.bio || null, b.experience_years, b.specialties, b.photo_url || null, b.commission_rate, b.auto_confirm]);
    await c.query(`INSERT INTO working_hours (barber_id, day_of_week, is_off) SELECT $1, d, d = 0 FROM generate_series(0,6) d`, [br.id]);
    await c.query('INSERT INTO barber_services (barber_id, service_id) SELECT $1, id FROM services WHERE is_active', [br.id]);
    return br;
  });
  res.status(201).json({ barber });
}));

router.patch('/barbers/:id', validate({
  params: idParam,
  body: z.object({ is_approved: z.boolean().optional(), name: z.string().trim().min(2).max(80).optional(), phone: phone.optional().nullable(), ...barberProfile }),
}), asyncHandler(async (req, res) => {
  const before = await one('SELECT * FROM barbers WHERE id = $1', [req.params.id]);
  if (!before) throw ApiError.notFound('Barber not found');
  const { name, phone: tel, ...fields } = req.body;
  const e = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!e.length && name === undefined && tel === undefined) throw ApiError.badRequest('Nothing to update');
  const barber = await withTransaction(async (c) => {
    if (name !== undefined || tel !== undefined) {
      await c.query('UPDATE users SET name = COALESCE($2, name), phone = CASE WHEN $3 THEN $4 ELSE phone END, updated_at = now() WHERE id = $1',
        [before.user_id, name ?? null, tel !== undefined, tel ?? null]);
    }
    if (!e.length) return (await c.query('SELECT * FROM barbers WHERE id = $1', [req.params.id])).rows[0];
    // Keys are whitelisted by the Zod schema above
    return (await c.query(`UPDATE barbers SET ${e.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [req.params.id, ...e.map(([, v]) => v)])).rows[0];
  });
  if (!before.is_approved && barber.is_approved) {
    // Newly approved: offer all services by default and notify
    await query('INSERT INTO barber_services (barber_id, service_id) SELECT $1, id FROM services WHERE is_active ON CONFLICT DO NOTHING', [barber.id]);
    notifyUser(barber.user_id, { type: 'barber_approved', title: 'You are approved!', body: 'Your barber profile is now live on Klippers. Set your hours to start taking bookings.' });
  }
  res.json({ barber });
}));

// ------------------------------------------------------------ coupons
const couponBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Code: 3-30 letters/numbers'),
  description: z.string().max(200).optional().nullable(),
  discount_type: z.enum(['percent', 'fixed']),
  discount_value: z.coerce.number().positive().max(10000),
  min_amount: z.coerce.number().min(0).optional(),
  max_uses: z.coerce.number().int().positive().optional().nullable(),
  per_user_limit: z.coerce.number().int().positive().optional(),
  valid_from: isoDate.optional(), valid_until: isoDate.optional().nullable(),
  is_active: z.boolean().optional(),
}).refine((c) => c.discount_type !== 'percent' || c.discount_value <= 100, { message: 'Percent discount cannot exceed 100', path: ['discount_value'] });

router.get('/coupons', asyncHandler(async (_req, res) => res.json({ coupons: await many('SELECT * FROM coupons ORDER BY created_at DESC') })));

router.post('/coupons', validate({ body: couponBody }), asyncHandler(async (req, res) => {
  const c = req.body;
  res.status(201).json({ coupon: await one(
    `INSERT INTO coupons (code, description, discount_type, discount_value, min_amount, max_uses, per_user_limit, valid_from, valid_until, is_active)
     VALUES ($1,$2,$3,$4,COALESCE($5,0),$6,COALESCE($7,1),COALESCE($8,now()),$9,COALESCE($10,TRUE)) RETURNING *`,
    [c.code, c.description, c.discount_type, c.discount_value, c.min_amount, c.max_uses, c.per_user_limit, c.valid_from, c.valid_until, c.is_active]) });
}));

router.patch('/coupons/:id', validate({ params: idParam, body: z.object({ is_active: z.boolean().optional(), max_uses: z.number().int().positive().nullable().optional(), valid_until: isoDate.nullable().optional(), description: z.string().max(200).optional() }) }),
  asyncHandler(async (req, res) => {
    const e = Object.entries(req.body).filter(([, v]) => v !== undefined);
    if (!e.length) throw ApiError.badRequest('Nothing to update');
    res.json({ coupon: await one(`UPDATE coupons SET ${e.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [req.params.id, ...e.map(([, v]) => v)]) });
  }));

router.delete('/coupons/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  await query('UPDATE coupons SET is_active = FALSE WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

// ------------------------------------------------------------ settings
router.get('/settings', asyncHandler(async (_req, res) => res.json({ settings: await getSettings(), keys: Object.keys(DEFAULT_SETTINGS) })));

router.put('/settings', validate({
  body: z.object({
    business_name: z.string().min(2).max(80).optional(), currency: z.string().length(3).optional(),
    tax_rate: z.number().min(0).max(50).optional(), booking_lead_minutes: z.number().int().min(0).max(10080).optional(),
    booking_window_days: z.number().int().min(1).max(365).optional(), cancellation_window_hours: z.number().min(0).max(168).optional(),
    loyalty_points_per_dollar: z.number().min(0).max(100).optional(), loyalty_redeem_rate: z.number().min(0).max(10).optional(),
    loyalty_min_redeem: z.number().int().min(0).optional(), review_bonus_points: z.number().int().min(0).max(1000).optional(),
    default_timezone: z.string().max(60).optional(), whatsapp_enabled: z.boolean().optional(),
    contact_email: email.optional(), contact_phone: z.string().max(30).optional(),
  }),
}), asyncHandler(async (req, res) => res.json({ settings: await updateSettings(req.body) })));

export default router;
