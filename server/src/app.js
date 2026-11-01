/**
 * Express application (exported separately from the HTTP server so tests can
 * use it with supertest).
 */
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import barberRoutes from './routes/barbers.routes.js';
import appointmentRoutes from './routes/appointments.routes.js';
import paymentRoutes, { stripeWebhook } from './routes/payments.routes.js';
import customerRoutes from './routes/customer.routes.js';
import adminRoutes from './routes/admin.routes.js';
import reportRoutes from './routes/reports.routes.js';
import extrasRoutes from './routes/extras.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind a load balancer / Render / Railway proxy

  // Content Security Policy that allows exactly what the SPA needs: Google Fonts,
  // Google Sign-In, Stripe, remote images (barber photos) and same-origin websockets.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com', 'https://js.stripe.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'https://accounts.google.com', 'https://api.stripe.com'],
        frameSrc: ['https://accounts.google.com', 'https://js.stripe.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({ origin: env.clientUrl.split(','), credentials: true }));
  app.use(compression());
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // Stripe needs the raw body for signature verification — mount before express.json()
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res, next) => stripeWebhook(req, res).catch(next));

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' })); // Twilio webhooks
  app.use(cookieParser());

  // index.js sets app.locals.ready = false while it migrates/seeds; tests use the app directly (ready).
  app.locals.ready = true;
  app.get('/api/health', async (_req, res) => {
    if (!app.locals.ready) return res.status(503).json({ status: 'starting' });
    await pool.query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api', catalogRoutes);                 // /services, /locations, /settings/public
  app.use('/api/barbers', barberRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/me', customerRoutes);              // /me/dashboard, /me/favorites, /me/loyalty …
  app.use('/api/admin', adminRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api', extrasRoutes);                   // /gallery, /memberships, /gift-cards, /queue, /ai
  app.use('/api/webhooks', whatsappRoutes);

  // Single-service mode: serve the built React app and fall back to index.html for client routes
  const staticDir = env.staticDir && path.resolve(env.staticDir);
  if (staticDir && existsSync(path.join(staticDir, 'index.html'))) {
    app.use('/assets', express.static(path.join(staticDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
