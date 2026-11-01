/** HTTP server entry point. */
import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { initSocket } from './services/socket.js';
import { startJobs } from './jobs/reminders.job.js';

const app = createApp();
const server = http.createServer(app);
initSocket(server);

// Open the port immediately so hosts like Render detect the service, and report
// "starting" (503) on /api/health until migrations and optional seeding finish.
app.locals.ready = false;
server.listen(env.port, () => console.log(`💈 Klippers API listening on :${env.port} (${env.nodeEnv})`));

/** Retry the first DB connection — managed databases can still be provisioning on first deploy. */
async function waitForDatabase(attempts = 24, delayMs = 5000) {
  for (let i = 1; i <= attempts; i++) {
    try { await pool.query('SELECT 1'); return; } catch (e) {
      console.log(`⏳ Waiting for database (${i}/${attempts}): ${e.message}`);
      if (i === attempts) throw e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

try {
  await waitForDatabase();
  await migrate(); // idempotent — keeps schema current on every deploy
  if (env.seedOnEmpty) {
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM users');
    if (n === 0) {
      const { seed } = await import('./db/seed.js');
      console.log('🌱 Empty database — loading demo data…', await seed());
    }
  }
  if (env.enableJobs) startJobs();
  app.locals.ready = true;
  console.log('✅ Ready');
} catch (err) {
  console.error('✖ Startup failed:', err.message);
  if (/btree_gist|permission denied/i.test(err.message)) {
    console.error('  → The database user may not be allowed to create the btree_gist extension. Run once as an admin: CREATE EXTENSION btree_gist;');
  }
  process.exit(1);
}

// Graceful shutdown for container orchestrators
const shutdown = (sig) => {
  console.log(`${sig} received, shutting down…`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
