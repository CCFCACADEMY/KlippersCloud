import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const common = { standardHeaders: 'draft-7', legacyHeaders: false, skip: () => env.isTest,
  message: { error: { message: 'Too many requests, please slow down.' } } };

/** Global limiter for all API routes. */
export const apiLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 600 });

/** Strict limiter for credential endpoints (brute-force protection). */
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 20 });

/** Limiter for expensive endpoints (AI, booking). */
export const heavyLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 15 });
