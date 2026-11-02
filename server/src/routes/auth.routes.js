/**
 * Authentication: register, login, Google sign-in, refresh-token rotation,
 * logout, password reset, and "me" profile management.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { one, query, withTransaction } from '../db/pool.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { email, password, phone } from '../validators/common.js';
import {
  signAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken,
  REFRESH_COOKIE, refreshCookieOptions,
} from '../utils/jwt.js';
import { randomToken, sha256 } from '../utils/helpers.js';
import { env } from '../config/env.js';
import { sendEmail, notifyUser } from '../services/notification.service.js';

const router = Router();
const BCRYPT_ROUNDS = 12;
// Real hash used to equalise timing when the email does not exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const googleClient = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

/** Shape returned to the client — never includes secrets. */
export async function publicUser(id) {
  return one(
    `SELECT u.id, u.role, u.name, u.email, u.phone, u.avatar_url, u.loyalty_points,
            u.notify_email, u.notify_sms, u.notify_push, u.created_at,
            b.id AS barber_id, b.is_approved AS barber_approved, b.location_id
       FROM users u LEFT JOIN barbers b ON b.user_id = u.id WHERE u.id = $1`,
    [id],
  );
}

async function sendSession(res, user, status = 200) {
  const { token, expires } = await issueRefreshToken(user.id);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(expires));
  res.status(status).json({ accessToken: signAccessToken(user), user: await publicUser(user.id) });
}

// ---------------------------------------------------------------- register
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  phone: phone.optional(),
  password,
  role: z.enum(['customer', 'barber']).default('customer'),
});

router.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(async (req, res) => {
  const { name, email: mail, phone: tel, password: pw, role } = req.body;
  const exists = await one('SELECT 1 FROM users WHERE lower(email) = $1', [mail]);
  if (exists) throw ApiError.conflict('Email is already registered');
  const hash = await bcrypt.hash(pw, BCRYPT_ROUNDS);

  const user = await withTransaction(async (c) => {
    const { rows: [u] } = await c.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, mail, tel || null, hash, role],
    );
    if (role === 'barber') {
      // Barbers self-register into a pending state; an admin approves them.
      const { rows: [b] } = await c.query('INSERT INTO barbers (user_id) VALUES ($1) RETURNING id', [u.id]);
      await c.query(
        `INSERT INTO working_hours (barber_id, day_of_week, is_off)
         SELECT $1, d, d = 0 FROM generate_series(0,6) d`, [b.id],
      );
    }
    return u;
  });

  notifyUser(user.id, {
    type: 'welcome', title: 'Welcome to Klippers!', sms: false,
    body: role === 'barber'
      ? 'Your barber account was created. An admin will review and approve your profile shortly.'
      : 'Thanks for joining. Book your first cut and start earning loyalty points!',
  });
  await sendSession(res, user, 201);
}));

// ---------------------------------------------------------------- login
router.post('/login', authLimiter, validate({ body: z.object({ email, password: z.string().min(1).max(128) }) }),
  asyncHandler(async (req, res) => {
    const user = await one('SELECT * FROM users WHERE lower(email) = $1', [req.body.email]);
    // Compare against a dummy hash when user is missing to keep timing constant
    const ok = await bcrypt.compare(req.body.password, user?.password_hash || DUMMY_HASH);
    if (!user || !ok) throw ApiError.unauthorized('Invalid email or password');
    if (!user.is_active) throw ApiError.forbidden('Your account has been suspended. Contact support.');
    await sendSession(res, user);
  }));

// ---------------------------------------------------------------- google
router.post('/google', authLimiter, validate({ body: z.object({ credential: z.string().min(10) }) }),
  asyncHandler(async (req, res) => {
    if (!googleClient) throw ApiError.badRequest('Google sign-in is not configured');
    const ticket = await googleClient.verifyIdToken({ idToken: req.body.credential, audience: env.googleClientId })
      .catch(() => { throw ApiError.unauthorized('Invalid Google credential'); });
    const p = ticket.getPayload();
    if (!p?.email_verified) throw ApiError.unauthorized('Google email is not verified');

    let user = await one('SELECT * FROM users WHERE google_id = $1 OR lower(email) = lower($2)', [p.sub, p.email]);
    if (!user) {
      user = await one(
        'INSERT INTO users (name, email, google_id, avatar_url) VALUES ($1,$2,$3,$4) RETURNING *',
        [p.name || p.email.split('@')[0], p.email.toLowerCase(), p.sub, p.picture || null],
      );
    } else if (!user.google_id) {
      user = await one('UPDATE users SET google_id = $2, avatar_url = COALESCE(avatar_url, $3) WHERE id = $1 RETURNING *', [user.id, p.sub, p.picture]);
    }
    if (!user.is_active) throw ApiError.forbidden('Your account has been suspended');
    await sendSession(res, user);
  }));

// ---------------------------------------------------------------- refresh / logout
router.post('/refresh', asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('No session');
  const user = await rotateRefreshToken(token);
  if (!user) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    throw ApiError.unauthorized('Session expired');
  }
  await sendSession(res, user);
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.status(204).end();
}));

// ---------------------------------------------------------------- password reset
router.post('/forgot-password', authLimiter, validate({ body: z.object({ email }) }), asyncHandler(async (req, res) => {
  const user = await one('SELECT id, email FROM users WHERE lower(email) = $1 AND is_active', [req.body.email]);
  if (user) {
    const token = randomToken(32);
    await query("UPDATE users SET reset_token_hash = $2, reset_expires_at = now() + interval '1 hour' WHERE id = $1", [user.id, sha256(token)]);
    await sendEmail(user.email, 'Reset your Klippers password',
      `Use this link within 1 hour to reset your password:\n${env.clientUrl}/reset-password?token=${token}`);
  }
  // Same response either way to avoid leaking which emails are registered
  res.json({ message: 'If that email exists, a reset link has been sent.' });
}));

router.post('/reset-password', authLimiter, validate({ body: z.object({ token: z.string().min(20, 'Reset link is invalid or has expired'), password }) }),
  asyncHandler(async (req, res) => {
    const hash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
    const user = await one(
      `UPDATE users SET password_hash = $2, reset_token_hash = NULL, reset_expires_at = NULL, updated_at = now()
        WHERE reset_token_hash = $1 AND reset_expires_at > now() RETURNING id`,
      [sha256(req.body.token), hash],
    );
    if (!user) throw ApiError.badRequest('Reset link is invalid or has expired');
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [user.id]);
    res.json({ message: 'Password updated. Please sign in.' });
  }));

// ---------------------------------------------------------------- me
router.get('/me', authenticate, asyncHandler(async (req, res) => res.json({ user: await publicUser(req.user.id) })));

router.patch('/me', authenticate, validate({
  body: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: phone.optional().nullable(),
    avatar_url: z.string().url().max(500).optional().nullable(),
    notify_email: z.boolean().optional(),
    notify_sms: z.boolean().optional(),
    notify_push: z.boolean().optional(),
  }),
}), asyncHandler(async (req, res) => {
  const fields = Object.entries(req.body).filter(([, v]) => v !== undefined);
  if (fields.length) {
    const sets = fields.map(([k], i) => `${k} = $${i + 2}`).join(', '); // keys are whitelisted by Zod
    await query(`UPDATE users SET ${sets}, updated_at = now() WHERE id = $1`, [req.user.id, ...fields.map(([, v]) => v)]);
  }
  res.json({ user: await publicUser(req.user.id) });
}));

router.patch('/me/password', authenticate, validate({
  body: z.object({ currentPassword: z.string().optional(), newPassword: password }),
}), asyncHandler(async (req, res) => {
  const u = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (u.password_hash && !(await bcrypt.compare(req.body.currentPassword || '', u.password_hash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [req.user.id, await bcrypt.hash(req.body.newPassword, BCRYPT_ROUNDS)]);
  res.json({ message: 'Password changed' });
}));

export default router;
