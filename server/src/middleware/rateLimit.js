import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Count requests per real client. Behind Render (which sits behind Cloudflare) the immediate peer is a
 * rotating edge server, so prefer Cloudflare's CF-Connecting-IP header (set by Cloudflare itself) when present.
 */
// Only trusted where every request arrives via Cloudflare (Render sets RENDER=true); elsewhere the header could be spoofed.
const trustCfHeader = process.env.RENDER === 'true' || process.env.TRUST_CF_CONNECTING_IP === 'true';
const clientKey = (req) => ipKeyGenerator(String((trustCfHeader && req.headers['cf-connecting-ip']) || req.ip));

const common = { standardHeaders: 'draft-7', legacyHeaders: false, skip: () => env.isTest, keyGenerator: clientKey,
  message: { error: { message: 'Too many requests, please slow down.' } } };

/** Global limiter for all API routes. */
export const apiLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 600 });

/** Strict limiter for credential endpoints (brute-force protection). */
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, limit: 20 });

/** Limiter for expensive endpoints (AI, booking). */
export const heavyLimiter = rateLimit({ ...common, windowMs: 60 * 1000, limit: 15 });
