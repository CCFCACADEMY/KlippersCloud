/**
 * End-to-end API tests against a real PostgreSQL database.
 * WARNING: re-seeds the database configured by DATABASE_URL.
 * Run: npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seed } from '../src/db/seed.js';
import { pool } from '../src/db/pool.js';
import { runMaintenance } from '../src/jobs/reminders.job.js';
import { dayjs } from '../src/utils/time.js';

const app = createApp();
const api = () => request(app);
const tokens = {};
let barber; let services;

const login = async (email) => {
  const res = await api().post('/api/auth/login').send({ email, password: 'Password123' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.accessToken;
};
const auth = (t) => ({ Authorization: `Bearer ${t}` });

/** Find the first open slot for a barber over the next 2 weeks. */
async function firstOpenSlot(barberId, serviceIds, skip = 0) {
  for (let i = 1; i < 14; i++) {
    const date = dayjs().tz('Asia/Kolkata').add(i, 'day').format('YYYY-MM-DD');
    const res = await api().get(`/api/barbers/${barberId}/availability`).query({ date, serviceIds: serviceIds.join(',') });
    const open = res.body.slots.filter((s) => s.available);
    if (open.length > skip) return open[skip].start;
  }
  throw new Error('no slot found');
}

before(async () => {
  await seed();
  tokens.admin = await login('admin@klippers.app');
  tokens.barber = await login('arjun@klippers.app');
  tokens.customer = await login('rahul@example.com');
  barber = (await api().get('/api/barbers').query({ search: 'Arjun' })).body.barbers[0];
  services = (await api().get(`/api/barbers/${barber.id}`)).body.services;
});
after(() => pool.end());

test('health check', async () => {
  const res = await api().get('/api/health');
  assert.equal(res.body.status, 'ok');
});

test('register validates input and rejects duplicates', async () => {
  const bad = await api().post('/api/auth/register').send({ name: 'X', email: 'nope', password: '123' });
  assert.equal(bad.status, 400);
  const ok = await api().post('/api/auth/register').send({ name: 'New Person', email: 'new@example.com', password: 'Secret123' });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.accessToken);
  assert.match(ok.headers['set-cookie'][0], /klippers_rt=.*HttpOnly/);
  const dup = await api().post('/api/auth/register').send({ name: 'New Person', email: 'NEW@example.com', password: 'Secret123' });
  assert.equal(dup.status, 409);
});

test('refresh token rotation', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'ananya@example.com', password: 'Password123' });
  const r1 = await agent.post('/api/auth/refresh');
  assert.equal(r1.status, 200);
  assert.ok(r1.body.accessToken);
  const r2 = await agent.post('/api/auth/refresh');
  assert.equal(r2.status, 200, 'rotated cookie should keep working');
});

test('RBAC: customers cannot reach admin routes; guests need auth', async () => {
  assert.equal((await api().get('/api/admin/dashboard').set(auth(tokens.customer))).status, 403);
  assert.equal((await api().get('/api/admin/dashboard')).status, 401);
  assert.equal((await api().get('/api/admin/dashboard').set(auth(tokens.admin))).status, 200);
});

test('HTML is stripped from input (sanitisation)', async () => {
  const res = await api().patch('/api/auth/me').set(auth(tokens.customer)).send({ name: '<script>alert(1)</script>Rahul Verma' });
  assert.equal(res.body.user.name, 'alert(1)Rahul Verma');
  await api().patch('/api/auth/me').set(auth(tokens.customer)).send({ name: 'Rahul Verma' });
});

test('quote applies membership + coupon + tax', async () => {
  const res = await api().post('/api/appointments/quote').set(auth(tokens.customer))
    .send({ barberId: barber.id, serviceIds: [services[0].id], couponCode: 'WELCOME10' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const q = res.body.quote;
  assert.ok(q.membershipDiscount > 0, 'Rahul has Gold Club membership');
  assert.ok(q.couponDiscount > 0);
  assert.equal(q.total, Math.round((q.subtotal - q.discount + q.tax) * 100) / 100);
});

test('full booking lifecycle + double-booking prevention', async () => {
  const svc = [services[0].id];
  const startAt = await firstOpenSlot(barber.id, svc);

  const booked = await api().post('/api/appointments').set(auth(tokens.customer)).send({ barberId: barber.id, serviceIds: svc, startAt });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  const appt = booked.body.appointment;
  assert.equal(appt.status, 'confirmed'); // Arjun auto-confirms

  // Same slot again → conflict
  const dup = await api().post('/api/appointments').send({ barberId: barber.id, serviceIds: svc, startAt, guest: { name: 'Guest Two', email: 'g2@example.com', phone: '+15551234567' } });
  assert.equal(dup.status, 409);

  // Slot now shows as unavailable
  const date = dayjs(startAt).tz('Asia/Kolkata').format('YYYY-MM-DD');
  const avail = await api().get(`/api/barbers/${barber.id}/availability`).query({ date, serviceIds: svc.join(',') });
  assert.equal(avail.body.slots.find((s) => s.start === startAt).available, false);

  // Concurrent booking race for another slot — exactly one must win (DB exclusion constraint)
  const raceSlot = await firstOpenSlot(barber.id, svc, 3);
  const race = await Promise.all([1, 2, 3].map((i) => api().post('/api/appointments')
    .send({ barberId: barber.id, serviceIds: svc, startAt: raceSlot, guest: { name: `Racer ${i}`, email: `r${i}@example.com`, phone: '+15551234567' } })));
  assert.equal(race.filter((r) => r.status === 201).length, 1);
  assert.ok(race.filter((r) => r.status === 409).length === 2);

  // QR code
  const qr = await api().get(`/api/appointments/${appt.id}/qr`).set(auth(tokens.customer));
  assert.match(qr.body.dataUrl, /^data:image\/png;base64/);

  // Reschedule to another open slot
  const newStart = await firstOpenSlot(barber.id, svc, 6);
  const rs = await api().patch(`/api/appointments/${appt.id}/reschedule`).set(auth(tokens.customer)).send({ startAt: newStart });
  assert.equal(rs.status, 200, JSON.stringify(rs.body));
  assert.equal(new Date(rs.body.appointment.start_at).toISOString(), newStart);

  // Pay online (mock provider)
  const pay = await api().post(`/api/payments/appointments/${appt.id}`).set(auth(tokens.customer)).send({ method: 'card' });
  assert.equal(pay.status, 201);
  assert.equal(pay.body.payment.status, 'paid');
  const inv = await api().get(`/api/payments/${pay.body.payment.id}/invoice`).set(auth(tokens.customer));
  assert.match(inv.text, /Invoice/);

  // Cancel → automatic refund
  const cancel = await api().patch(`/api/appointments/${appt.id}/cancel`).set(auth(tokens.customer)).send({ reason: 'Change of plans' });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.refunded, true);
  assert.equal(cancel.body.appointment.status, 'cancelled');
});

test('barber accept/reject workflow, completion awards points, review', async () => {
  const vikram = (await api().get('/api/barbers').query({ search: 'Vikram' })).body.barbers[0]; // requires manual confirmation
  const vikramToken = await login('vikram@klippers.app');
  const vServices = (await api().get(`/api/barbers/${vikram.id}`)).body.services;
  const startAt = await firstOpenSlot(vikram.id, [vServices[0].id]);
  const res = await api().post('/api/appointments').set(auth(tokens.customer)).send({ barberId: vikram.id, serviceIds: [vServices[0].id], startAt });
  assert.equal(res.body.appointment.status, 'pending');
  const id = res.body.appointment.id;

  // Another barber cannot act on it
  assert.equal((await api().patch(`/api/appointments/${id}/status`).set(auth(tokens.barber)).send({ status: 'confirmed' })).status, 404);
  // Invalid transition
  assert.equal((await api().patch(`/api/appointments/${id}/status`).set(auth(vikramToken)).send({ status: 'completed' })).status, 400);

  assert.equal((await api().patch(`/api/appointments/${id}/status`).set(auth(vikramToken)).send({ status: 'confirmed' })).body.appointment.status, 'confirmed');
  const before = (await api().get('/api/me/loyalty').set(auth(tokens.customer))).body.points;
  const done = await api().patch(`/api/appointments/${id}/status`).set(auth(vikramToken)).send({ status: 'completed' });
  assert.equal(done.body.appointment.status, 'completed');
  const afterPts = (await api().get('/api/me/loyalty').set(auth(tokens.customer))).body.points;
  assert.ok(afterPts > before, 'points awarded on completion');

  const review = await api().post('/api/me/reviews').set(auth(tokens.customer)).send({ appointmentId: id, rating: 5, comment: 'Great!' });
  assert.equal(review.status, 201);
  assert.equal((await api().post('/api/me/reviews').set(auth(tokens.customer)).send({ appointmentId: id, rating: 4 })).status, 409);
});

test('guest booking + guest cancel via code', async () => {
  const startAt = await firstOpenSlot(barber.id, [services[1].id], 9);
  const res = await api().post('/api/appointments').send({
    barberId: barber.id, serviceIds: [services[1].id], startAt, guest: { name: 'Walk In Will', email: 'will@example.com', phone: '+15557654321' } });
  assert.equal(res.status, 201);
  const code = res.body.appointment.checkin_code;
  const look = await api().post('/api/appointments/guest/lookup').send({ code, email: 'will@example.com' });
  assert.equal(look.status, 200);
  const cancel = await api().post('/api/appointments/guest/cancel').send({ code, email: 'will@example.com' });
  assert.equal(cancel.body.appointment.status, 'cancelled');
});

test('time off blocks availability', async () => {
  const date = dayjs().tz('Asia/Kolkata').add(30, 'day');
  const d = date.format('YYYY-MM-DD');
  const r = await api().post('/api/barbers/me/time-off').set(auth(tokens.barber)).send({ start_date: d, end_date: d, reason: 'Conference' });
  assert.equal(r.status, 201);
  const avail = await api().get(`/api/barbers/${barber.id}/availability`).query({ date: d });
  assert.equal(avail.body.slots.length, 0);
  assert.match(avail.body.reason, /Conference/);
});

test('dashboards and reports', async () => {
  const b = await api().get('/api/barbers/me/dashboard').set(auth(tokens.barber));
  assert.equal(b.status, 200);
  assert.equal(b.body.revenue.length, 30);
  const c = await api().get('/api/me/dashboard').set(auth(tokens.customer));
  assert.ok(c.body.rewards.points >= 0);
  for (const r of ['revenue', 'appointments', 'retention', 'services', 'barbers']) {
    const res = await api().get(`/api/reports/${r}`).set(auth(tokens.admin));
    assert.equal(res.status, 200, r);
  }
  const csv = await api().get('/api/reports/revenue?format=csv').set(auth(tokens.admin));
  assert.match(csv.headers['content-type'], /text\/csv/);
});

test('admin suspends user → login blocked', async () => {
  const users = (await api().get('/api/admin/users').query({ search: 'dev@example' }).set(auth(tokens.admin))).body.users;
  await api().patch(`/api/admin/users/${users[0].id}/status`).set(auth(tokens.admin)).send({ is_active: false });
  const res = await api().post('/api/auth/login').send({ email: 'dev@example.com', password: 'Password123' });
  assert.equal(res.status, 403);
});

test('walk-in queue, AI recommendations, WhatsApp bot, gift card payment', async () => {
  const loc = (await api().get('/api/locations')).body.locations[0];
  const q = await api().post('/api/queue').send({ locationId: loc.id, name: 'Queue Person' });
  assert.equal(q.status, 201);
  assert.ok(q.body.entry.position >= 1);

  const ai = await api().post('/api/ai/recommendations').send({ faceShape: 'round', hairType: 'wavy', hairLength: 'short' });
  assert.equal(ai.status, 200);
  assert.equal(ai.body.result.recommendations.length, 3);

  const wa = await api().post('/api/webhooks/whatsapp').type('form').send({ From: 'whatsapp:+15550999', Body: 'services' });
  assert.match(wa.text, /Classic Haircut/);

  const startAt = await firstOpenSlot(barber.id, [services[0].id], 12);
  const appt = (await api().post('/api/appointments').set(auth(tokens.customer)).send({ barberId: barber.id, serviceIds: [services[0].id], startAt })).body.appointment;
  const pay = await api().post(`/api/payments/appointments/${appt.id}`).set(auth(tokens.customer)).send({ method: 'gift_card', giftCardCode: 'GIFT-DEMO-2026' });
  assert.equal(pay.status, 201, JSON.stringify(pay.body));
  const bal = await api().get('/api/gift-cards/GIFT-DEMO-2026/balance');
  assert.ok(bal.body.giftCard.balance < 2000);
});

test('reminder job runs', async () => {
  const r = await runMaintenance();
  assert.ok(typeof r.sent24h === 'number');
});

test('admin: create barber with uploaded photo, edit full profile', async () => {
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const created = await api().post('/api/admin/barbers').set(auth(tokens.admin)).send({
    name: 'Neel Joshi', email: 'neel@klippers.app', password: 'Secret1234', phone: '+919820000999',
    title: 'Junior Barber', bio: 'Loves classic cuts.', experience_years: 2, specialties: ['Classic Cuts', 'Kids Cuts'], photo_url: tinyPng,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.barber.photo_url, tinyPng);
  const id = created.body.barber.id;
  const edited = await api().patch(`/api/admin/barbers/${id}`).set(auth(tokens.admin)).send({ name: 'Neel R. Joshi', bio: 'Updated bio', specialties: ['Fades'], photo_url: '/images/barbers/rohan-das.svg' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const pub = await api().get(`/api/barbers/${id}`);
  assert.equal(pub.body.barber.name, 'Neel R. Joshi');
  assert.equal(pub.body.barber.bio, 'Updated bio');
  assert.deepEqual(pub.body.barber.specialties, ['Fades']);
  assert.ok(pub.body.services.length > 0, 'new barber offers services by default');
  const bad = await api().patch(`/api/admin/barbers/${id}`).set(auth(tokens.admin)).send({ photo_url: 'javascript:alert(1)' });
  assert.equal(bad.status, 400);
  // Only admins can create barbers
  assert.equal((await api().post('/api/admin/barbers').set(auth(tokens.barber)).send({})).status, 403);
});

test('admin: create a service with a brand-new type and INR price', async () => {
  const res = await api().post('/api/services').set(auth(tokens.admin)).send({ name: 'Head Massage (Champi)', category: 'Head Spa', duration_min: 20, price: 299 });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.service.category, 'head spa');
  const list = await api().get('/api/services').query({ category: 'head spa' });
  assert.equal(list.body.services.length, 1);
  assert.equal(list.body.services[0].price, 299);
});

test('INR pricing: GST 18% and rupee formatting', async () => {
  const s = (await api().get('/api/settings/public')).body.settings;
  assert.equal(s.currency, 'inr');
  assert.equal(s.tax_rate, 18);
  const svc = services.find((x) => x.name === 'Classic Haircut');
  const q = (await api().post('/api/appointments/quote').send({ barberId: barber.id, serviceIds: [svc.id] })).body.quote;
  assert.equal(q.tax, Math.round(q.subtotal * 0.18 * 100) / 100);
  const wa = await api().post('/api/webhooks/whatsapp').type('form').send({ From: 'whatsapp:+919820000555', Body: 'services' });
  assert.match(wa.text, /₹/);
});
