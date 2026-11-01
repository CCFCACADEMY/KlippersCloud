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

await migrate(); // idempotent — keeps schema current on every deploy
if (env.enableJobs) startJobs();

server.listen(env.port, () => console.log(`💈 Klippers API listening on :${env.port} (${env.nodeEnv})`));

// Graceful shutdown for container orchestrators
const shutdown = (sig) => {
  console.log(`${sig} received, shutting down…`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
