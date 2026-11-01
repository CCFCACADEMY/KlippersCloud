/**
 * Sample seed data — DESTRUCTIVE: wipes all Klippers tables first.
 * Usage: npm run seed
 *
 * Demo accounts (password for all: Password123)
 *   admin@klippers.app        — Admin
 *   marcus@klippers.app       — Barber (plus 5 more barbers)
 *   john@example.com          — Customer (plus 9 more customers)
 */
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from './pool.js';
import { migrate } from './migrate.js';
import { dayjs } from '../utils/time.js';
import { DEFAULT_SETTINGS } from '../services/settings.service.js';

const TZ = 'America/New_York';
const PASSWORD = 'Password123';

// Deterministic PRNG so the seed produces the same data every run
let s = 42;
const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const SERVICES = [
  ['Classic Haircut', 'haircut', 'Precision scissor & clipper cut, styled to finish.', 30, 35],
  ['Skin Fade', 'haircut', 'Seamless skin fade blended to perfection.', 45, 42],
  ['Kids Cut', 'haircut', 'Haircut for little gents under 12.', 25, 25],
  ['Beard Trim & Shape', 'beard', 'Line-up, shape and conditioning beard oil.', 20, 20],
  ['Hot Towel Shave', 'beard', 'Traditional straight-razor shave with hot towels.', 30, 38],
  ['Hair Coloring', 'coloring', 'Full color, grey blending or highlights.', 60, 70],
  ['Hair Wash & Style', 'wash', 'Relaxing shampoo, scalp massage and blow-dry.', 15, 15],
  ['Charcoal Facial', 'facial', 'Deep-cleansing charcoal mask and steam.', 30, 40],
  ['The Gentleman Package', 'package', 'Haircut + hot towel shave + facial. The full experience.', 90, 95],
  ['Groom Package', 'package', 'Wedding-day cut, shave & styling consultation.', 120, 150],
  ['Hair Design / Part', 'custom', 'Custom razor designs and hard parts.', 15, 12],
];

const BARBERS = [
  ['Marcus Reed', 'marcus', 'Master Barber', 12, ['Skin Fades', 'Beard Sculpting', 'Hot Towel Shaves'], 'men/32', 0, true],
  ['Diego Alvarez', 'diego', 'Senior Barber', 8, ['Textured Crops', 'Designs', 'Curly Hair'], 'men/45', 0, false],
  ['Sophie Chen', 'sophie', 'Color Specialist', 6, ['Hair Coloring', 'Highlights', 'Long Hair'], 'women/44', 0, true],
  ['Andre Williams', 'andre', 'Barber', 4, ['Tapers', 'Waves', 'Line-ups'], 'men/75', 1, false],
  ['Liam O\'Connor', 'liam', 'Senior Barber', 10, ['Classic Cuts', 'Pompadours', 'Straight Razor'], 'men/11', 1, true],
  ['Kofi Mensah', 'kofi', 'Barber', 3, ['Afro Cuts', 'Twists', 'Beard Care'], 'men/86', 1, false],
];

const CUSTOMERS = [
  ['John Carter', 'john@example.com', '+15550101'], ['Emily Brooks', 'emily@example.com', '+15550102'],
  ['Michael Torres', 'michael@example.com', '+15550103'], ['David Kim', 'david@example.com', '+15550104'],
  ['Chris Johnson', 'chris@example.com', '+15550105'], ['Ryan Patel', 'ryan@example.com', '+15550106'],
  ['Olivia Martin', 'olivia@example.com', '+15550107'], ['James Wilson', 'james@example.com', '+15550108'],
  ['Noah Garcia', 'noah@example.com', '+15550109'], ['Ethan Brown', 'ethan@example.com', '+15550110'],
];

const REVIEWS = [
  [5, 'Best fade I have ever had. Attention to detail is unreal.'],
  [5, 'Super friendly, on time, and the hot towel shave was amazing.'],
  [4, 'Great cut, a little wait but worth it.'],
  [5, 'Finally found my barber. Booking through the app was seamless.'],
  [4, 'Solid experience, will be back.'],
  [5, 'Listened to exactly what I wanted. 10/10.'],
  [3, 'Good cut but felt a bit rushed.'],
];

export async function seed() {
  await migrate();
  const hash = await bcrypt.hash(PASSWORD, 10);

  await withTransaction(async (c) => {
    await c.query(`TRUNCATE settings, gift_cards, memberships, membership_plans, gallery_items, queue_entries, waitlist,
      customer_notes, favorites, notifications, loyalty_transactions, reviews, payments, coupon_redemptions,
      appointment_services, appointments, coupons, barber_services, services, time_off, working_hours, barbers,
      refresh_tokens, users, locations RESTART IDENTITY CASCADE`);
    await c.query("SELECT setval('invoice_seq', 1001, false)");
    const q = async (sql, params) => (await c.query(sql, params)).rows;

    // ---- settings
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      await q('INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)', [k, JSON.stringify(v)]);
    }

    // ---- locations
    const locations = await q(`INSERT INTO locations (name, address, city, phone, timezone) VALUES
      ('Klippers Downtown', '120 Main Street', 'New York', '+1 555 0100', $1),
      ('Klippers Brooklyn', '45 Bedford Ave', 'Brooklyn', '+1 555 0200', $1) RETURNING id`, [TZ]);

    // ---- admin
    await q("INSERT INTO users (name, email, phone, password_hash, role) VALUES ('Alex Morgan', 'admin@klippers.app', '+15550001', $1, 'admin')", [hash]);

    // ---- services
    const services = [];
    for (const [i, [name, category, description, duration, price]] of SERVICES.entries()) {
      const [row] = await q(
        `INSERT INTO services (name, slug, category, description, duration_min, price, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), category, description, duration, price, i]);
      services.push(row);
    }

    // ---- barbers (+ hours, services)
    const barbers = [];
    for (const [name, handle, title, years, specialties, photo, loc, autoConfirm] of BARBERS) {
      const [u] = await q("INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1,$2,$3,$4,'barber') RETURNING id",
        [name, `${handle}@klippers.app`, `+1555020${barbers.length}`, hash]);
      const [b] = await q(
        `INSERT INTO barbers (user_id, location_id, title, bio, experience_years, specialties, photo_url, auto_confirm, is_approved, commission_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9) RETURNING *`,
        [u.id, locations[loc].id, title,
          `${name.split(' ')[0]} has ${years} years behind the chair and specialises in ${specialties.slice(0, 2).join(' and ').toLowerCase()}. Precision, conversation and a great finish every time.`,
          years, specialties, `https://randomuser.me/api/portraits/${photo}.jpg`, autoConfirm, years >= 8 ? 65 : 55]);
      b.user_id = u.id; b.name = name;
      barbers.push(b);
      // Mon–Sat 9–18 with lunch break, Sunday off; one barber works late Thursdays
      for (let d = 0; d < 7; d++) {
        await q(`INSERT INTO working_hours (barber_id, day_of_week, is_off, start_time, end_time, break_start, break_end)
                 VALUES ($1,$2,$3,'09:00',$4,'13:00','13:30')`, [b.id, d, d === 0, d === 4 && barbers.length === 1 ? '20:00' : '18:00']);
      }
      for (const svc of services) {
        if (svc.category === 'coloring' && !specialties.some((x) => x.includes('Color'))) continue; // only colorists offer coloring
        const custom = years >= 10 && svc.category === 'haircut' ? Number(svc.price) + 5 : null;  // senior premium
        await q('INSERT INTO barber_services (barber_id, service_id, custom_price) VALUES ($1,$2,$3)', [b.id, svc.id, custom]);
      }
    }
    // Vacation for one barber next month
    await q("INSERT INTO time_off (barber_id, start_date, end_date, reason) VALUES ($1, current_date + 20, current_date + 24, 'Vacation')", [barbers[1].id]);

    // ---- customers
    const customers = [];
    for (const [name, email, phone] of CUSTOMERS) {
      const [u] = await q("INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1,$2,$3,$4,'customer') RETURNING id, name", [name, email, phone, hash]);
      customers.push(u);
    }

    // ---- coupons
    await q(`INSERT INTO coupons (code, description, discount_type, discount_value, min_amount, max_uses, per_user_limit, valid_until) VALUES
      ('WELCOME10', '10% off your first visit', 'percent', 10, 0, NULL, 1, now() + interval '1 year'),
      ('FRESH5', '$5 off any service over $30', 'fixed', 5, 30, 500, 3, now() + interval '6 months'),
      ('SUMMER20', '20% off — summer special', 'percent', 20, 40, 100, 1, now() + interval '2 months')`);

    // ---- membership plans
    const plans = await q(`INSERT INTO membership_plans (name, description, price_monthly, discount_percent, included_cuts, points_multiplier, perks) VALUES
      ('Silver Club', 'For the regular who likes to stay sharp.', 29, 10, 0, 1.25, ARRAY['10% off all services', '1.25× loyalty points', 'Priority waitlist']),
      ('Gold Club', 'Unlimited style, monthly.', 59, 15, 1, 1.5, ARRAY['1 free haircut / month', '15% off all services', '1.5× loyalty points', 'Free beard trims']),
      ('Black Card', 'The ultimate grooming membership.', 99, 25, 2, 2, ARRAY['2 free haircuts / month', '25% off everything', '2× loyalty points', 'Free monthly facial', 'Skip-the-queue']) RETURNING id`);
    await q("INSERT INTO memberships (user_id, plan_id, renews_at) VALUES ($1, $2, now() + interval '20 days')", [customers[0].id, plans[1].id]);

    // ---- historical + upcoming appointments
    let invoice = 1001;
    const now = dayjs().tz(TZ);
    const book = async ({ customer, barber, svcList, start, status, source = 'online' }) => {
      const subtotal = svcList.reduce((t, x) => t + Number(x.price), 0);
      const duration = svcList.reduce((t, x) => t + x.duration_min, 0);
      const tax = Math.round(subtotal * DEFAULT_SETTINGS.tax_rate) / 100;
      const [a] = await q(
        `INSERT INTO appointments (customer_id, guest_name, guest_email, guest_phone, barber_id, location_id, start_at, end_at, status, source,
                                   subtotal, tax, total, reminder_24h_sent, reminder_1h_sent, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14, $7::timestamptz - interval '3 days') RETURNING *`,
        [customer?.id || null, customer ? null : 'Walk-in Guest', customer ? null : 'guest@example.com', customer ? null : '+15559999',
          barber.id, barber.location_id, start.toDate(), start.add(duration, 'minute').toDate(), status, source,
          subtotal, tax, subtotal + tax, start.isBefore(now)]);
      for (const x of svcList) {
        await q('INSERT INTO appointment_services (appointment_id, service_id, name, price, duration_min) VALUES ($1,$2,$3,$4,$5)', [a.id, x.id, x.name, x.price, x.duration_min]);
      }
      return a;
    };

    const haircutish = services.filter((x) => ['haircut', 'beard', 'package', 'wash', 'facial'].includes(x.category));
    const taken = new Map();
    for (let dayOffset = -90; dayOffset <= 14; dayOffset++) {
      const day = now.add(dayOffset, 'day');
      if (day.day() === 0) continue; // closed Sundays
      for (const barber of barbers) {
        const perDay = dayOffset < 0 ? Math.floor(rand() * 4) + 1 : Math.floor(rand() * 3);
        for (let k = 0; k < perDay; k++) {
          const hour = pick([9, 10, 11, 14, 15, 16, 17]);
          const start = day.hour(hour).minute(0).second(0).millisecond(0);
          if (dayOffset >= 0 && start.isBefore(now.add(1, 'hour'))) continue;
          const customer = rand() < 0.12 ? null : pick(customers);
          const svcList = rand() < 0.25 ? [pick(haircutish.filter((x) => x.category === 'haircut')), services[3]] : [pick(haircutish)];
          const end = start.add(svcList.reduce((t, x) => t + x.duration_min, 0), 'minute');
          if (end.isAfter(start.hour(18).minute(0))) continue;
          if (start.hour() < 13 && end.isAfter(start.hour(13).minute(0))) continue; // keep lunch break free
          // Skip if this overlaps an appointment already placed for the barber
          const key = `${barber.id}-${day.format('YYYY-MM-DD')}`;
          const busy = taken.get(key) || [];
          if (busy.some(([x, y]) => start.valueOf() < y && end.valueOf() > x)) continue;
          taken.set(key, [...busy, [start.valueOf(), end.valueOf()]]);
          const past = dayOffset < 0;
          const r = rand();
          const status = past ? (r < 0.82 ? 'completed' : r < 0.93 ? 'cancelled' : 'no_show') : (barber.auto_confirm || r < 0.6 ? 'confirmed' : 'pending');
          const a = await book({ customer, barber, svcList, start, status, source: customer ? 'online' : 'walk_in' });

          if (status === 'completed') {
            const method = rand() < 0.6 ? 'card' : 'cash';
            await q(`INSERT INTO payments (user_id, appointment_id, amount, tax, method, status, provider, invoice_number, paid_at, created_at)
                     VALUES ($1,$2,$3,$4,$5,'paid',$6,$7,$8,$8)`,
              [customer?.id || null, a.id, a.total, a.tax, method, method === 'card' ? 'mock' : 'internal', `KLP-${start.year()}-${invoice++}`, a.end_at]);
            if (customer) {
              const pts = Math.floor(a.subtotal);
              await q('INSERT INTO loyalty_transactions (user_id, points, reason, appointment_id, created_at) VALUES ($1,$2,$3,$4,$5)', [customer.id, pts, 'Earned from visit', a.id, a.end_at]);
              if (rand() < 0.45) {
                const [rating, comment] = pick(REVIEWS);
                await q('INSERT INTO reviews (appointment_id, customer_id, barber_id, rating, comment, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
                  [a.id, customer.id, barber.id, rating, comment, a.end_at]);
              }
            }
          }
        }
      }
    }

    // Refresh cached aggregates
    await q('UPDATE users u SET loyalty_points = COALESCE((SELECT sum(points) FROM loyalty_transactions t WHERE t.user_id = u.id), 0)');
    await q(`UPDATE barbers b SET rating_avg = COALESCE((SELECT round(avg(rating)::numeric, 2) FROM reviews r WHERE r.barber_id = b.id), 0),
                                  rating_count = (SELECT count(*) FROM reviews r WHERE r.barber_id = b.id)`);
    await q(`SELECT setval('invoice_seq', $1)`, [invoice]);

    // ---- favourites, notes, waitlist, queue, gallery, gift card, notifications
    await q('INSERT INTO favorites (user_id, barber_id) VALUES ($1,$2), ($1,$3), ($4,$2)', [customers[0].id, barbers[0].id, barbers[2].id, customers[1].id]);
    await q("INSERT INTO customer_notes (barber_id, customer_id, note) VALUES ($1,$2,'Prefers #2 on the sides, scissor cut on top. Sensitive skin — use aloe after shave.')", [barbers[0].id, customers[0].id]);
    await q("INSERT INTO waitlist (customer_id, barber_id, service_id, desired_date) VALUES ($1,$2,$3, current_date + 2)", [customers[3].id, barbers[0].id, services[1].id]);
    await q(`INSERT INTO queue_entries (location_id, name, phone, service_id, status) VALUES
      ($1, 'Tom Becker', '+15550301', $2, 'serving'), ($1, 'Sam Rivera', '+15550302', $3, 'waiting'), ($1, 'Lee Park', NULL, $2, 'waiting')`,
    [locations[0].id, services[0].id, services[3].id]);

    const gallery = [
      ['Skin fade transformation', ['fade', 'short']], ['Beard sculpt & line-up', ['beard']], ['Textured crop', ['crop', 'textured']],
      ['Classic side part', ['classic']], ['Platinum color', ['color']], ['Curly taper', ['curly', 'taper']],
    ];
    for (const [i, [title, tags]] of gallery.entries()) {
      await q('INSERT INTO gallery_items (barber_id, title, before_url, after_url, tags) VALUES ($1,$2,$3,$4,$5)',
        [barbers[i % barbers.length].id, title, `https://picsum.photos/seed/klippers${i}/600/600?grayscale`, `https://picsum.photos/seed/klippers${i}/600/600`, tags]);
    }
    await q(`INSERT INTO gift_cards (code, initial_amount, balance, purchaser_id, recipient_name, recipient_email, message, expires_at)
             VALUES ('GIFT-DEMO-2026', 100, 100, $1, 'Emily Brooks', 'emily@example.com', 'Happy birthday!', now() + interval '1 year')`, [customers[0].id]);
    await q(`INSERT INTO notifications (user_id, type, title, body) VALUES
      ($1, 'welcome', 'Welcome to Klippers!', 'Thanks for joining. Book your first cut and start earning loyalty points!'),
      ($1, 'promo', 'Summer special ☀', 'Use code SUMMER20 for 20% off services over $40.')`, [customers[0].id]);
  });

  const { rows: [counts] } = await pool.query(`SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM appointments) appointments,
    (SELECT count(*) FROM payments) payments, (SELECT count(*) FROM reviews) reviews`);
  return counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .then((c) => {
      console.log('✔ Seed complete:', c);
      console.log(`  Admin:    admin@klippers.app / ${PASSWORD}`);
      console.log(`  Barber:   marcus@klippers.app / ${PASSWORD}`);
      console.log(`  Customer: john@example.com / ${PASSWORD}`);
      return pool.end();
    })
    .catch((e) => { console.error('✖ Seed failed:', e); process.exit(1); });
}
