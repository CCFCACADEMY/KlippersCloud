/**
 * Reporting (admin). Every report accepts ?from=YYYY-MM-DD&to=YYYY-MM-DD and
 * ?format=csv for spreadsheet export.
 */
import { Router } from 'express';
import { z } from 'zod';
import { many } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/ApiError.js';
import { dateStr } from '../validators/common.js';
import { toCsv } from '../utils/helpers.js';
import { dayjs } from '../utils/time.js';

const router = Router();
router.use(authenticate, authorize('admin'));

const rangeQuery = z.object({
  from: dateStr.optional(), to: dateStr.optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
  format: z.enum(['json', 'csv']).default('json'),
});

const range = (q) => [q.from || dayjs().subtract(30, 'day').format('YYYY-MM-DD'), q.to || dayjs().format('YYYY-MM-DD')];

/** Send JSON or CSV depending on ?format. */
const send = (res, q, name, rows, extra = {}) => {
  if (q.format === 'csv') {
    res.setHeader('Content-Disposition', `attachment; filename="klippers-${name}-${dayjs().format('YYYYMMDD')}.csv"`);
    return res.type('text/csv').send(toCsv(rows));
  }
  res.json({ rows, ...extra });
};

router.get('/revenue', validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const [from, to] = range(req.query);
  const rows = await many(
    `SELECT to_char(date_trunc($3, p.paid_at), 'YYYY-MM-DD') AS period,
            count(*)::int AS transactions,
            sum(p.amount) AS gross, sum(p.tax) AS tax, sum(p.refunded_amount) AS refunds,
            sum(p.amount - p.refunded_amount - p.tax) AS net,
            sum(p.amount) FILTER (WHERE p.method = 'card') AS card,
            sum(p.amount) FILTER (WHERE p.method = 'cash') AS cash,
            sum(p.amount) FILTER (WHERE p.method = 'gift_card') AS gift_card
       FROM payments p
      WHERE p.status IN ('paid','partially_refunded','refunded') AND p.paid_at::date BETWEEN $1 AND $2
      GROUP BY 1 ORDER BY 1`, [from, to, req.query.groupBy]);
  const totals = rows.reduce((t, r) => ({ gross: t.gross + (r.gross || 0), net: t.net + (r.net || 0), tax: t.tax + (r.tax || 0), refunds: t.refunds + (r.refunds || 0) }), { gross: 0, net: 0, tax: 0, refunds: 0 });
  send(res, req.query, 'revenue', rows, { totals, from, to });
}));

router.get('/appointments', validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const [from, to] = range(req.query);
  const rows = await many(
    `SELECT to_char(date_trunc($3, start_at), 'YYYY-MM-DD') AS period, count(*)::int AS total,
            count(*) FILTER (WHERE status = 'completed')::int AS completed,
            count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
            count(*) FILTER (WHERE status = 'no_show')::int AS no_show,
            count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
            count(*) FILTER (WHERE source = 'walk_in')::int AS walk_ins,
            count(*) FILTER (WHERE source = 'guest')::int AS guest_bookings
       FROM appointments WHERE start_at::date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`, [from, to, req.query.groupBy]);
  const byHour = await many(
    `SELECT extract(hour FROM start_at AT TIME ZONE 'Asia/Kolkata')::int AS hour, count(*)::int AS bookings
       FROM appointments WHERE start_at::date BETWEEN $1 AND $2 AND status NOT IN ('cancelled','rejected') GROUP BY 1 ORDER BY 1`, [from, to]);
  send(res, req.query, 'appointments', rows, { byHour, from, to });
}));

/** Customer retention: repeat rate, cohort return within 60 days, churn risk. */
router.get('/retention', validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const [from, to] = req.query.from || req.query.to ? range(req.query) : ['1900-01-01', '2999-12-31'];
  const rows = await many(
    `WITH visits AS (
       SELECT customer_id, start_at, row_number() OVER (PARTITION BY customer_id ORDER BY start_at) AS n,
              lead(start_at) OVER (PARTITION BY customer_id ORDER BY start_at) AS next_visit
         FROM appointments WHERE status = 'completed' AND customer_id IS NOT NULL),
     firsts AS (SELECT customer_id, date_trunc('month', start_at) AS cohort, next_visit FROM visits WHERE n = 1)
     SELECT to_char(cohort, 'YYYY-MM') AS cohort, count(*)::int AS new_customers,
            count(*) FILTER (WHERE next_visit IS NOT NULL)::int AS returned,
            count(*) FILTER (WHERE next_visit <= cohort + interval '3 months')::int AS returned_within_90d,
            round(100.0 * count(*) FILTER (WHERE next_visit IS NOT NULL) / count(*), 1) AS retention_pct
       FROM firsts WHERE cohort::date BETWEEN date_trunc('month', $1::date) AND $2::date
      GROUP BY cohort ORDER BY cohort`, [from, to]);
  const [summary] = await many(
    `SELECT count(*)::int AS customers,
            count(*) FILTER (WHERE visits > 1)::int AS repeat_customers,
            round(100.0 * count(*) FILTER (WHERE visits > 1) / NULLIF(count(*),0), 1) AS repeat_rate,
            round(avg(visits)::numeric, 2) AS avg_visits,
            count(*) FILTER (WHERE last_visit < now() - interval '60 days')::int AS at_risk
       FROM (SELECT customer_id, count(*) visits, max(start_at) last_visit FROM appointments
              WHERE status = 'completed' AND customer_id IS NOT NULL GROUP BY customer_id) t`);
  send(res, req.query, 'retention', rows, { summary });
}));

router.get('/services', validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const [from, to] = range(req.query);
  const rows = await many(
    `SELECT s.name, sv.category, count(*)::int AS bookings, sum(s.price) AS revenue, round(avg(s.price)::numeric, 2) AS avg_price,
            round(100.0 * count(*) / NULLIF(sum(count(*)) OVER (), 0), 1) AS share_pct
       FROM appointment_services s JOIN appointments a ON a.id = s.appointment_id JOIN services sv ON sv.id = s.service_id
      WHERE a.status NOT IN ('cancelled','rejected') AND a.start_at::date BETWEEN $1 AND $2
      GROUP BY s.name, sv.category ORDER BY bookings DESC`, [from, to]);
  send(res, req.query, 'services', rows, { from, to });
}));

router.get('/barbers', validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const [from, to] = range(req.query);
  const rows = await many(
    `SELECT u.name AS barber, b.rating_avg AS rating, b.rating_count AS reviews,
            count(a.id)::int AS appointments,
            count(a.id) FILTER (WHERE a.status = 'completed')::int AS completed,
            count(a.id) FILTER (WHERE a.status = 'cancelled')::int AS cancelled,
            count(a.id) FILTER (WHERE a.status = 'no_show')::int AS no_shows,
            round(100.0 * count(a.id) FILTER (WHERE a.status = 'completed') / NULLIF(count(a.id), 0), 1) AS completion_pct,
            COALESCE(sum(a.total - a.tax) FILTER (WHERE a.status = 'completed'), 0) AS revenue,
            round(COALESCE(sum(a.total - a.tax) FILTER (WHERE a.status = 'completed'), 0) * b.commission_rate / 100, 2) AS earnings,
            count(DISTINCT a.customer_id)::int AS unique_customers
       FROM barbers b JOIN users u ON u.id = b.user_id
       LEFT JOIN appointments a ON a.barber_id = b.id AND a.start_at::date BETWEEN $1 AND $2
      WHERE b.is_approved GROUP BY b.id, u.name ORDER BY revenue DESC`, [from, to]);
  send(res, req.query, 'barbers', rows, { from, to });
}));

export default router;
