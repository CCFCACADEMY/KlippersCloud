/**
 * PostgreSQL connection pool + small helpers.
 * All queries use parameterised placeholders ($1, $2 …) — never string
 * concatenation — which prevents SQL injection.
 */
import pg from 'pg';
import { env } from '../config/env.js';

// Return NUMERIC columns as JS numbers (money values are well within double precision)
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// Return DATE columns as plain 'YYYY-MM-DD' strings (avoid timezone shifting)
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30_000,
});

export const query = (text, params) => pool.query(text, params);

/** Fetch first row or null. */
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null;

/** Fetch all rows. */
export const many = async (text, params) => (await pool.query(text, params)).rows;

/**
 * Run `fn(client)` inside a transaction. Rolls back on any thrown error.
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
