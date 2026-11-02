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

/** "guest.email" → "Email", "experience_years" → "Experience years". */
const fieldLabel = (path) => {
  const last = String(path.filter((p) => typeof p === 'string').pop() || 'Value');
  const words = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
/** Turn a Zod issue into a user-facing sentence, e.g. "Email: Invalid email address", "Name must be at least 2 characters". */
const friendly = (issue) => {
  const label = fieldLabel(issue.path);
  if (issue.code === 'too_small' && issue.origin === 'string') return issue.minimum <= 1 ? `${label} is required` : `${label} must be at least ${issue.minimum} characters`;
  if (issue.code === 'too_big' && issue.origin === 'string') return `${label} must be at most ${issue.maximum} characters`;
  if (issue.code === 'invalid_type' && issue.input === undefined) return `${label} is required`;
  // Custom messages that already name the field ("Password must contain a number") stand alone
  return issue.message.toLowerCase().startsWith(label.toLowerCase()) ? issue.message : `${label}: ${issue.message}`;
};

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
      const details = err.issues.map((i) => ({ field: i.path.join('.'), message: friendly(i) }));
      return next(ApiError.badRequest(details[0]?.message || 'Invalid input', details));
    }
    next(err);
  }
};
