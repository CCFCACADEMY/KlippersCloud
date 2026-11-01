/**
 * Centralised, validated configuration. Fails fast on boot if a required
 * variable is missing so misconfigured deployments never start silently.
 */
import 'dotenv/config';

const required = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var: ${name}. On Render, deploy with the Blueprint (render.yaml) so it is set automatically, or add it under the service's Environment tab.`);
  }
  return v;
};

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL', isProd ? undefined : 'postgres://klippers:klippers@localhost:5432/klippers'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  // Public URL of the web app (CORS, email links, QR codes). Render sets RENDER_EXTERNAL_URL automatically.
  clientUrl: process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173',
  // When set (single-service deploys), Express also serves the built SPA from this folder.
  staticDir: process.env.STATIC_DIR || '',
  // Load demo data on first boot if the database is empty (handy for demo deploys).
  seedOnEmpty: process.env.SEED_ON_EMPTY === 'true',
  // In production these MUST be set to long random strings.
  jwtAccessSecret: required('JWT_ACCESS_SECRET', isProd ? undefined : 'dev-access-secret-change-me'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', isProd ? undefined : 'dev-refresh-secret-change-me'),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || '15m',
  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS || 30),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'Klippers <no-reply@klippers.app>',
  },
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM_NUMBER || '',
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  enableJobs: process.env.ENABLE_JOBS !== 'false',
};

// Refuse to run production with placeholder or short secrets
if (isProd) {
  for (const [k, v] of [['JWT_ACCESS_SECRET', env.jwtAccessSecret], ['JWT_REFRESH_SECRET', env.jwtRefreshSecret]]) {
    if (v.length < 32 || v.startsWith('change-me')) throw new Error(`${k} must be a random string of at least 32 characters in production`);
  }
}
