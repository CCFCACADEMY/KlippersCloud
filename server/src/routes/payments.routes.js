/**
 * Payments: pay for an appointment (card via Stripe/mock, cash, gift card),
 * payment history, printable invoices, refunds and the Stripe webhook.
 */
import { Router } from 'express';
import { z } from 'zod';
import { one, many, query, withTransaction } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { idParam } from '../validators/common.js';
import { createPayment, refundPayment, stripe, paymentProvider, nextInvoiceNumber } from '../services/payment.service.js';
import { notifyUser } from '../services/notification.service.js';
import { getSettings } from '../services/settings.service.js';
import { env } from '../config/env.js';
import { money, paginate, formatMoney } from '../utils/helpers.js';
import { dayjs } from '../utils/time.js';

const router = Router();

router.get('/config', (_req, res) => res.json({ provider: paymentProvider, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null }));

/** Pay for an appointment. */
router.post('/appointments/:id', authenticate, validate({
  params: idParam,
  body: z.object({ method: z.enum(['card', 'cash', 'gift_card']), giftCardCode: z.string().max(20).optional() }),
}), asyncHandler(async (req, res) => {
  const appt = await one('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
  if (!appt) throw ApiError.notFound('Appointment not found');
  const isOwner = appt.customer_id === req.user.id;
  const isStaff = req.user.role === 'admin' || (req.user.role === 'barber' && req.user.barber_id === appt.barber_id);
  if (!isOwner && !isStaff) throw ApiError.notFound('Appointment not found');
  if (['cancelled', 'rejected'].includes(appt.status)) throw ApiError.badRequest('This appointment is not payable');
  const existing = await one("SELECT * FROM payments WHERE appointment_id = $1 AND status IN ('paid','pending') ORDER BY created_at DESC LIMIT 1", [appt.id]);
  if (existing?.status === 'paid') throw ApiError.conflict('This appointment is already paid');
  if (existing?.status === 'pending') await query("UPDATE payments SET status = 'failed' WHERE id = $1", [existing.id]); // replace stale attempt

  if (req.body.method === 'gift_card') {
    const code = (req.body.giftCardCode || '').toUpperCase();
    const payment = await withTransaction(async (c) => {
      const { rows: [g] } = await c.query(
        'SELECT * FROM gift_cards WHERE code = $1 AND is_active AND (expires_at IS NULL OR expires_at > now()) FOR UPDATE', [code]);
      if (!g) throw ApiError.badRequest('Invalid or expired gift card');
      if (Number(g.balance) < Number(appt.total)) throw ApiError.badRequest(`Gift card balance (${formatMoney(g.balance)}) is not enough`);
      await c.query('UPDATE gift_cards SET balance = balance - $2 WHERE id = $1', [g.id, appt.total]);
      const { rows: [p] } = await c.query(
        `INSERT INTO payments (user_id, appointment_id, amount, tax, method, status, provider, provider_ref, invoice_number, paid_at)
         VALUES ($1,$2,$3,$4,'gift_card','paid','internal',$5,$6, now()) RETURNING *`,
        [appt.customer_id, appt.id, appt.total, appt.tax, code, await nextInvoiceNumber(c)]);
      return p;
    });
    return res.status(201).json({ payment });
  }

  const payment = await createPayment({ userId: appt.customer_id, appointmentId: appt.id, amount: appt.total, tax: appt.tax, method: req.body.method });
  if (payment.status === 'paid' && appt.customer_id) {
    notifyUser(appt.customer_id, { type: 'payment_received', title: 'Payment received', sms: false,
      body: `We received ${formatMoney(payment.amount)} for your appointment. Invoice ${payment.invoice_number}.`, data: { paymentId: payment.id } });
  }
  res.status(201).json({ payment });
}));

/** Payment history (own for customers, barber's appointments for barbers, all for admin). */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { limit, offset } = paginate(req.query, 50);
  const scope = { customer: 'p.user_id = $1', barber: 'a.barber_id = $1', admin: '$1::uuid IS NOT NULL' }[req.user.role];
  const rows = await many(
    `SELECT p.*, a.start_at, COALESCE(u.name, a.guest_name) AS customer_name, bu.name AS barber_name
       FROM payments p LEFT JOIN appointments a ON a.id = p.appointment_id
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN barbers b ON b.id = a.barber_id LEFT JOIN users bu ON bu.id = b.user_id
      WHERE ${scope} ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
    [req.user.role === 'barber' ? req.user.barber_id : req.user.id, limit, offset]);
  res.json({ payments: rows });
}));

/** Printable HTML invoice (open in a new tab → print/save as PDF). */
router.get('/:id/invoice', authenticate, validate({ params: idParam }), asyncHandler(async (req, res) => {
  const p = await one(
    `SELECT p.*, a.start_at, a.subtotal, a.discount, a.barber_id, COALESCE(u.name, a.guest_name) AS customer_name,
            COALESCE(u.email, a.guest_email) AS customer_email, bu.name AS barber_name, l.name AS location_name, l.address
       FROM payments p LEFT JOIN appointments a ON a.id = p.appointment_id LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN barbers b ON b.id = a.barber_id LEFT JOIN users bu ON bu.id = b.user_id
       LEFT JOIN locations l ON l.id = a.location_id WHERE p.id = $1`, [req.params.id]);
  const allowed = p && (req.user.role === 'admin' || p.user_id === req.user.id || (req.user.role === 'barber' && p.barber_id === req.user.barber_id));
  if (!allowed) throw ApiError.notFound('Invoice not found');
  const items = p.appointment_id ? await many('SELECT name, price FROM appointment_services WHERE appointment_id = $1', [p.appointment_id]) : [{ name: p.purpose === 'gift_card' ? 'Gift card' : 'Membership', price: p.amount }];
  const s = await getSettings();
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const $ = (n) => formatMoney(n, s.currency);
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(p.invoice_number)}</title>
<style>body{font-family:Inter,Arial,sans-serif;max-width:720px;margin:40px auto;color:#1a1a1d;padding:0 16px}
h1{font-family:Georgia,serif;margin:0}.muted{color:#777}.row{display:flex;justify-content:space-between}
table{width:100%;border-collapse:collapse;margin:24px 0}td,th{padding:10px;border-bottom:1px solid #eee;text-align:left}
td:last-child,th:last-child{text-align:right}.total{font-size:20px;font-weight:700}.badge{display:inline-block;padding:4px 10px;border-radius:99px;background:#d4a24c;color:#111;font-size:12px;text-transform:uppercase}
@media print{button{display:none}}</style></head><body>
<div class="row"><div><h1>✂ ${esc(s.business_name)}</h1><div class="muted">${esc(p.location_name || '')} ${esc(p.address || '')}</div></div>
<div style="text-align:right"><div class="badge">${esc(p.status)}</div><div>Invoice <b>${esc(p.invoice_number)}</b></div>
<div class="muted">${dayjs(p.paid_at || p.created_at).format('MMM D, YYYY')}</div></div></div>
<p><b>Billed to:</b> ${esc(p.customer_name || '—')}<br><span class="muted">${esc(p.customer_email || '')}</span></p>
${p.start_at ? `<p><b>Appointment:</b> ${dayjs(p.start_at).format('ddd, MMM D YYYY h:mm A')} with ${esc(p.barber_name)}</p>` : ''}
<table><tr><th>Item</th><th>Amount</th></tr>${items.map((i) => `<tr><td>${esc(i.name)}</td><td>${$(i.price)}</td></tr>`).join('')}
${p.discount ? `<tr><td>Discounts</td><td>−${$(p.discount)}</td></tr>` : ''}
<tr><td>GST (${s.tax_rate}%)</td><td>${$(p.tax)}</td></tr>
<tr><td class="total">Total</td><td class="total">${$(p.amount)}</td></tr>
${p.refunded_amount ? `<tr><td>Refunded</td><td>−${$(p.refunded_amount)}</td></tr>` : ''}</table>
<p class="muted">Paid by ${esc(p.method.replace('_', ' '))}. Thank you for choosing ${esc(s.business_name)}!</p>
<button onclick="print()">Print / Save PDF</button></body></html>`);
}));

/** Staff marks a pending cash payment as collected. */
router.post('/:id/mark-paid', authenticate, authorize('barber', 'admin'), validate({ params: idParam }), asyncHandler(async (req, res) => {
  const p = await one(
    `UPDATE payments SET status = 'paid', paid_at = now() WHERE id = $1 AND status = 'pending' AND method = 'cash' RETURNING *`, [req.params.id]);
  if (!p) throw ApiError.badRequest('No pending cash payment found');
  res.json({ payment: p });
}));

/** Refund management (admin). Omit amount for a full refund. */
router.post('/:id/refund', authenticate, authorize('admin'), validate({
  params: idParam, body: z.object({ amount: z.coerce.number().positive().optional(), reason: z.string().max(300).optional() }),
}), asyncHandler(async (req, res) => {
  const payment = await refundPayment(req.params.id, req.body.amount, req.body.reason);
  if (payment.user_id) {
    notifyUser(payment.user_id, { type: 'refund', title: 'Refund issued', sms: false,
      body: `A refund of ${formatMoney(payment.refunded_amount)} was issued for invoice ${payment.invoice_number}.` });
  }
  res.json({ payment });
}));

/**
 * Stripe webhook — mounted with express.raw() in app.js so the signature
 * can be verified against the exact request bytes.
 */
export async function stripeWebhook(req, res) {
  if (!stripe) return res.status(400).send('Stripe not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], env.stripeWebhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  const intent = event.data.object;
  if (event.type === 'payment_intent.succeeded') {
    const p = await one("UPDATE payments SET status = 'paid', paid_at = now() WHERE provider_ref = $1 RETURNING *", [intent.id]);
    if (p?.purpose === 'gift_card') await query('UPDATE gift_cards SET is_active = TRUE WHERE code = $1', [intent.metadata.giftCardCode]);
    if (p?.purpose === 'membership') await query("UPDATE memberships SET status = 'active' WHERE id = $1", [intent.metadata.membershipId]);
    if (p?.user_id) notifyUser(p.user_id, { type: 'payment_received', title: 'Payment received', sms: false, body: `Payment of ${formatMoney(p.amount)} received. Invoice ${p.invoice_number}.` });
  } else if (event.type === 'payment_intent.payment_failed') {
    await query("UPDATE payments SET status = 'failed' WHERE provider_ref = $1", [intent.id]);
  }
  res.json({ received: true });
}

export default router;
