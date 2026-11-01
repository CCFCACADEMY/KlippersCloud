/**
 * Token strategy
 * - Access token: short-lived JWT (default 15 min) sent as `Authorization: Bearer`.
 * - Refresh token: long-lived opaque random string in an httpOnly, SameSite cookie.
 *   Only its SHA-256 hash is stored; each use rotates it (old one revoked), so a
 *   stolen-and-replayed token is detectable and short-lived.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query, one } from '../db/pool.js';
import { randomToken, sha256 } from './helpers.js';

export const REFRESH_COOKIE = 'klippers_rt';

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessTtl,
    issuer: 'klippers',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret, { issuer: 'klippers' });
}

export async function issueRefreshToken(userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + env.refreshTtlDays * 864e5);
  await query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [userId, sha256(token), expires]);
  return { token, expires };
}

/** Validates and rotates a refresh token. Returns the user row or null. */
export async function rotateRefreshToken(token) {
  const row = await one(
    `UPDATE refresh_tokens SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [sha256(token)],
  );
  if (!row) return null;
  return one('SELECT * FROM users WHERE id = $1 AND is_active', [row.user_id]);
}

export const revokeRefreshToken = (token) =>
  query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [sha256(token)]);

export const refreshCookieOptions = (expires) => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax', // 'none' allows separate API/web domains over HTTPS
  path: '/api/auth',
  expires,
});
