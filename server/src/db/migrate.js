/** Applies schema.sql (idempotent). Usage: npm run migrate */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './pool.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = await readFile(path.join(dir, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => { console.log('✔ Database schema is up to date'); return pool.end(); })
    .catch((err) => { console.error('✖ Migration failed:', err); process.exit(1); });
}
