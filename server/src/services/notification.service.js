/**
 * Multi-channel notifications: in-app (DB + real-time socket "push"), email
 * (SMTP via Nodemailer) and SMS (Twilio REST API). Channels without credentials
 * fall back to logging so local development needs no external accounts.
 * Delivery failures never break the calling request.
 */
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { one } from '../db/pool.js';
import { emit } from './socket.js';

const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host, port: env.smtp.port, secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const emailTemplate = (title, body) => `
<div style="font-family:Inter,Arial,sans-serif;background:#150c1f;padding:32px">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">
    <div style="background:#2e1b45;color:#d4af37;padding:20px 24px;font-size:22px;font-weight:700;letter-spacing:1px">✂ KLIPPERS</div>
    <div style="padding:24px;color:#222">
      <h2 style="margin:0 0 12px">${escapeHtml(title)}</h2>
      <p style="line-height:1.6;white-space:pre-line">${escapeHtml(body)}</p>
      <a href="${env.clientUrl}/dashboard" style="display:inline-block;margin-top:16px;background:#d4af37;color:#111;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open Klippers</a>
    </div>
  </div>
</div>`;

export async function sendEmail(to, subject, text) {
  if (!to) return false;
  if (!transporter) {
    if (!env.isTest) console.log(`[email:dev] → ${to} | ${subject}`);
    return true;
  }
  try {
    await transporter.sendMail({ from: env.smtp.from, to, subject, text, html: emailTemplate(subject, text) });
    return true;
  } catch (e) {
    console.error('[email] failed', e.message);
    return false;
  }
}

export async function sendSms(to, body) {
  if (!to) return false;
  if (!env.twilio.sid) {
    if (!env.isTest) console.log(`[sms:dev] → ${to} | ${body}`);
    return true;
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilio.sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${env.twilio.sid}:${env.twilio.token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: env.twilio.from, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}`);
    return true;
  } catch (e) {
    console.error('[sms] failed', e.message);
    return false;
  }
}

/**
 * Notify a registered user on all channels they opted into.
 * @param {string} userId
 * @param {{type:string,title:string,body:string,data?:object,sms?:boolean,email?:boolean}} n
 */
export async function notifyUser(userId, { type, title, body, data = {}, sms = true, email = true }) {
  if (!userId) return null;
  try {
    const user = await one('SELECT id, email, phone, notify_email, notify_sms, notify_push FROM users WHERE id = $1', [userId]);
    if (!user) return null;
    const channels = ['in_app'];
    if (email && user.notify_email && (await sendEmail(user.email, title, body))) channels.push('email');
    if (sms && user.notify_sms && user.phone && (await sendSms(user.phone, `Klippers: ${body}`))) channels.push('sms');
    const notification = await one(
      `INSERT INTO notifications (user_id, type, title, body, data, channels)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [userId, type, title, body, data, channels],
    );
    // Real-time push to any open browser tab (shown as a browser Notification by the client)
    if (user.notify_push) emit(`user:${userId}`, 'notification', notification);
    return notification;
  } catch (e) {
    console.error('[notify] failed', e.message);
    return null;
  }
}

/** Notify a guest (no account) by email/SMS only. */
export async function notifyGuest({ email, phone }, title, body) {
  await Promise.all([sendEmail(email, title, body), sendSms(phone, `Klippers: ${body}`)]);
}
