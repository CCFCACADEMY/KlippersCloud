/**
 * Payments: Stripe when STRIPE_SECRET_KEY is set, otherwise a "mock" provider
 * that settles card payments instantly (handy for demos and local development).
 * Cash payments are recorded as pending and settled by staff at checkout.
 */
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { one, query } from '../db/pool.js';
import { ApiError } from '../utils/ApiError.js';
import { money } from '../utils/helpers.js';
import { getSettings } from './settings.service.js';

export const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;
export const paymentProvider = stripe ? 'stripe' : 'mock';

export async function nextInvoiceNumber(db = { query }) {
  const { rows } = await db.query("SELECT 'KLP-' || to_char(now(), 'YYYY') || '-' || nextval('invoice_seq') AS n");
  return rows[0].n;
}

/**
 * Start a payment. For Stripe returns a PaymentIntent client secret the
 * frontend confirms with Stripe Elements; the webhook marks it paid.
 */
export async function createPayment({ userId, appointmentId = null, purpose = 'appointment', amount, tax = 0, method, metadata = {} }) {
  amount = money(amount);
  const invoice = await nextInvoiceNumber();
  if (method === 'cash') {
    return one(
      `INSERT INTO payments (user_id, appointment_id, purpose, amount, tax, method, status, provider, invoice_number)
       VALUES ($1,$2,$3,$4,$5,'cash','pending','internal',$6) RETURNING *`,
      [userId, appointmentId, purpose, amount, tax, invoice],
    );
  }
  if (stripe) {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: ((await getSettings()).currency || 'inr').toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: { purpose, appointmentId: appointmentId || '', userId: userId || '', ...metadata },
    });
    const payment = await one(
      `INSERT INTO payments (user_id, appointment_id, purpose, amount, tax, method, status, provider, provider_ref, invoice_number)
       VALUES ($1,$2,$3,$4,$5,'card','pending','stripe',$6,$7) RETURNING *`,
      [userId, appointmentId, purpose, amount, tax, intent.id, invoice],
    );
    return { ...payment, clientSecret: intent.client_secret };
  }
  // Mock provider — instantly successful
  return one(
    `INSERT INTO payments (user_id, appointment_id, purpose, amount, tax, method, status, provider, provider_ref, invoice_number, paid_at)
     VALUES ($1,$2,$3,$4,$5,'card','paid','mock',$6,$7, now()) RETURNING *`,
    [userId, appointmentId, purpose, amount, tax, `mock_${Date.now()}`, invoice],
  );
}

/** Refund (fully or partially) a paid payment. */
export async function refundPayment(paymentId, amount, reason) {
  const p = await one('SELECT * FROM payments WHERE id = $1', [paymentId]);
  if (!p) throw ApiError.notFound('Payment not found');
  if (!['paid', 'partially_refunded'].includes(p.status)) throw ApiError.badRequest('Only paid payments can be refunded');
  const refundable = money(p.amount - p.refunded_amount);
  const amt = money(amount ?? refundable);
  if (amt <= 0 || amt > refundable) throw ApiError.badRequest(`Refund must be between 0 and ${refundable}`);

  if (p.provider === 'stripe' && stripe) {
    await stripe.refunds.create({ payment_intent: p.provider_ref, amount: Math.round(amt * 100) });
  }
  if (p.method === 'gift_card' && p.provider_ref) {
    await query('UPDATE gift_cards SET balance = balance + $2 WHERE code = $1', [p.provider_ref, amt]);
  }
  const total = money(p.refunded_amount + amt);
  return one(
    `UPDATE payments SET refunded_amount = $2, refund_reason = $3,
            status = CASE WHEN $2 >= amount THEN 'refunded'::payment_status ELSE 'partially_refunded'::payment_status END
      WHERE id = $1 RETURNING *`,
    [paymentId, total, reason || null],
  );
}
