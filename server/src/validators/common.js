import { z } from 'zod';

export const uuid = z.string().uuid();
export const idParam = z.object({ id: uuid });
export const email = z.string().trim().toLowerCase().email().max(254);
export const phone = z.string().trim().regex(/^\+?[0-9\s\-()]{7,20}$/, 'Invalid phone number');
export const password = z.string().min(8, 'Password must be at least 8 characters').max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter').regex(/[0-9]/, 'Password must contain a number');
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:mm');
export const isoDate = z.string().datetime({ offset: true });
export const optionalText = (max = 1000) => z.string().max(max).optional().nullable();
export const boolish = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);
