import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export const notFound = (req, _res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

/** Map PostgreSQL error codes to friendly HTTP errors. */
function fromPg(err) {
  switch (err.code) {
    case '23P01': // exclusion_violation (appointments_no_overlap)
      return ApiError.conflict('That time slot was just booked. Please choose another time.');
    case '23505': // unique_violation
      return ApiError.conflict(err.constraint === 'users_email_lower_idx' ? 'Email is already registered' : 'Duplicate value');
    case '23503': return ApiError.badRequest('Referenced record does not exist');
    case '23514': return ApiError.badRequest('Value violates a data rule');
    case '22P02': return ApiError.badRequest('Invalid identifier format');
    default: return null;
  }
}

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  const apiErr = err instanceof ApiError ? err : fromPg(err);
  const status = apiErr?.status || err.status || 500;
  if (status >= 500) console.error('[error]', req.method, req.originalUrl, err);
  res.status(status).json({
    error: {
      message: apiErr?.message || (status < 500 ? err.message : 'Internal server error'),
      ...(apiErr?.details && { details: apiErr.details }),
      ...(!env.isProd && status >= 500 && { stack: err.stack }),
    },
  });
};
