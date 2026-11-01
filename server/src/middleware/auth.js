/**
 * Authentication + role-based access control (RBAC).
 *
 *   router.get('/x', authenticate, authorize('admin'), handler)
 *
 * Roles: 'customer' | 'barber' | 'admin'. Unauthenticated visitors are "guests":
 * they can browse public endpoints and book via the guest-booking flow.
 */
import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { one } from '../db/pool.js';

async function loadUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  const user = await one(
    `SELECT u.id, u.role, u.name, u.email, u.phone, u.is_active, b.id AS barber_id
       FROM users u LEFT JOIN barbers b ON b.user_id = u.id
      WHERE u.id = $1`,
    [payload.sub],
  );
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (!user.is_active) throw ApiError.forbidden('Your account has been suspended');
  return user;
}

/** Requires a valid access token; sets req.user. */
export const authenticate = async (req, _res, next) => {
  try {
    const user = await loadUser(req);
    if (!user) throw ApiError.unauthorized();
    req.user = user;
    next();
  } catch (e) { next(e); }
};

/** Sets req.user when a token is present, but allows guests through. */
export const optionalAuth = async (req, _res, next) => {
  try {
    req.user = await loadUser(req);
    next();
  } catch (e) { next(e); }
};

/** Restrict to one or more roles. Must run after `authenticate`. */
export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  next();
};

/** Barbers need a barber profile for barber-only endpoints. */
export const requireBarberProfile = (req, _res, next) => {
  if (req.user?.role === 'barber' && !req.user.barber_id) return next(ApiError.forbidden('Barber profile missing'));
  next();
};
