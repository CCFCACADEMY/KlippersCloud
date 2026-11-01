/**
 * Background jobs (node-cron, every 5 minutes):
 *  - 24-hour and 1-hour appointment reminders (email/SMS/push)
 *  - auto-expire stale pending requests whose time has passed
 *  - expire old waiting-list entries and renew/expire memberships
 *
 * In a multi-instance deployment run jobs on ONE instance only
 * (set ENABLE_JOBS=false on the others) — the UPDATE … RETURNING pattern
 * below also makes each reminder claim atomic so duplicates can't be sent.
 */
import cron from 'node-cron';
import { many, query } from '../db/pool.js';
import { notifyUser, notifyGuest } from '../services/notification.service.js';
import { dayjs } from '../utils/time.js';

async function sendReminders(window, flag, label) {
  // Atomically claim due appointments so concurrent runs never double-send
  const due = await many(
    `UPDATE appointments a SET ${flag} = TRUE ${flag === 'reminder_1h_sent' ? ', reminder_24h_sent = TRUE' : ''}
      FROM barbers b, users bu
     WHERE b.id = a.barber_id AND bu.id = b.user_id
       AND a.status IN ('confirmed','pending') AND NOT a.${flag}
       AND a.start_at > now() AND a.start_at <= now() + $1::interval
     RETURNING a.*, bu.name AS barber_name`, [window]);
  for (const a of due) {
    const when = dayjs(a.start_at).tz('America/New_York').format('ddd h:mm A');
    const body = `Reminder: your appointment with ${a.barber_name} is ${label} (${when}). Check-in code: ${a.checkin_code}.`;
    if (a.customer_id) await notifyUser(a.customer_id, { type: `reminder_${label === 'in 1 hour' ? '1h' : '24h'}`, title: 'Appointment reminder ⏰', body, data: { appointmentId: a.id } });
    else await notifyGuest({ email: a.guest_email, phone: a.guest_phone }, 'Appointment reminder', body);
  }
  return due.length;
}

export async function runMaintenance() {
  const sent1h = await sendReminders('1 hour', 'reminder_1h_sent', 'in 1 hour');
  const sent24h = await sendReminders('24 hours', 'reminder_24h_sent', 'tomorrow');
  await query("UPDATE appointments SET status = 'cancelled', cancellation_reason = 'Request expired' WHERE status = 'pending' AND start_at < now()");
  await query("UPDATE waitlist SET status = 'expired' WHERE status IN ('waiting','notified') AND desired_date < current_date");
  await query("UPDATE memberships SET status = 'expired' WHERE status = 'cancelled' AND renews_at < now()");
  // Demo renewals: in production Stripe subscription webhooks drive this
  await query("UPDATE memberships SET renews_at = renews_at + interval '1 month' WHERE status = 'active' AND renews_at < now()");
  return { sent1h, sent24h };
}

export function startJobs() {
  cron.schedule('*/5 * * * *', () => runMaintenance().catch((e) => console.error('[jobs] failed', e)));
  console.log('⏰ Background jobs scheduled (every 5 min)');
}
