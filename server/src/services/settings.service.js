/**
 * Business settings stored as key/value JSON in the `settings` table, cached in
 * memory for 60s. Defaults guarantee the app works on an empty database.
 */
import { many, query } from '../db/pool.js';

export const DEFAULT_SETTINGS = {
  business_name: 'Klippers',
  currency: 'inr',
  tax_rate: 18,                    // percent (GST on salon services)
  booking_lead_minutes: 60,        // earliest bookable slot from "now"
  booking_window_days: 60,         // how far ahead customers can book
  cancellation_window_hours: 4,    // free cancellation before this
  loyalty_points_per_dollar: 0.1,  // points earned per currency unit spent (0.1 = 1 point per ₹10)
  loyalty_redeem_rate: 0.5,        // currency value of 1 point when redeeming (100 pts = ₹50)
  loyalty_min_redeem: 100,
  review_bonus_points: 25,
  default_timezone: 'Asia/Kolkata',
  whatsapp_enabled: true,
  contact_email: 'hello@klippers.app',
  contact_phone: '+91 22 4000 1234',
};

let cache = null;
let cachedAt = 0;

export async function getSettings() {
  // (rows with unknown keys, e.g. demo_seed_version, are passed through untouched)
  if (cache && Date.now() - cachedAt < 60_000) return cache;
  const rows = await many('SELECT key, value FROM settings');
  cache = { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  cachedAt = Date.now();
  return cache;
}

export async function updateSettings(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue; // ignore unknown keys
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
  cache = null;
  return getSettings();
}
