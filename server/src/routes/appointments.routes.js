/**
 * Appointments — the heart of Klippers.
 *
 * Booking workflow
 *   1. POST /appointments/quote      → price & duration preview (coupons, points, membership, tax)
 *   2. POST /appointments            → creates `pending` (or `confirmed` if barber auto-confirms)
 *   3. PATCH /:id/status confirmed   → barber accepts  (or `rejected`)
 *   4. POST /appointments/checkin    → QR / code check-in on arrival
 *   5. PATCH /:id/status in_progress → completed (awards loyalty points, settles cash)
 *
 * Double-booking is prevented twice: availability check for UX, and the
 * PostgreSQL exclusion constraint `appointments_no_overlap` for correctness
 * under concurrency.
 */
import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { one, many, query, withTransaction } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';
import { heavyLimiter } from '../middleware/rateLimit.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { idParam, uuid, email, phone, isoDate } from '../validators/common.js';
import { quote } from '../services/pricing.service.js';
import { assertSlotAvailable, getBarberContext } from '../services/availability.service.js';
import { notifyUser, notifyGuest } from '../services/notification.service.js';
import { adjustPoints } from '../services/loyalty.service.js';
import { refundPayment, nextInvoiceNumber } from '../services/payment.service.js';
import { getSettings } from '../services/settings.service.js';
import { emit } from '../services/socket.js';
import { dayjs } from '../utils/time.js';
import { paginate } from '../utils/helpers.js';
import { env } from '../config/env.js';

const router = Router();

export const APPT_SELECT = `
  SELECT a.*, COALESCE(cu.name, a.guest_name) AS customer_name, COALESCE(cu.email, a.guest_email) AS customer_email,
         COALESCE(cu.phone, a.guest_phone) AS customer_phone, bu.name AS barber_name, b.user_id AS barber_user_id,
         COALESCE(b.photo_url, bu.avatar_url) AS barber_photo, l.name AS location_name, l.timezone,
         COALESCE((SELECT json_agg(json_build_object('service_id', s.service_id, 'name', s.name, 'price', s.price, 'duration_min', s.duration_min))
                     FROM appointment_services s WHERE s.appointment_id = a.id), '[]') AS services,
         (SELECT p.status FROM payments p WHERE p.appointment_id = a.id ORDER BY p.created_at DESC LIMIT 1) AS payment_status,
         EXISTS (SELECT 1 FROM reviews r WHERE r.appointment_id = a.id) AS has_review
    FROM appointments a
    LEFT JOIN users cu ON cu.id = a.customer_id
    JOIN barbers b ON b.id = a.barber_id JOIN users bu ON bu.id = b.user_id
    LEFT JOIN locations l ON l.id = a.location_id`;

const getAppointment = (id) => one(`${APPT_SELECT} WHERE a.id = $1`, [id]);

/** Who may see / act on an appointment. */
function canAccess(user, appt) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'barber') return appt.barber_id === user.barber_id;
  return appt.customer_id === user.id;
}

const fmtWhen = (a) => dayjs(a.start_at).tz(a.timezone || 'Asia/Kolkata').format('ddd, MMM D [at] h:mm A');

/** Send the same message to the customer (user or guest). */
async function notifyCustomer(appt, type, title, body) {
  if (appt.customer_id) return notifyUser(appt.customer_id, { type, title, body, data: { appointmentId: appt.id } });
  return notifyGuest({ email: appt.customer_email, phone: appt.customer_phone }, title, body);
}

/** Tell waiting-list customers a slot opened up on that barber/day. */
async function notifyWaitlist(appt) {
  const date = dayjs(appt.start_at).tz(appt.timezone || 'Asia/Kolkata').format('YYYY-MM-DD');
  const waiting = await many(
    `UPDATE waitlist SET status = 'notified'
      WHERE id IN (SELECT id FROM waitlist WHERE status = 'waiting' AND desired_date = $1
                     AND (barber_id IS NULL OR barber_id = $2) ORDER BY created_at LIMIT 3)
      RETURNING customer_id`, [date, appt.barber_id]);
  for (const w of waiting) {
    notifyUser(w.customer_id, {
      type: 'waitlist_opening', title: 'A slot just opened up!',
      body: `${appt.barber_name} has a new opening on ${dayjs(date).format('ddd, MMM D')}. Book now before it's gone.`,
      data: { barberId: appt.barber_id, date },
    });
  }
}

const broadcastSlots = (barberId) => emit(`barber:${barberId}`, 'slots:changed', { barberId });

/** Give a coupon use back when its booking is cancelled or declined (so single-use codes aren't lost). */
async function releaseCoupon(db, appointmentId) {
  const { rows } = await db.query('DELETE FROM coupon_redemptions WHERE appointment_id = $1 RETURNING coupon_id', [appointmentId]);
  for (const r of rows) await db.query('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1', [r.coupon_id]);
}

/** Refund every online (card / gift card) payment on an appointment; void pending cash. Returns true if money was refunded. */
async function refundAppointment(appointmentId, reason) {
  const paid = await many("SELECT id FROM payments WHERE appointment_id = $1 AND status IN ('paid','partially_refunded') AND method <> 'cash'", [appointmentId]);
  for (const p of paid) await refundPayment(p.id, undefined, reason);
  await query("UPDATE payments SET status = 'failed', refund_reason = $2 WHERE appointment_id = $1 AND method = 'cash' AND status = 'pending'", [appointmentId, reason]);
  return paid.length > 0;
}

// ------------------------------------------------------------------ quote
const quoteSchema = z.object({
  barberId: uuid,
  serviceIds: z.array(uuid).min(1).max(6),
  couponCode: z.string().max(40).optional().nullable(),
  redeemPoints: z.coerce.number().int().min(0).optional(),
});

router.post('/quote', optionalAuth, validate({ body: quoteSchema }), asyncHandler(async (req, res) => {
  res.json({ quote: await quote({ ...req.body, userId: req.user?.id }) });
}));

// ------------------------------------------------------------------ create booking
const bookingSchema = quoteSchema.extend({
  startAt: isoDate,
  notes: z.string().max(500).optional().nullable(),
  // Guest checkout (no account) — required when not signed in
  guest: z.object({ name: z.string().min(2).max(80), email, phone }).optional(),
  // Staff booking on behalf of a registered customer
  customerId: uuid.optional(),
});

router.post('/', heavyLimiter, optionalAuth, validate({ body: bookingSchema }), asyncHandler(async (req, res) => {
  const { barberId, serviceIds, startAt, notes, couponCode, redeemPoints, guest } = req.body;
  const actor = req.user;
  const isStaff = actor && ['admin', 'barber'].includes(actor.role);
  if (actor?.role === 'barber' && actor.barber_id !== barberId) throw ApiError.forbidden('Barbers can only book into their own calendar');

  let customerId = null;
  let source = 'online';
  if (actor?.role === 'customer') customerId = actor.id;
  else if (isStaff) { customerId = req.body.customerId || null; source = 'admin'; }
  if (!customerId && !guest) throw ApiError.badRequest('Please sign in or provide guest details');
  if (!actor) source = 'guest';

  const q = await quote({ barberId, serviceIds, couponCode, userId: customerId, redeemPoints });
  const barber = await assertSlotAvailable({ barberId, startAt, durationMin: q.durationMin, ignoreLead: isStaff });
  const start = dayjs(startAt);
  const end = start.add(q.durationMin, 'minute');
  const status = barber.auto_confirm || isStaff ? 'confirmed' : 'pending';

  const id = await withTransaction(async (c) => {
    const { rows: [a] } = await c.query(
      `INSERT INTO appointments (customer_id, guest_name, guest_email, guest_phone, barber_id, location_id, start_at, end_at,
                                 status, source, notes, subtotal, discount, tax, total, coupon_id, points_redeemed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [customerId, customerId ? null : guest.name, customerId ? null : guest.email, customerId ? null : guest.phone,
        barberId, barber.location_id, start.toDate(), end.toDate(), status, source, notes || null,
        q.subtotal, q.discount, q.tax, q.total, q.coupon?.id || null, q.pointsUsed],
    );
    for (const s of q.items) {
      await c.query('INSERT INTO appointment_services (appointment_id, service_id, name, price, duration_min) VALUES ($1,$2,$3,$4,$5)',
        [a.id, s.id, s.name, s.price, s.duration_min]);
    }
    if (q.coupon) {
      await c.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [q.coupon.id]);
      await c.query('INSERT INTO coupon_redemptions (coupon_id, user_id, appointment_id, amount) VALUES ($1,$2,$3,$4)',
        [q.coupon.id, customerId, a.id, q.couponDiscount]);
    }
    if (q.pointsUsed) await adjustPoints(c, { userId: customerId, points: -q.pointsUsed, reason: 'Redeemed on booking', appointmentId: a.id });
    if (customerId) {
      await c.query(`UPDATE waitlist SET status = 'booked' WHERE customer_id = $1 AND desired_date = $2::date AND status IN ('waiting','notified')`,
        [customerId, start.tz(barber.timezone).format('YYYY-MM-DD')]);
    }
    return a.id;
  });

  const appt = await getAppointment(id);
  const when = fmtWhen(appt);
  await notifyCustomer(appt, status === 'confirmed' ? 'booking_confirmed' : 'booking_requested',
    status === 'confirmed' ? 'Booking confirmed ✂' : 'Booking request received',
    status === 'confirmed'
      ? `Your appointment with ${appt.barber_name} on ${when} is confirmed. Check-in code: ${appt.checkin_code}.`
      : `We've sent your request for ${when} to ${appt.barber_name}. You'll be notified once it's accepted.`);
  notifyUser(appt.barber_user_id, {
    type: 'new_booking', sms: false,
    title: status === 'pending' ? 'New booking request' : 'New booking',
    body: `${appt.customer_name} booked ${appt.services.map((s) => s.name).join(', ')} on ${when}.`,
    data: { appointmentId: id },
  });
  broadcastSlots(barberId);
  res.status(201).json({ appointment: appt });
}));

// ------------------------------------------------------------------ list (role-scoped)
router.get('/', authenticate, validate({
  query: z.object({
    scope: z.enum(['upcoming', 'past', 'all']).default('all'),
    status: z.string().max(100).optional(),
    barberId: uuid.optional(), customerId: uuid.optional(),
    from: isoDate.optional(), to: isoDate.optional(),
    search: z.string().max(80).optional(),
    page: z.coerce.number().optional(), limit: z.coerce.number().optional(),
  }),
}), asyncHandler(async (req, res) => {
  const { scope, status, from, to, search } = req.query;
  const { limit, offset, page } = paginate(req.query, 50);
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };

  if (req.user.role === 'customer') add('a.customer_id = ?', req.user.id);
  if (req.user.role === 'barber') add('a.barber_id = ?', req.user.barber_id);
  if (req.user.role === 'admin' && req.query.barberId) add('a.barber_id = ?', req.query.barberId);
  if (req.user.role === 'admin' && req.query.customerId) add('a.customer_id = ?', req.query.customerId);
  if (scope === 'upcoming') where.push("a.start_at >= now() AND a.status IN ('pending','confirmed','checked_in','in_progress')");
  if (scope === 'past') where.push("(a.start_at < now() OR a.status IN ('completed','cancelled','rejected','no_show'))");
  if (status) add('a.status::text = ANY(?)', status.split(','));
  if (from) add('a.start_at >= ?', from);
  if (to) add('a.start_at < ?', to);
  if (search) add("(COALESCE(cu.name, a.guest_name) ILIKE '%' || ? || '%')", search);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = scope === 'upcoming' ? 'a.start_at ASC' : 'a.start_at DESC';
  params.push(limit, offset);
  const rows = await many(`${APPT_SELECT} ${whereSql} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const { count } = await one(`SELECT count(*)::int AS count FROM appointments a LEFT JOIN users cu ON cu.id = a.customer_id ${whereSql}`, params.slice(0, -2));
  res.json({ appointments: rows, page, total: count });
}));

/** Calendar feed (day/week/month views) for barbers and admins. */
router.get('/calendar', authenticate, authorize('barber', 'admin'), validate({
  query: z.object({ from: isoDate, to: isoDate, barberId: uuid.optional(), locationId: uuid.optional() }),
}), asyncHandler(async (req, res) => {
  const barberId = req.user.role === 'barber' ? req.user.barber_id : req.query.barberId || null;
  const rows = await many(
    `${APPT_SELECT}
      WHERE a.start_at < $2 AND a.end_at > $1 AND a.status NOT IN ('cancelled','rejected')
        AND ($3::uuid IS NULL OR a.barber_id = $3) AND ($4::uuid IS NULL OR a.location_id = $4)
      ORDER BY a.start_at`,
    [req.query.from, req.query.to, barberId, req.query.locationId || null],
  );
  res.json({ events: rows });
}));

// ------------------------------------------------------------------ check-in (QR / code)
router.post('/checkin', heavyLimiter, validate({ body: z.object({ code: z.string().trim().toUpperCase().length(8) }) }),
  asyncHandler(async (req, res) => {
    const appt = await one(`${APPT_SELECT} WHERE a.checkin_code = $1`, [req.body.code]);
    if (!appt) throw ApiError.notFound('Check-in code not recognised');
    if (!['confirmed', 'pending'].includes(appt.status)) throw ApiError.badRequest(`Appointment is ${appt.status}`);
    const minutesAway = dayjs(appt.start_at).diff(dayjs(), 'minute');
    if (minutesAway > 120) throw ApiError.badRequest('Check-in opens 2 hours before your appointment');
    if (minutesAway < -60) throw ApiError.badRequest('This appointment time has passed');
    await query("UPDATE appointments SET status = 'checked_in', checked_in_at = now(), updated_at = now() WHERE id = $1", [appt.id]);
    notifyUser(appt.barber_user_id, { type: 'checked_in', title: 'Client checked in', body: `${appt.customer_name} has arrived.`, sms: false, email: false, data: { appointmentId: appt.id } });
    emit(`barber:${appt.barber_id}`, 'appointment:updated', { id: appt.id, status: 'checked_in' });
    res.json({ message: `Welcome, ${appt.customer_name}! ${appt.barber_name} will be with you shortly.`, appointment: await getAppointment(appt.id) });
  }));

// ------------------------------------------------------------------ walk-in (staff)
router.post('/walk-in', authenticate, authorize('barber', 'admin'), validate({
  body: z.object({
    barberId: uuid.optional(), serviceIds: z.array(uuid).min(1).max(6),
    name: z.string().min(2).max(80), phone: phone.optional(), customerId: uuid.optional(),
    startAt: isoDate.optional(),
  }),
}), asyncHandler(async (req, res) => {
  const barberId = req.user.role === 'barber' ? req.user.barber_id : req.body.barberId;
  if (!barberId) throw ApiError.badRequest('barberId is required');
  const q = await quote({ barberId, serviceIds: req.body.serviceIds, userId: req.body.customerId });
  const barber = await getBarberContext(barberId);
  // Walk-ins start now (rounded up to 5 min) unless a time is given; the DB constraint still blocks overlaps.
  const start = req.body.startAt ? dayjs(req.body.startAt) : dayjs().add(5 - (dayjs().minute() % 5), 'minute').second(0).millisecond(0);
  // Walk-ins happen now: allow a start from 15 minutes ago to 2 hours ahead, on today's date in the shop
  if (start.isBefore(dayjs().subtract(15, 'minute')) || start.isAfter(dayjs().add(2, 'hour'))) {
    throw ApiError.badRequest('Walk-ins must start now or within the next 2 hours. Use a normal booking for later times.');
  }
  const busy = await one(
    `SELECT 1 FROM appointments WHERE barber_id = $1 AND status IN ('pending','confirmed','checked_in','in_progress')
       AND start_at < $3 AND end_at > $2`, [barberId, start.toDate(), start.add(q.durationMin, 'minute').toDate()]);
  if (busy) throw ApiError.conflict(`The chair is busy until the current appointment ends. Add this customer to the walk-in queue instead.`);
  const id = await withTransaction(async (c) => {
    const { rows: [a] } = await c.query(
      `INSERT INTO appointments (customer_id, guest_name, guest_phone, barber_id, location_id, start_at, end_at, status, source,
                                 subtotal, discount, tax, total, checked_in_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'checked_in','walk_in',$8,$9,$10,$11, now()) RETURNING id`,
      [req.body.customerId || null, req.body.customerId ? null : req.body.name, req.body.phone || null, barberId, barber.location_id,
        start.toDate(), start.add(q.durationMin, 'minute').toDate(), q.subtotal, q.discount, q.tax, q.total]);
    for (const s of q.items) {
      await c.query('INSERT INTO appointment_services (appointment_id, service_id, name, price, duration_min) VALUES ($1,$2,$3,$4,$5)',
        [a.id, s.id, s.name, s.price, s.duration_min]);
    }
    return a.id;
  });
  broadcastSlots(barberId);
  res.status(201).json({ appointment: await getAppointment(id) });
}));

// ------------------------------------------------------------------ guest self-service (code + email)
router.post('/guest/lookup', heavyLimiter, validate({ body: z.object({ code: z.string().trim().toUpperCase().length(8), email }) }),
  asyncHandler(async (req, res) => {
    const appt = await one(`${APPT_SELECT} WHERE a.checkin_code = $1 AND lower(a.guest_email) = $2`, [req.body.code, req.body.email]);
    if (!appt) throw ApiError.notFound('No booking found for that code and email');
    res.json({ appointment: appt });
  }));

router.post('/guest/cancel', heavyLimiter, validate({ body: z.object({ code: z.string().trim().toUpperCase().length(8), email }) }),
  asyncHandler(async (req, res) => {
    const appt = await one(`${APPT_SELECT} WHERE a.checkin_code = $1 AND lower(a.guest_email) = $2`, [req.body.code, req.body.email]);
    if (!appt) throw ApiError.notFound('No booking found for that code and email');
    if (!['pending', 'confirmed'].includes(appt.status)) throw ApiError.badRequest(`Appointment is already ${appt.status}`);
    await withTransaction(async (c) => {
      await c.query("UPDATE appointments SET status = 'cancelled', cancellation_reason = 'Cancelled by guest', updated_at = now() WHERE id = $1", [appt.id]);
      await releaseCoupon(c, appt.id);
    });
    broadcastSlots(appt.barber_id);
    notifyWaitlist(appt);
    res.json({ appointment: await getAppointment(appt.id) });
  }));

// ------------------------------------------------------------------ single appointment
router.get('/:id', authenticate, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const appt = await getAppointment(req.params.id);
  if (!appt || !canAccess(req.user, appt)) throw ApiError.notFound('Appointment not found');
  const payments = await many('SELECT * FROM payments WHERE appointment_id = $1 ORDER BY created_at DESC', [appt.id]);
  res.json({ appointment: appt, payments });
}));

/** QR code (PNG data URL) encoding the check-in URL. */
router.get('/:id/qr', authenticate, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const appt = await getAppointment(req.params.id);
  if (!appt || !canAccess(req.user, appt)) throw ApiError.notFound('Appointment not found');
  const url = `${env.clientUrl}/checkin?code=${appt.checkin_code}`;
  res.json({ code: appt.checkin_code, url, dataUrl: await QRCode.toDataURL(url, { margin: 1, width: 320 }) });
}));

// ------------------------------------------------------------------ reschedule
router.patch('/:id/reschedule', authenticate, validate({ params: idParam, body: z.object({ startAt: isoDate, barberId: uuid.optional() }) }),
  asyncHandler(async (req, res) => {
    const appt = await getAppointment(req.params.id);
    if (!appt || !canAccess(req.user, appt)) throw ApiError.notFound('Appointment not found');
    if (!['pending', 'confirmed'].includes(appt.status)) throw ApiError.badRequest(`Cannot reschedule a ${appt.status} appointment`);
    const settings = await getSettings();
    const isStaff = req.user.role !== 'customer';
    if (!isStaff && dayjs(appt.start_at).diff(dayjs(), 'hour', true) < settings.cancellation_window_hours) {
      throw ApiError.badRequest(`Appointments can only be rescheduled more than ${settings.cancellation_window_hours} hours in advance`);
    }
    const barberId = (req.user.role === 'admin' && req.body.barberId) || appt.barber_id;
    const duration = appt.services.reduce((s, x) => s + x.duration_min, 0);
    const barber = await assertSlotAvailable({ barberId, startAt: req.body.startAt, durationMin: duration, excludeAppointmentId: appt.id, ignoreLead: isStaff });
    const start = dayjs(req.body.startAt);
    // A customer-initiated reschedule goes back to the barber for approval unless auto-confirm is on
    const status = isStaff || barber.auto_confirm ? 'confirmed' : 'pending';
    await query(
      `UPDATE appointments SET start_at = $2, end_at = $3, barber_id = $4, status = $5,
              reminder_24h_sent = FALSE, reminder_1h_sent = FALSE, updated_at = now() WHERE id = $1`,
      [appt.id, start.toDate(), start.add(duration, 'minute').toDate(), barberId, status]);
    const updated = await getAppointment(appt.id);
    await notifyCustomer(updated, 'rescheduled', 'Appointment rescheduled', `Your appointment is now on ${fmtWhen(updated)} with ${updated.barber_name}.`);
    if (req.user.id !== updated.barber_user_id) {
      notifyUser(updated.barber_user_id, { type: 'rescheduled', title: 'Appointment rescheduled', sms: false,
        body: `${updated.customer_name} moved their appointment to ${fmtWhen(updated)}.`, data: { appointmentId: appt.id } });
    }
    broadcastSlots(appt.barber_id);
    if (barberId !== appt.barber_id) broadcastSlots(barberId);
    notifyWaitlist(appt);
    res.json({ appointment: updated });
  }));

// ------------------------------------------------------------------ cancel
router.patch('/:id/cancel', authenticate, validate({ params: idParam, body: z.object({ reason: z.string().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    const appt = await getAppointment(req.params.id);
    if (!appt || !canAccess(req.user, appt)) throw ApiError.notFound('Appointment not found');
    if (!['pending', 'confirmed', 'checked_in'].includes(appt.status)) throw ApiError.badRequest(`Appointment is already ${appt.status}`);
    const settings = await getSettings();
    const hoursAway = dayjs(appt.start_at).diff(dayjs(), 'hour', true);
    const lateCancel = req.user.role === 'customer' && hoursAway < settings.cancellation_window_hours;

    await withTransaction(async (c) => {
      await c.query("UPDATE appointments SET status = 'cancelled', cancellation_reason = $2, updated_at = now() WHERE id = $1",
        [appt.id, req.body.reason || `Cancelled by ${req.user.role}`]);
      // Give back redeemed points unless it was a late cancellation
      if (appt.points_redeemed && !lateCancel) {
        await adjustPoints(c, { userId: appt.customer_id, points: appt.points_redeemed, reason: 'Points restored (cancellation)', appointmentId: appt.id });
      }
      if (!lateCancel) await releaseCoupon(c, appt.id);
    });

    // Refund online payments (late customer cancellations are not auto-refunded per policy)
    const refunded = lateCancel ? false : await refundAppointment(appt.id, 'Appointment cancelled');
    const who = req.user.role === 'customer' ? 'You' : req.user.role === 'barber' ? 'Your barber' : 'The shop';
    await notifyCustomer(appt, 'cancelled', 'Appointment cancelled',
      `${who} cancelled the appointment on ${fmtWhen(appt)}.${refunded ? ' A refund has been issued to your original payment method.' : ''}`);
    if (req.user.role !== 'barber') {
      notifyUser(appt.barber_user_id, { type: 'cancelled', title: 'Appointment cancelled', sms: false,
        body: `${appt.customer_name} cancelled ${fmtWhen(appt)}.`, data: { appointmentId: appt.id } });
    }
    broadcastSlots(appt.barber_id);
    notifyWaitlist(appt);
    res.json({ appointment: await getAppointment(appt.id), refunded, lateCancel });
  }));

// ------------------------------------------------------------------ status workflow (barber/admin)
const TRANSITIONS = {
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['checked_in', 'in_progress', 'completed', 'no_show', 'cancelled'],
  checked_in: ['in_progress', 'completed', 'no_show', 'cancelled'],
  in_progress: ['completed'],
};

router.patch('/:id/status', authenticate, authorize('barber', 'admin'), validate({
  params: idParam,
  body: z.object({ status: z.enum(['confirmed', 'rejected', 'checked_in', 'in_progress', 'completed', 'no_show']), reason: z.string().max(300).optional() }),
}), asyncHandler(async (req, res) => {
  const appt = await getAppointment(req.params.id);
  if (!appt || !canAccess(req.user, appt)) throw ApiError.notFound('Appointment not found');
  const next = req.body.status;
  if (!TRANSITIONS[appt.status]?.includes(next)) throw ApiError.badRequest(`Cannot change ${appt.status} → ${next}`);
  // Guard against accidentally starting/completing a booking long before it begins (which would book revenue early)
  const minutesUntil = dayjs(appt.start_at).diff(dayjs(), 'minute');
  if (['in_progress', 'completed'].includes(next) && minutesUntil > 60) {
    throw ApiError.badRequest('This appointment starts later. You can start or complete it from 1 hour before its start time.');
  }
  if (next === 'checked_in' && minutesUntil > 120) throw ApiError.badRequest('Check-in opens 2 hours before the appointment');
  if (next === 'no_show' && minutesUntil > 0) throw ApiError.badRequest('An appointment can only be marked no-show after its start time');

  const settings = await getSettings();
  await withTransaction(async (c) => {
    await c.query(
      `UPDATE appointments SET status = $2::appointment_status, updated_at = now(),
              checked_in_at = CASE WHEN $2::text = 'checked_in' THEN now() ELSE checked_in_at END,
              cancellation_reason = CASE WHEN $2::text = 'rejected' THEN $3 ELSE cancellation_reason END
        WHERE id = $1`, [appt.id, next, req.body.reason || null]);

    if (next === 'rejected') {
      if (appt.points_redeemed) {
        await adjustPoints(c, { userId: appt.customer_id, points: appt.points_redeemed, reason: 'Points restored (booking declined)', appointmentId: appt.id });
      }
      await releaseCoupon(c, appt.id);
    }

    if (next === 'completed') {
      // Settle payment: pending cash → paid; nothing on file → record a cash payment taken at the counter
      const { rows: pays } = await c.query("SELECT * FROM payments WHERE appointment_id = $1 AND status IN ('paid','pending')", [appt.id]);
      if (!pays.length) {
        await c.query(
          `INSERT INTO payments (user_id, appointment_id, amount, tax, method, status, invoice_number, paid_at)
           VALUES ($1,$2,$3,$4,'cash','paid',$5, now())`,
          [appt.customer_id, appt.id, appt.total, appt.tax, await nextInvoiceNumber(c)]);
      } else {
        await c.query("UPDATE payments SET status = 'paid', paid_at = now() WHERE appointment_id = $1 AND method = 'cash' AND status = 'pending'", [appt.id]);
      }
      // Award loyalty points (membership multiplier applies)
      if (appt.customer_id) {
        const { rows: [m] } = await c.query(
          `SELECT p.points_multiplier FROM memberships m JOIN membership_plans p ON p.id = m.plan_id
            WHERE m.user_id = $1 AND m.status = 'active'`, [appt.customer_id]);
        const pts = Math.floor((appt.total - appt.tax) * settings.loyalty_points_per_dollar * (m ? Number(m.points_multiplier) : 1));
        if (pts > 0) await adjustPoints(c, { userId: appt.customer_id, points: pts, reason: 'Earned from visit', appointmentId: appt.id });
      }
    }
  });

  // A declined booking may already have been paid online — always refund it in full
  const refunded = next === 'rejected' ? await refundAppointment(appt.id, 'Booking declined by barber') : false;

  const updated = await getAppointment(appt.id);
  const messages = {
    confirmed: ['booking_confirmed', 'Booking confirmed ✂', `${updated.barber_name} confirmed your appointment on ${fmtWhen(updated)}. Check-in code: ${updated.checkin_code}.`],
    rejected: ['booking_rejected', 'Booking declined', `Unfortunately ${updated.barber_name} can't take your appointment on ${fmtWhen(updated)}.${req.body.reason ? ` Reason: ${req.body.reason}` : ''} Please choose another time.${refunded ? ' Your payment has been refunded in full.' : ''}`],
    completed: ['completed', 'Thanks for visiting!', 'Hope you love the fresh cut. Leave a review to earn bonus loyalty points!'],
    no_show: ['no_show', 'We missed you', `You were marked as a no-show for ${fmtWhen(updated)}. Need to rebook?`],
  };
  if (messages[next]) await notifyCustomer(updated, ...messages[next]);
  if (['rejected', 'no_show'].includes(next)) { broadcastSlots(appt.barber_id); notifyWaitlist(appt); }
  emit(`barber:${appt.barber_id}`, 'appointment:updated', { id: appt.id, status: next });
  res.json({ appointment: updated });
}));

export default router;
