/**
 * Public catalogue: services, locations, public business settings.
 * Admin-only mutations for services & locations.
 */
import { Router } from 'express';
import { z } from 'zod';
import { one, many, query } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { idParam } from '../validators/common.js';
import { getSettings } from '../services/settings.service.js';

const router = Router();
// Built-in types are haircut, beard, coloring, wash, facial, package, custom; admins can add their own.
const category = z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z0-9 &'-]+$/, 'Letters, numbers, spaces, & and - only');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// ------------------------------------------------------------ services
router.get('/services', validate({
  query: z.object({ category: category.optional(), all: z.string().optional() }),
}), asyncHandler(async (req, res) => {
  const includeInactive = req.query.all === 'true';
  const rows = await many(
    `SELECT s.*, (SELECT count(*)::int FROM barber_services bs JOIN barbers b ON b.id = bs.barber_id JOIN users u ON u.id = b.user_id
               WHERE bs.service_id = s.id AND b.is_approved AND u.is_active) AS barber_count
       FROM services s
      WHERE ($1::text IS NULL OR s.category = $1) AND ($2 OR s.is_active)
      ORDER BY s.sort_order, s.name`,
    [req.query.category || null, includeInactive],
  );
  res.json({ services: rows });
}));

router.get('/services/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const service = await one('SELECT * FROM services WHERE id = $1', [req.params.id]);
  if (!service) throw ApiError.notFound('Service not found');
  res.json({ service });
}));

const serviceBody = z.object({
  name: z.string().trim().min(2).max(80),
  category,
  description: z.string().max(1000).optional().nullable(),
  duration_min: z.coerce.number().int().min(5).max(480),
  price: z.coerce.number().min(0).max(100000),
  image_url: z.string().url().max(500).optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
});

router.post('/services', authenticate, authorize('admin'), validate({ body: serviceBody }), asyncHandler(async (req, res) => {
  const b = req.body;
  const service = await one(
    `INSERT INTO services (name, slug, category, description, duration_min, price, image_url, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,TRUE),COALESCE($9,0)) RETURNING *`,
    [b.name, `${slugify(b.name)}-${Date.now().toString(36)}`, b.category, b.description, b.duration_min, b.price, b.image_url, b.is_active, b.sort_order],
  );
  // Offer new services from every barber by default (barbers can opt out)
  await query('INSERT INTO barber_services (barber_id, service_id) SELECT id, $1 FROM barbers ON CONFLICT DO NOTHING', [service.id]);
  res.status(201).json({ service });
}));

router.patch('/services/:id', authenticate, authorize('admin'), validate({ params: idParam, body: serviceBody.partial() }),
  asyncHandler(async (req, res) => {
    const entries = Object.entries(req.body).filter(([, v]) => v !== undefined);
    if (!entries.length) throw ApiError.badRequest('Nothing to update');
    const service = await one(
      `UPDATE services SET ${entries.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [req.params.id, ...entries.map(([, v]) => v)],
    );
    if (!service) throw ApiError.notFound('Service not found');
    res.json({ service });
  }));

// Soft-delete keeps historical appointments intact
router.delete('/services/:id', authenticate, authorize('admin'), validate({ params: idParam }), asyncHandler(async (req, res) => {
  await query('UPDATE services SET is_active = FALSE WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

// ------------------------------------------------------------ locations
router.get('/locations', asyncHandler(async (_req, res) => {
  res.json({ locations: await many(
    `SELECT l.*, (SELECT count(*)::int FROM barbers b JOIN users u ON u.id = b.user_id WHERE b.location_id = l.id AND b.is_approved AND u.is_active) AS barber_count
       FROM locations l WHERE l.is_active ORDER BY l.name`) });
}));

const locationBody = z.object({
  name: z.string().trim().min(2).max(80), address: z.string().max(200), city: z.string().max(80),
  phone: z.string().max(30).optional().nullable(), timezone: z.string().max(60).optional(), is_active: z.boolean().optional(),
});

router.post('/locations', authenticate, authorize('admin'), validate({ body: locationBody }), asyncHandler(async (req, res) => {
  const b = req.body;
  res.status(201).json({ location: await one(
    `INSERT INTO locations (name, address, city, phone, timezone) VALUES ($1,$2,$3,$4,COALESCE($5,'Asia/Kolkata')) RETURNING *`,
    [b.name, b.address, b.city, b.phone, b.timezone]) });
}));

router.patch('/locations/:id', authenticate, authorize('admin'), validate({ params: idParam, body: locationBody.partial() }),
  asyncHandler(async (req, res) => {
    const e = Object.entries(req.body).filter(([, v]) => v !== undefined);
    if (!e.length) throw ApiError.badRequest('Nothing to update');
    res.json({ location: await one(
      `UPDATE locations SET ${e.map(([k], i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
      [req.params.id, ...e.map(([, v]) => v)]) });
  }));

// ------------------------------------------------------------ public settings
router.get('/settings/public', asyncHandler(async (_req, res) => {
  const s = await getSettings();
  const pick = ['business_name', 'currency', 'tax_rate', 'cancellation_window_hours', 'loyalty_points_per_dollar',
    'loyalty_redeem_rate', 'loyalty_min_redeem', 'contact_email', 'contact_phone', 'booking_window_days'];
  res.json({ settings: Object.fromEntries(pick.map((k) => [k, s[k]])) });
}));

export default router;
