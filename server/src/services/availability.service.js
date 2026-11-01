/**
 * Time-slot availability engine.
 *
 * A slot [start, start+duration) is bookable when it:
 *   1. falls inside the barber's working hours for that weekday,
 *   2. does not overlap the barber's break,
 *   3. is not on a vacation / time-off date,
 *   4. does not overlap another active appointment,
 *   5. starts after now + booking lead time and within the booking window.
 *
 * Final protection against races is the `appointments_no_overlap` exclusion
 * constraint in PostgreSQL — this service is for UX (showing open slots).
 */
import { one, many } from '../db/pool.js';
import { dayjs, zoned } from '../utils/time.js';
import { getSettings } from './settings.service.js';
import { ApiError } from '../utils/ApiError.js';

const ACTIVE = ['pending', 'confirmed', 'checked_in', 'in_progress'];

export async function getBarberContext(barberId) {
  const barber = await one(
    `SELECT b.*, u.name, u.is_active, COALESCE(l.timezone, $2) AS timezone
       FROM barbers b JOIN users u ON u.id = b.user_id
       LEFT JOIN locations l ON l.id = b.location_id
      WHERE b.id = $1`,
    [barberId, (await getSettings()).default_timezone],
  );
  if (!barber) throw ApiError.notFound('Barber not found');
  return barber;
}

/**
 * @param {{barberId:string,date:string,durationMin:number,excludeAppointmentId?:string,ignoreLead?:boolean}} opts
 * @returns {Promise<{timezone:string, slots:{start:string,label:string,available:boolean}[], reason?:string}>}
 */
export async function getSlots({ barberId, date, durationMin, excludeAppointmentId = null, ignoreLead = false }) {
  const settings = await getSettings();
  const barber = await getBarberContext(barberId);
  const tz = barber.timezone;
  const result = (reason) => ({ timezone: tz, slots: [], reason });

  if (!barber.is_active || !barber.is_approved) return result('Barber is not taking bookings');

  const day = dayjs.tz(date, 'YYYY-MM-DD', tz);
  if (!day.isValid()) throw ApiError.badRequest('Invalid date');
  const now = dayjs();
  if (!ignoreLead && day.isAfter(now.add(settings.booking_window_days, 'day'))) return result('Date is beyond the booking window');

  const off = await one(
    'SELECT reason FROM time_off WHERE barber_id = $1 AND $2::date BETWEEN start_date AND end_date LIMIT 1',
    [barberId, date],
  );
  if (off) return result(off.reason ? `Unavailable: ${off.reason}` : 'Barber is on leave');

  const wh = await one('SELECT * FROM working_hours WHERE barber_id = $1 AND day_of_week = $2', [barberId, day.day()]);
  if (!wh || wh.is_off) return result('Barber is not working this day');

  const dayStart = zoned(date, wh.start_time, tz);
  const dayEnd = zoned(date, wh.end_time, tz);
  const busy = (await many(
    `SELECT start_at, end_at FROM appointments
      WHERE barber_id = $1 AND status = ANY($2::appointment_status[])
        AND start_at < $4 AND end_at > $3 AND ($5::uuid IS NULL OR id <> $5)`,
    [barberId, ACTIVE, dayStart.toDate(), dayEnd.toDate(), excludeAppointmentId],
  )).map((a) => [dayjs(a.start_at).valueOf(), dayjs(a.end_at).valueOf()]);

  if (wh.break_start && wh.break_end) {
    busy.push([zoned(date, wh.break_start, tz).valueOf(), zoned(date, wh.break_end, tz).valueOf()]);
  }

  const earliest = ignoreLead ? now : now.add(settings.booking_lead_minutes, 'minute');
  const step = barber.slot_interval || 15;
  const slots = [];
  for (let s = dayStart; !s.add(durationMin, 'minute').isAfter(dayEnd); s = s.add(step, 'minute')) {
    const a = s.valueOf();
    const b = s.add(durationMin, 'minute').valueOf();
    const overlaps = busy.some(([x, y]) => a < y && b > x);
    slots.push({ start: s.toISOString(), label: s.format('HH:mm'), available: !overlaps && s.isAfter(earliest) });
  }
  return { timezone: tz, slots };
}

/** Throws 409 if the requested start time is not an open slot. */
export async function assertSlotAvailable({ barberId, startAt, durationMin, excludeAppointmentId, ignoreLead }) {
  const barber = await getBarberContext(barberId);
  const date = dayjs(startAt).tz(barber.timezone).format('YYYY-MM-DD');
  const { slots, reason } = await getSlots({ barberId, date, durationMin, excludeAppointmentId, ignoreLead });
  const wanted = dayjs(startAt).valueOf();
  const slot = slots.find((s) => dayjs(s.start).valueOf() === wanted);
  if (!slot) throw ApiError.conflict(reason || 'Requested time is outside available hours');
  if (!slot.available) throw ApiError.conflict('That time slot is not available');
  return barber;
}

/** Next N available slots across upcoming days (used by WhatsApp + "first available"). */
export async function nextAvailable({ barberId, durationMin, days = 7, limit = 5 }) {
  const barber = await getBarberContext(barberId);
  const out = [];
  for (let i = 0; i < days && out.length < limit; i++) {
    const date = dayjs().tz(barber.timezone).add(i, 'day').format('YYYY-MM-DD');
    const { slots } = await getSlots({ barberId, date, durationMin });
    for (const s of slots) if (s.available && out.length < limit) out.push(s);
  }
  return out;
}
