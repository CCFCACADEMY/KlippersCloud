/**
 * Barbers — public directory/profile/availability plus the barber's own
 * self-service endpoints under /barbers/me (profile, hours, time off,
 * services, dashboard stats, customer notes & history).
 */
import { Router } from 'express';
import { z } from 'zod';
import { one, many, query, withTransaction } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize, optionalAuth, requireBarberProfile } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { idParam, uuid, dateStr, timeStr } from '../validators/common.js';
import { getSlots, getBarberContext } from '../services/availability.service.js';
import { resolveServices } from '../services/pricing.service.js';
import { dayjs } from '../utils/time.js';
import { emit } from '../services/socket.js';
import { APPT_SELECT } from './appointments.routes.js';

const router = Router();

const BARBER_SELECT = `
  SELECT b.id, b.user_id, u.name, u.email, u.phone, u.avatar_url, b.title, b.bio, b.experience_years,
         b.specialties, COALESCE(b.photo_url, u.avatar_url) AS photo_url, b.rating_avg, b.rating_count,
         b.location_id, l.name AS location_name, l.city AS location_city, b.auto_confirm, b.slot_interval,
         b.is_approved, u.is_active
    FROM barbers b JOIN users u ON u.id = b.user_id LEFT JOIN locations l ON l.id = b.location_id`;

// ======================================================== barber self-service
// (declared before /:id so "me" isn't parsed as an id)
const me = Router();
me.use(authenticate, authorize('barber'), requireBarberProfile);

me.get('/', asyncHandler(async (req, res) => {
  const barber = await one(`${BARBER_SELECT} WHERE b.id = $1`, [req.user.barber_id]);
  const hours = await many('SELECT * FROM working_hours WHERE barber_id = $1 ORDER BY day_of_week', [req.user.barber_id]);
  const services = await many(
    `SELECT s.id, s.name, s.category, s.price AS base_price, s.duration_min AS base_duration,
            bs.custom_price, bs.custom_duration, (bs.service_id IS NOT NULL) AS offered
       FROM services s LEFT JOIN barber_services bs ON bs.service_id = s.id AND bs.barber_id = $1
      WHERE s.is_active ORDER BY s.sort_order, s.name`, [req.user.barber_id]);
  const timeOff = await many('SELECT * FROM time_off WHERE barber_id = $1 AND end_date >= current_date ORDER BY start_date', [req.user.barber_id]);
  res.json({ barber, hours, services, timeOff });
}));

me.patch('/', validate({
  body: z.object({
    title: z.string().max(60).optional(), bio: z.string().max(2000).optional().nullable(),
    experience_years: z.coerce.number().int().min(0).max(70).optional(),
    specialties: z.array(z.string().max(40)).max(12).optional(),
    photo_url: z.string().max(400_000).refine((v) => /^(https:\/\/\S+|\/images\/[\w./-]+)$/i.test(v) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v), 'Photo must be an https URL or an uploaded image').optional().nullable(),
    auto_confirm: z.boolean().optional(),
    slot_interval: z.coerce.number().refine((v) => [5, 10, 15, 20, 30, 60].includes(v)).optional(),
  }),
}), asyncHandler(async (req, res) => {
  const e = Object.entries(req.body).filter(([, v]) => v !== undefined);
  if (e.length) {
    await query(`UPDATE barbers SET ${e.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [req.user.barber_id, ...e.map(([, v]) => v)]);
  }
  res.json({ barber: await one(`${BARBER_SELECT} WHERE b.id = $1`, [req.user.barber_id]) });
}));

// Replace weekly working hours
me.put('/hours', validate({
  body: z.object({
    hours: z.array(z.object({
      day_of_week: z.number().int().min(0).max(6), is_off: z.boolean(),
      start_time: timeStr, end_time: timeStr,
      break_start: timeStr.optional().nullable(), break_end: timeStr.optional().nullable(),
    })).length(7),
  }),
}), asyncHandler(async (req, res) => {
  for (const h of req.body.hours) {
    if (!h.is_off && h.end_time <= h.start_time) throw ApiError.badRequest(`${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][h.day_of_week]}: end time must be after start time`);
    if ((h.break_start && !h.break_end) || (h.break_start && h.break_end <= h.break_start)) throw ApiError.badRequest('Invalid break time');
  }
  await withTransaction(async (c) => {
    for (const h of req.body.hours) {
      await c.query(
        `INSERT INTO working_hours (barber_id, day_of_week, is_off, start_time, end_time, break_start, break_end)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (barber_id, day_of_week) DO UPDATE SET is_off = EXCLUDED.is_off, start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time, break_start = EXCLUDED.break_start, break_end = EXCLUDED.break_end`,
        [req.user.barber_id, h.day_of_week, h.is_off, h.start_time, h.end_time, h.break_start || null, h.break_end || null],
      );
    }
  });
  emit(`barber:${req.user.barber_id}`, 'slots:changed', { barberId: req.user.barber_id });
  res.json({ hours: await many('SELECT * FROM working_hours WHERE barber_id = $1 ORDER BY day_of_week', [req.user.barber_id]) });
}));

// Vacation / unavailable dates
me.post('/time-off', validate({ body: z.object({ start_date: dateStr, end_date: dateStr, reason: z.string().max(200).optional() }) }),
  asyncHandler(async (req, res) => {
    const { start_date, end_date, reason } = req.body;
    if (end_date < start_date) throw ApiError.badRequest('End date must be on or after start date');
    const clash = await one(
      `SELECT count(*)::int AS n FROM appointments
        WHERE barber_id = $1 AND status IN ('pending','confirmed') AND start_at::date BETWEEN $2 AND $3`,
      [req.user.barber_id, start_date, end_date]);
    const row = await one('INSERT INTO time_off (barber_id, start_date, end_date, reason) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.barber_id, start_date, end_date, reason || null]);
    emit(`barber:${req.user.barber_id}`, 'slots:changed', { barberId: req.user.barber_id });
    res.status(201).json({ timeOff: row, warning: clash.n ? `${clash.n} existing appointment(s) fall in this period — please reschedule them.` : null });
  }));

me.delete('/time-off/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  await query('DELETE FROM time_off WHERE id = $1 AND barber_id = $2', [req.params.id, req.user.barber_id]);
  emit(`barber:${req.user.barber_id}`, 'slots:changed', { barberId: req.user.barber_id });
  res.status(204).end();
}));

// Choose offered services and optional custom price/duration
me.put('/services', validate({
  body: z.object({
    services: z.array(z.object({
      service_id: uuid,
      custom_price: z.coerce.number().min(0).max(10000).optional().nullable(),
      custom_duration: z.coerce.number().int().min(5).max(480).optional().nullable(),
    })).max(100),
  }),
}), asyncHandler(async (req, res) => {
  await withTransaction(async (c) => {
    await c.query('DELETE FROM barber_services WHERE barber_id = $1', [req.user.barber_id]);
    for (const s of req.body.services) {
      await c.query('INSERT INTO barber_services (barber_id, service_id, custom_price, custom_duration) VALUES ($1,$2,$3,$4)',
        [req.user.barber_id, s.service_id, s.custom_price ?? null, s.custom_duration ?? null]);
    }
  });
  res.json({ ok: true });
}));

// Dashboard: today's schedule, stats, revenue chart, customer analytics
me.get('/dashboard', asyncHandler(async (req, res) => {
  const id = req.user.barber_id;
  const ctx = await getBarberContext(id);
  const tz = ctx.timezone;
  const todayStart = dayjs().tz(tz).startOf('day').toDate();
  const todayEnd = dayjs().tz(tz).endOf('day').toDate();

  const [today, stats, revenue, topCustomers, pending, statusBreakdown] = await Promise.all([
    many(`${APPT_SELECT} WHERE a.barber_id = $1 AND a.start_at BETWEEN $2 AND $3 AND a.status NOT IN ('cancelled','rejected')
           ORDER BY a.start_at`, [id, todayStart, todayEnd]),
    one(`SELECT
            count(*) FILTER (WHERE status = 'completed')::int AS completed,
            count(*) FILTER (WHERE status IN ('pending','confirmed') AND start_at > now())::int AS upcoming,
            count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
            count(*) FILTER (WHERE status = 'no_show')::int AS no_shows,
            COALESCE(sum(total - tax) FILTER (WHERE status = 'completed'), 0) AS gross_revenue,
            COALESCE(sum(total - tax) FILTER (WHERE status = 'completed' AND start_at >= date_trunc('month', now())), 0) AS month_revenue,
            count(DISTINCT customer_id)::int AS unique_customers
          FROM appointments WHERE barber_id = $1`, [id]),
    many(`SELECT to_char(d, 'YYYY-MM-DD') AS date,
                 COALESCE(sum(a.total - a.tax), 0) AS revenue, count(a.id)::int AS appointments
            FROM generate_series(current_date - 29, current_date, '1 day') d
            LEFT JOIN appointments a ON a.barber_id = $1 AND a.status = 'completed' AND a.start_at::date = d
           GROUP BY d ORDER BY d`, [id]),
    many(`SELECT u.id, u.name, count(*)::int AS visits, sum(a.total - a.tax) AS spent, max(a.start_at) AS last_visit
            FROM appointments a JOIN users u ON u.id = a.customer_id
           WHERE a.barber_id = $1 AND a.status = 'completed'
           GROUP BY u.id ORDER BY visits DESC, spent DESC LIMIT 5`, [id]),
    many(`${APPT_SELECT} WHERE a.barber_id = $1 AND a.status = 'pending' AND a.start_at > now() ORDER BY a.start_at LIMIT 20`, [id]),
    many(`SELECT status, count(*)::int AS count FROM appointments WHERE barber_id = $1 GROUP BY status`, [id]),
  ]);
  const commission = Number(ctx.commission_rate) / 100;
  const repeat = await one(
    `SELECT count(*) FILTER (WHERE n > 1)::int AS repeat, count(*)::int AS total
       FROM (SELECT customer_id, count(*) n FROM appointments WHERE barber_id = $1 AND status = 'completed' AND customer_id IS NOT NULL GROUP BY customer_id) t`, [id]);
  res.json({
    today, pending, revenue, topCustomers, statusBreakdown,
    stats: { ...stats, earnings: Math.round(stats.gross_revenue * commission * 100) / 100,
      month_earnings: Math.round(stats.month_revenue * commission * 100) / 100,
      commission_rate: Number(ctx.commission_rate),
      repeat_rate: repeat.total ? Math.round((repeat.repeat / repeat.total) * 100) : 0 },
  });
}));

// Customers this barber has served
me.get('/customers', asyncHandler(async (req, res) => {
  res.json({ customers: await many(
    // visits/spent count completed visits only (spent excludes tax, matching the dashboard); next_visit is the next booking
    `SELECT u.id, u.name, u.email, u.phone,
            count(a.id) FILTER (WHERE a.status = 'completed')::int AS visits,
            max(a.start_at) FILTER (WHERE a.status = 'completed') AS last_visit,
            min(a.start_at) FILTER (WHERE a.start_at >= now() AND a.status IN ('pending','confirmed','checked_in')) AS next_visit,
            COALESCE(sum(a.total - a.tax) FILTER (WHERE a.status = 'completed'), 0) AS spent
       FROM appointments a JOIN users u ON u.id = a.customer_id
      WHERE a.barber_id = $1 GROUP BY u.id ORDER BY last_visit DESC NULLS LAST, u.name`, [req.user.barber_id]) });
}));

me.get('/customers/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  // Barbers may only see people who have booked with them
  const customer = await one(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at FROM users u
      WHERE u.id = $1 AND EXISTS (SELECT 1 FROM appointments a WHERE a.customer_id = u.id AND a.barber_id = $2)`,
    [req.params.id, req.user.barber_id]);
  if (!customer) throw ApiError.notFound('Customer not found');
  const [history, notes] = await Promise.all([
    many(`SELECT a.id, a.start_at, a.status, a.total, a.notes,
                 (SELECT string_agg(name, ', ') FROM appointment_services WHERE appointment_id = a.id) AS services
            FROM appointments a WHERE a.customer_id = $1 AND a.barber_id = $2 ORDER BY a.start_at DESC`, [req.params.id, req.user.barber_id]),
    many('SELECT * FROM customer_notes WHERE customer_id = $1 AND barber_id = $2 ORDER BY created_at DESC', [req.params.id, req.user.barber_id]),
  ]);
  res.json({ customer, history, notes });
}));

me.post('/customers/:id/notes', validate({ params: idParam, body: z.object({ note: z.string().min(1).max(2000) }) }),
  asyncHandler(async (req, res) => {
    const isCustomer = await one('SELECT 1 FROM appointments WHERE customer_id = $1 AND barber_id = $2 LIMIT 1', [req.params.id, req.user.barber_id]);
    if (!isCustomer) throw ApiError.notFound('Customer not found');
    res.status(201).json({ note: await one(
      'INSERT INTO customer_notes (barber_id, customer_id, note) VALUES ($1,$2,$3) RETURNING *',
      [req.user.barber_id, req.params.id, req.body.note]) });
  }));

me.delete('/customers/:customerId/notes/:id', asyncHandler(async (req, res) => {
  await query('DELETE FROM customer_notes WHERE id = $1 AND barber_id = $2', [req.params.id, req.user.barber_id]);
  res.status(204).end();
}));

router.use('/me', me);

// ======================================================== public directory
router.get('/', optionalAuth, validate({
  query: z.object({
    locationId: uuid.optional(), serviceId: uuid.optional(), search: z.string().max(80).optional(),
    sort: z.enum(['rating', 'experience', 'name']).optional(),
  }),
}), asyncHandler(async (req, res) => {
  const { locationId, serviceId, search, sort } = req.query;
  const order = { rating: 'b.rating_avg DESC, b.rating_count DESC', experience: 'b.experience_years DESC', name: 'u.name' }[sort || 'rating'];
  const rows = await many(
    `${BARBER_SELECT}
      WHERE b.is_approved AND u.is_active
        AND ($1::uuid IS NULL OR b.location_id = $1)
        AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM barber_services bs WHERE bs.barber_id = b.id AND bs.service_id = $2))
        AND ($3::text IS NULL OR u.name ILIKE '%' || $3 || '%' OR array_to_string(b.specialties, ' ') ILIKE '%' || $3 || '%')
      ORDER BY ${order}`,
    [locationId || null, serviceId || null, search || null],
  );
  let favorites = new Set();
  if (req.user) favorites = new Set((await many('SELECT barber_id FROM favorites WHERE user_id = $1', [req.user.id])).map((f) => f.barber_id));
  res.json({ barbers: rows.map(({ email, phone, ...b }) => ({ ...b, is_favorite: favorites.has(b.id) })) });
}));

router.get('/:id', optionalAuth, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const barber = await one(`${BARBER_SELECT} WHERE b.id = $1`, [req.params.id]);
  if (!barber || ((!barber.is_approved || !barber.is_active) && req.user?.role !== 'admin')) throw ApiError.notFound('Barber not found');
  delete barber.email; delete barber.phone;
  const [services, hours, reviews, gallery, fav, completed] = await Promise.all([
    many(`SELECT s.id, s.name, s.category, s.description, s.image_url,
                 COALESCE(bs.custom_price, s.price) AS price, COALESCE(bs.custom_duration, s.duration_min) AS duration_min
            FROM barber_services bs JOIN services s ON s.id = bs.service_id
           WHERE bs.barber_id = $1 AND s.is_active ORDER BY s.sort_order, s.name`, [req.params.id]),
    many('SELECT day_of_week, is_off, start_time, end_time FROM working_hours WHERE barber_id = $1 ORDER BY day_of_week', [req.params.id]),
    many(`SELECT r.id, r.rating, r.comment, r.barber_reply, r.created_at, u.name AS customer_name
            FROM reviews r JOIN users u ON u.id = r.customer_id
           WHERE r.barber_id = $1 AND r.is_visible ORDER BY r.created_at DESC LIMIT 20`, [req.params.id]),
    many('SELECT * FROM gallery_items WHERE barber_id = $1 ORDER BY created_at DESC LIMIT 12', [req.params.id]),
    req.user ? one('SELECT 1 FROM favorites WHERE user_id = $1 AND barber_id = $2', [req.user.id, req.params.id]) : null,
    one("SELECT count(*)::int AS n FROM appointments WHERE barber_id = $1 AND status = 'completed'", [req.params.id]),
  ]);
  res.json({ barber: { ...barber, is_favorite: !!fav, completed_cuts: completed.n }, services, hours, reviews, gallery });
}));

/**
 * GET /barbers/:id/availability?date=YYYY-MM-DD&serviceIds=a,b
 * Returns every slot of the day with an `available` flag (booked slots shown greyed out in UI).
 */
router.get('/:id/availability', validate({
  params: idParam,
  query: z.object({
    date: dateStr,
    serviceIds: z.string().optional(),
    duration: z.coerce.number().int().min(5).max(480).optional(),
    excludeAppointmentId: uuid.optional(),
  }),
}), asyncHandler(async (req, res) => {
  let duration = req.query.duration || 30;
  if (req.query.serviceIds) {
    const ids = req.query.serviceIds.split(',').filter(Boolean);
    if (!ids.every((i) => uuid.safeParse(i).success)) throw ApiError.badRequest('Invalid service id');
    duration = (await resolveServices(req.params.id, ids)).reduce((s, x) => s + x.duration_min, 0);
  }
  const result = await getSlots({ barberId: req.params.id, date: req.query.date, durationMin: duration, excludeAppointmentId: req.query.excludeAppointmentId });
  res.json({ ...result, date: req.query.date, duration });
}));

/** Month overview: which days have any open slot (for calendar dots). */
router.get('/:id/availability/month', validate({ params: idParam, query: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), duration: z.coerce.number().int().min(5).max(480).default(30) }) }),
  asyncHandler(async (req, res) => {
    const start = dayjs(`${req.query.month}-01`);
    const days = [];
    for (let d = start; d.month() === start.month(); d = d.add(1, 'day')) {
      const date = d.format('YYYY-MM-DD');
      if (d.isBefore(dayjs().subtract(1, 'day'), 'day')) { days.push({ date, open: 0 }); continue; }
      const { slots } = await getSlots({ barberId: req.params.id, date, durationMin: req.query.duration });
      days.push({ date, open: slots.filter((s) => s.available).length });
    }
    res.json({ days });
  }));

export default router;
