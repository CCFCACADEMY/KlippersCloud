/**
 * Request validation + sanitisation using Zod.
 *   router.post('/', validate({ body: schema, query: schema, params: schema }), handler)
 * Parsed (coerced, trimmed, stripped-of-unknown-keys) values replace the originals.
 */
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

/** Strip HTML tags and control chars from every string — defence-in-depth against stored XSS. */
export function sanitize(value) {
  if (typeof value === 'string') {
    return value.replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
  }
  return value;
}

export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['params', 'query', 'body']) {
      if (!schemas[key]) continue;
      const parsed = schemas[key].parse(sanitize(req[key] ?? {}));
      // Express 5 makes req.query a getter; define a property to override safely.
      Object.defineProperty(req, key, { value: parsed, writable: true, configurable: true, enumerable: true });
    }
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return next(ApiError.badRequest(details[0] ? `${details[0].field}: ${details[0].message}` : 'Invalid input', details));
    }
    next(err);
  }
};
