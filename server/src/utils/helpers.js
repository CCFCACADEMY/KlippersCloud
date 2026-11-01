import crypto from 'node:crypto';

/** Round to 2 decimal places for currency math. */
export const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** SHA-256 hex digest — used to store refresh/reset tokens without keeping the raw value. */
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Cryptographically random, URL-safe token. */
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

/** Human-friendly code (no ambiguous chars) e.g. for gift cards. */
export function randomCode(len = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out.replace(/(.{4})(?=.)/g, '$1-');
}

/** Parse pagination params with sane bounds. */
export function paginate(q, defaultLimit = 20) {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || defaultLimit, 1), 100);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}

/** Convert array of flat objects to CSV text (for report exports). */
export function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}
