-- =============================================================================
-- Klippers — PostgreSQL schema
-- Idempotent: safe to run multiple times (used by `npm run migrate`).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- needed for the double-booking exclusion constraint

-- ---------- Enumerated types --------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer', 'barber', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM
    ('pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_source AS ENUM ('online', 'guest', 'walk_in', 'whatsapp', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('card', 'cash', 'gift_card');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'partially_refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_category AS ENUM
    ('haircut', 'beard', 'coloring', 'wash', 'facial', 'package', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Locations (multi-location support) --------------------------------
CREATE TABLE IF NOT EXISTS locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT NOT NULL,
  city        TEXT NOT NULL,
  phone       TEXT,
  timezone    TEXT NOT NULL DEFAULT 'America/New_York',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Users -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role            user_role NOT NULL DEFAULT 'customer',
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  password_hash   TEXT,                       -- NULL for Google-only accounts
  google_id       TEXT UNIQUE,
  avatar_url      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = suspended
  loyalty_points  INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0), -- cached balance
  notify_email    BOOLEAN NOT NULL DEFAULT TRUE,
  notify_sms      BOOLEAN NOT NULL DEFAULT TRUE,
  notify_push     BOOLEAN NOT NULL DEFAULT TRUE,
  reset_token_hash TEXT,
  reset_expires_at TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

-- Refresh tokens (hashed) — supports rotation and revocation
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Barbers -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS barbers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  location_id       UUID REFERENCES locations(id) ON DELETE SET NULL,
  title             TEXT DEFAULT 'Barber',
  bio               TEXT,
  experience_years  INTEGER NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  specialties       TEXT[] NOT NULL DEFAULT '{}',
  photo_url         TEXT,
  rating_avg        NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count      INTEGER NOT NULL DEFAULT 0,
  commission_rate   NUMERIC(5,2) NOT NULL DEFAULT 60.00,   -- % of service revenue the barber earns
  auto_confirm      BOOLEAN NOT NULL DEFAULT FALSE,        -- FALSE = barber must accept requests
  is_approved       BOOLEAN NOT NULL DEFAULT FALSE,        -- admin approval for self-registered barbers
  slot_interval     INTEGER NOT NULL DEFAULT 15 CHECK (slot_interval IN (5,10,15,20,30,60)),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Weekly working hours. day_of_week: 0 = Sunday … 6 = Saturday
CREATE TABLE IF NOT EXISTS working_hours (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id    UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_off       BOOLEAN NOT NULL DEFAULT FALSE,
  start_time   TIME NOT NULL DEFAULT '09:00',
  end_time     TIME NOT NULL DEFAULT '18:00',
  break_start  TIME,
  break_end    TIME,
  UNIQUE (barber_id, day_of_week),
  CHECK (end_time > start_time)
);

-- Vacation / unavailable dates (inclusive range)
CREATE TABLE IF NOT EXISTS time_off (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id   UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- ---------- Services ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  category      service_category NOT NULL,
  description   TEXT,
  duration_min  INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  price         NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image_url     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which barber offers which service (optionally with their own price/duration)
CREATE TABLE IF NOT EXISTS barber_services (
  barber_id        UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id       UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  custom_price     NUMERIC(10,2) CHECK (custom_price >= 0),
  custom_duration  INTEGER CHECK (custom_duration BETWEEN 5 AND 480),
  PRIMARY KEY (barber_id, service_id)
);

-- ---------- Coupons -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  description     TEXT,
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value  NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_uses        INTEGER,                         -- NULL = unlimited
  used_count      INTEGER NOT NULL DEFAULT 0,
  per_user_limit  INTEGER NOT NULL DEFAULT 1,
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until     TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Appointments ------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL for guests / walk-ins
  guest_name           TEXT,
  guest_email          TEXT,
  guest_phone          TEXT,
  barber_id            UUID NOT NULL REFERENCES barbers(id) ON DELETE RESTRICT,
  location_id          UUID REFERENCES locations(id) ON DELETE SET NULL,
  start_at             TIMESTAMPTZ NOT NULL,
  end_at               TIMESTAMPTZ NOT NULL,
  status               appointment_status NOT NULL DEFAULT 'pending',
  source               appointment_source NOT NULL DEFAULT 'online',
  notes                TEXT,                       -- note from customer at booking time
  subtotal             NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount             NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total                NUMERIC(10,2) NOT NULL DEFAULT 0,
  coupon_id            UUID REFERENCES coupons(id) ON DELETE SET NULL,
  points_redeemed      INTEGER NOT NULL DEFAULT 0,
  checkin_code         TEXT NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text), 1, 8)),
  checked_in_at        TIMESTAMPTZ,
  cancellation_reason  TEXT,
  reminder_24h_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_1h_sent     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  CHECK (customer_id IS NOT NULL OR guest_name IS NOT NULL)
);

-- PREVENT DOUBLE BOOKING at the database level: two "active" appointments for the
-- same barber can never overlap in time, even under concurrent requests.
DO $$ BEGIN
  ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
    EXCLUDE USING gist (barber_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
    WHERE (status IN ('pending', 'confirmed', 'checked_in', 'in_progress'));
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS appointments_barber_start_idx ON appointments (barber_id, start_at);
CREATE INDEX IF NOT EXISTS appointments_customer_idx ON appointments (customer_id, start_at DESC);
CREATE INDEX IF NOT EXISTS appointments_status_start_idx ON appointments (status, start_at);

-- Line items: an appointment can contain several services
CREATE TABLE IF NOT EXISTS appointment_services (
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,          -- snapshot so history survives renames
  price           NUMERIC(10,2) NOT NULL,
  duration_min    INTEGER NOT NULL,
  PRIMARY KEY (appointment_id, service_id)
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id       UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  appointment_id  UUID REFERENCES appointments(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Payments ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   UUID REFERENCES appointments(id) ON DELETE SET NULL,
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  purpose          TEXT NOT NULL DEFAULT 'appointment'
                   CHECK (purpose IN ('appointment', 'gift_card', 'membership')),
  amount           NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  tax              NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'usd',
  method           payment_method NOT NULL,
  status           payment_status NOT NULL DEFAULT 'pending',
  provider         TEXT NOT NULL DEFAULT 'internal',   -- 'stripe' | 'mock' | 'internal'
  provider_ref     TEXT,                               -- e.g. Stripe PaymentIntent id
  refunded_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  refund_reason    TEXT,
  invoice_number   TEXT NOT NULL UNIQUE,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_appointment_idx ON payments (appointment_id);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments (user_id, created_at DESC);
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1001;

-- ---------- Reviews -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  barber_id       UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  rating          SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  barber_reply    TEXT,
  is_visible      BOOLEAN NOT NULL DEFAULT TRUE,   -- admins can hide abusive reviews
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_barber_idx ON reviews (barber_id, created_at DESC);

-- ---------- Loyalty points ledger ---------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points          INTEGER NOT NULL,                -- positive = earned, negative = redeemed
  reason          TEXT NOT NULL,
  appointment_id  UUID REFERENCES appointments(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loyalty_user_idx ON loyalty_transactions (user_id, created_at DESC);

-- ---------- Notifications -----------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,          -- booking_confirmed, reminder_24h, ...
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  channels    TEXT[] NOT NULL DEFAULT '{in_app}',   -- channels it was delivered on
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, is_read, created_at DESC);

-- ---------- Customer engagement ----------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  barber_id   UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, barber_id)
);

-- Private notes a barber keeps about a customer
CREATE TABLE IF NOT EXISTS customer_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id    UUID NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Waiting list & walk-in queue -------------------------------------
CREATE TABLE IF NOT EXISTS waitlist (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  barber_id      UUID REFERENCES barbers(id) ON DELETE CASCADE,  -- NULL = any barber
  service_id     UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  desired_date   DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'booked', 'expired', 'cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS queue_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  UUID REFERENCES locations(id) ON DELETE CASCADE,
  barber_id    UUID REFERENCES barbers(id) ON DELETE SET NULL,   -- NULL = next available
  customer_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  phone        TEXT,
  service_id   UUID REFERENCES services(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'serving', 'done', 'left')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  served_at    TIMESTAMPTZ
);

-- ---------- Bonus: gallery, memberships, gift cards ---------------------------
CREATE TABLE IF NOT EXISTS gallery_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id   UUID REFERENCES barbers(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  before_url  TEXT NOT NULL,
  after_url   TEXT NOT NULL,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS membership_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL UNIQUE,
  description         TEXT,
  price_monthly       NUMERIC(10,2) NOT NULL,
  discount_percent    NUMERIC(5,2) NOT NULL DEFAULT 0,   -- applied automatically at booking
  included_cuts       INTEGER NOT NULL DEFAULT 0,        -- free haircuts per month
  points_multiplier   NUMERIC(4,2) NOT NULL DEFAULT 1,
  perks               TEXT[] NOT NULL DEFAULT '{}',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id       UUID NOT NULL REFERENCES membership_plans(id),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  renews_at     TIMESTAMPTZ NOT NULL,
  cancelled_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS memberships_one_active ON memberships (user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS gift_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL UNIQUE,
  initial_amount   NUMERIC(10,2) NOT NULL CHECK (initial_amount > 0),
  balance          NUMERIC(10,2) NOT NULL CHECK (balance >= 0),
  purchaser_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_name   TEXT,
  recipient_email  TEXT,
  message          TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Business settings (key/value) ------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
