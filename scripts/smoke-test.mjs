#!/usr/bin/env node
/**
 * Klippers smoke test — checks a deployed instance end to end over HTTP.
 * Zero dependencies (Node 18+).
 *
 *   node scripts/smoke-test.mjs https://klippers.onrender.com
 *
 * Uses the demo accounts (SEED_ON_EMPTY=true). Creates one guest booking
 * and immediately cancels it, so it leaves no lasting data behind.
 */
const BASE = (process.argv[2] || process.env.SMOKE_URL || 'http://localhost:4000').replace(/\/+$/, '');
const PASSWORD = process.env.SMOKE_PASSWORD || 'Password123';
let passed = 0; let failed = 0;

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };

async function check(name, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    passed++;
    console.log(`${c.g('✔')} ${name} ${c.d(`${note ? `— ${note} ` : ''}(${Date.now() - t}ms)`)}`);
  } catch (e) {
    failed++;
    console.log(`${c.r('✖')} ${name}\n    ${c.r(e.message)}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function http(path, { method = 'GET', body, token, cookie, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: 'manual',
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(cookie && { Cookie: cookie }),
    },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, json, text, raw };
}

async function login(email) {
  const r = await http('/api/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  assert(r.status === 200, `login ${email} → HTTP ${r.status}: ${r.json?.error?.message || r.text.slice(0, 120)}`);
  return r;
}

console.log(`\nKlippers smoke test → ${BASE}\n`);

// Free hosting tiers sleep when idle: wait for the instance to wake and finish booting.
await check('Service is up (/api/health)', async () => {
  const deadline = Date.now() + 180_000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const r = await http('/api/health');
      if (r.status === 200 && r.json?.status === 'ok') return 'healthy';
      last = `HTTP ${r.status} ${r.text.slice(0, 80)}`;
    } catch (e) { last = e.message; }
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error(`not healthy after 3 minutes (${last})`);
});

await check('Web app served (/login → HTML)', async () => {
  const r = await http('/login');
  assert(r.status === 200, `HTTP ${r.status}`);
  assert(/<div id="root">/.test(r.text), 'response is not the React app');
  const js = r.text.match(/\/assets\/[^"]+\.js/);
  assert(js, 'no JS bundle referenced');
  const a = await fetch(BASE + js[0]);
  assert(a.ok, `bundle ${js[0]} → HTTP ${a.status}`);
  return 'index.html + bundle OK';
});

await check('Security headers', async () => {
  const r = await http('/login');
  const missing = ['content-security-policy', 'x-content-type-options', 'strict-transport-security']
    .filter((h) => !r.headers.get(h));
  assert(!missing.length, `missing: ${missing.join(', ')}`);
});

await check('Public catalogue (services, barbers, locations)', async () => {
  const [s, b, l] = await Promise.all([http('/api/services'), http('/api/barbers'), http('/api/locations')]);
  assert(s.json?.services?.length > 0, 'no services — was demo data seeded? (SEED_ON_EMPTY=true)');
  assert(b.json?.barbers?.length > 0, 'no barbers');
  assert(l.json?.locations?.length > 0, 'no locations');
  return `${s.json.services.length} services, ${b.json.barbers.length} barbers, ${l.json.locations.length} locations`;
});

const tokens = {};
for (const [role, email, home] of [['customer', 'rahul@example.com', '/api/me/dashboard'],
  ['barber', 'arjun@klippers.app', '/api/barbers/me/dashboard'], ['admin', 'admin@klippers.app', '/api/admin/dashboard']]) {
  await check(`Login as ${role} + dashboard`, async () => {
    const r = await login(email);
    assert(r.json.user.role === role, `expected role ${role}, got ${r.json.user.role}`);
    tokens[role] = r.json.accessToken;
    const setCookie = r.headers.get('set-cookie') || '';
    assert(/klippers_rt=/.test(setCookie), 'no refresh cookie set');
    assert(/HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie), 'refresh cookie must be HttpOnly + Secure');
    tokens[`${role}Cookie`] = setCookie.split(';')[0];
    const d = await http(home, { token: tokens[role] });
    assert(d.status === 200, `dashboard → HTTP ${d.status}`);
  });
}

await check('Session refresh (refresh-token rotation)', async () => {
  const r = await http('/api/auth/refresh', { method: 'POST', cookie: tokens.customerCookie });
  assert(r.status === 200 && r.json?.accessToken, `HTTP ${r.status}`);
});

await check('Role-based access control', async () => {
  const anon = await http('/api/admin/dashboard');
  const cust = await http('/api/admin/dashboard', { token: tokens.customer });
  assert(anon.status === 401, `anonymous → ${anon.status}, expected 401`);
  assert(cust.status === 403, `customer → ${cust.status}, expected 403`);
});

await check('Wrong password rejected', async () => {
  const r = await http('/api/auth/login', { method: 'POST', body: { email: 'rahul@example.com', password: 'wrong-password-1' } });
  assert(r.status === 401, `HTTP ${r.status}`);
});

let barberId; let serviceId; let slot;
await check('Availability & price quote', async () => {
  const b = (await http('/api/barbers?search=Arjun')).json.barbers[0];
  barberId = b.id;
  serviceId = (await http(`/api/barbers/${barberId}`)).json.services[0].id;
  for (let i = 3; i < 21 && !slot; i++) {
    const date = new Date(Date.now() + i * 864e5).toISOString().slice(0, 10);
    const r = await http(`/api/barbers/${barberId}/availability?date=${date}&serviceIds=${serviceId}`);
    slot = r.json?.slots?.find((s) => s.available)?.start;
  }
  assert(slot, 'no open slot in the next 3 weeks');
  const q = await http('/api/appointments/quote', { method: 'POST', body: { barberId, serviceIds: [serviceId], couponCode: 'WELCOME10' } });
  assert(q.status === 200 && q.json.quote.total > 0, `quote → HTTP ${q.status}`);
  return `slot ${slot}, total ₹${q.json.quote.total}`;
});

let booking;
await check('Guest booking → double-booking blocked → cancel', async () => {
  const guest = { name: 'Smoke Test', email: 'smoke-test@example.com', phone: '+15550000000' };
  const r = await http('/api/appointments', { method: 'POST', body: { barberId, serviceIds: [serviceId], startAt: slot, guest } });
  assert(r.status === 201, `booking → HTTP ${r.status}: ${r.json?.error?.message}`);
  booking = r.json.appointment;
  const dup = await http('/api/appointments', { method: 'POST', body: { barberId, serviceIds: [serviceId], startAt: slot, guest } });
  assert(dup.status === 409, `second booking of the same slot → HTTP ${dup.status}, expected 409`);
  const cancel = await http('/api/appointments/guest/cancel', { method: 'POST', body: { code: booking.checkin_code, email: guest.email } });
  assert(cancel.json?.appointment?.status === 'cancelled', `cancel → HTTP ${cancel.status}`);
  return `code ${booking.checkin_code}`;
});

await check('Reports (admin)', async () => {
  const r = await http('/api/reports/revenue', { token: tokens.admin });
  assert(r.status === 200, `HTTP ${r.status}`);
});

await check('Real-time socket handshake', async () => {
  const r = await http('/socket.io/?EIO=4&transport=polling');
  assert(r.status === 200 && r.text.includes('"sid"'), `HTTP ${r.status}`);
});

console.log(`\n${failed ? c.r(`${failed} failed`) : c.g('All checks passed')} · ${passed} passed\n`);
process.exit(failed ? 1 : 0);
