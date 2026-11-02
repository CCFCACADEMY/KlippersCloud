/**
 * WhatsApp booking bot (Twilio WhatsApp webhook → TwiML reply).
 * Point your Twilio WhatsApp sender's "When a message comes in" URL to
 *   POST https://<api-host>/api/webhooks/whatsapp
 *
 * Commands (case-insensitive):
 *   HELP                       – menu
 *   SERVICES                   – list services and prices
 *   BARBERS                    – list barbers
 *   SLOTS <barber#> <service#> – next 5 open times
 *   BOOK <barber#> <service#> <slot#> <Your Name>
 *   STATUS <code> / CANCEL <code>
 */
import { Router } from 'express';
import { many, one, query } from '../db/pool.js';
import { asyncHandler } from '../utils/ApiError.js';
import { nextAvailable } from '../services/availability.service.js';
import { quote } from '../services/pricing.service.js';
import { getSettings } from '../services/settings.service.js';
import { notifyUser } from '../services/notification.service.js';
import { emit } from '../services/socket.js';
import { dayjs } from '../utils/time.js';
import { formatMoney } from '../utils/helpers.js';

const router = Router();
const xml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const reply = (res, text) => res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xml(text)}</Message></Response>`);

const listBarbers = () => many(`SELECT b.id, u.name, b.user_id FROM barbers b JOIN users u ON u.id = b.user_id WHERE b.is_approved AND u.is_active ORDER BY u.name`);
const listServices = () => many('SELECT id, name, price, duration_min FROM services WHERE is_active ORDER BY sort_order, name');

router.post('/whatsapp', asyncHandler(async (req, res) => {
  const settings = await getSettings();
  if (!settings.whatsapp_enabled) return reply(res, 'WhatsApp booking is currently unavailable. Please book online.');
  const from = String(req.body.From || '').replace('whatsapp:', '');
  const [cmd, ...args] = String(req.body.Body || '').trim().split(/\s+/);
  const barbers = await listBarbers();
  const services = await listServices();

  switch ((cmd || '').toUpperCase()) {
    case 'SERVICES':
      return reply(res, `💈 Services:\n${services.map((s, i) => `${i + 1}. ${s.name} — ${formatMoney(s.price)} (${s.duration_min}m)`).join('\n')}`);
    case 'BARBERS':
      return reply(res, `✂ Barbers:\n${barbers.map((b, i) => `${i + 1}. ${b.name}`).join('\n')}`);
    case 'SLOTS': {
      const b = barbers[+args[0] - 1]; const s = services[+args[1] - 1];
      if (!b || !s) return reply(res, 'Usage: SLOTS <barber#> <service#>. Send BARBERS / SERVICES for numbers.');
      const slots = await nextAvailable({ barberId: b.id, durationMin: s.duration_min });
      if (!slots.length) return reply(res, `${b.name} has no openings this week. Try another barber.`);
      return reply(res, `Next openings with ${b.name} for ${s.name}:\n${slots.map((x, i) => `${i + 1}. ${dayjs(x.start).tz(settings.default_timezone).format('ddd MMM D, h:mm A')}`).join('\n')}\n\nReply: BOOK ${args[0]} ${args[1]} <slot#> <Your Name>`);
    }
    case 'BOOK': {
      const b = barbers[+args[0] - 1]; const s = services[+args[1] - 1]; const name = args.slice(3).join(' ');
      if (!b || !s || !args[2] || name.length < 2) return reply(res, 'Usage: BOOK <barber#> <service#> <slot#> <Your Name>');
      const slot = (await nextAvailable({ barberId: b.id, durationMin: s.duration_min }))[+args[2] - 1];
      if (!slot) return reply(res, 'That slot is no longer available. Send SLOTS again.');
      const q = await quote({ barberId: b.id, serviceIds: [s.id] });
      try {
        const appt = await one(
          `INSERT INTO appointments (guest_name, guest_phone, barber_id, location_id, start_at, end_at, status, source, subtotal, discount, tax, total)
           SELECT $1, $2, $3, location_id, $4, $5, 'confirmed', 'whatsapp', $6, 0, $7, $8 FROM barbers WHERE id = $3 RETURNING id, checkin_code`,
          [name, from, b.id, slot.start, dayjs(slot.start).add(q.durationMin, 'minute').toDate(), q.subtotal, q.tax, q.total]);
        await query('INSERT INTO appointment_services (appointment_id, service_id, name, price, duration_min) VALUES ($1,$2,$3,$4,$5)',
          [appt.id, s.id, q.items[0].name, q.items[0].price, q.items[0].duration_min]);
        notifyUser(b.user_id, { type: 'new_booking', title: 'New WhatsApp booking', body: `${name} booked ${s.name}.`, sms: false });
        emit(`barber:${b.id}`, 'slots:changed', { barberId: b.id });
        return reply(res, `✅ Booked! ${s.name} with ${b.name} on ${dayjs(slot.start).tz(settings.default_timezone).format('ddd MMM D, h:mm A')}.\nTotal: ${formatMoney(q.total)}\nCode: ${appt.checkin_code} (show at the shop, or CANCEL ${appt.checkin_code})`);
      } catch (e) {
        if (e.code === '23P01') return reply(res, 'Someone just took that slot. Send SLOTS again.');
        throw e;
      }
    }
    case 'STATUS':
    case 'CANCEL': {
      const appt = await one(
        `SELECT a.*, u.name AS barber_name FROM appointments a JOIN barbers b ON b.id = a.barber_id JOIN users u ON u.id = b.user_id
          WHERE a.checkin_code = $1 AND a.guest_phone = $2`, [String(args[0] || '').toUpperCase(), from]);
      if (!appt) return reply(res, 'Booking not found for this number.');
      if (cmd.toUpperCase() === 'STATUS') return reply(res, `${appt.status.toUpperCase()}: ${dayjs(appt.start_at).tz(settings.default_timezone).format('ddd MMM D, h:mm A')} with ${appt.barber_name}.`);
      if (!['pending', 'confirmed'].includes(appt.status)) return reply(res, `This booking is already ${appt.status}.`);
      await query("UPDATE appointments SET status = 'cancelled', cancellation_reason = 'Cancelled via WhatsApp' WHERE id = $1", [appt.id]);
      emit(`barber:${appt.barber_id}`, 'slots:changed', { barberId: appt.barber_id });
      return reply(res, 'Your booking has been cancelled. Hope to see you soon!');
    }
    default:
      return reply(res, `Welcome to ${settings.business_name} 💈\nCommands:\n• SERVICES\n• BARBERS\n• SLOTS <barber#> <service#>\n• BOOK <barber#> <service#> <slot#> <Name>\n• STATUS <code>\n• CANCEL <code>`);
  }
}));

export default router;
