# Database schema (PostgreSQL 14+)

Source of truth: [`server/src/db/schema.sql`](../server/src/db/schema.sql) (idempotent; applied on every boot).

```
locations ─┬─< barbers >── users (role: customer | barber | admin)
           │      │ ├─< working_hours (7 rows / barber)
           │      │ ├─< time_off
           │      │ ├─< barber_services >── services
           │      │ ├─< gallery_items
           │      │ └─< customer_notes >── users
           ├─< appointments >── users (customer, nullable for guests/walk-ins)
           │      ├─< appointment_services >── services   (price/name snapshot)
           │      ├─< payments                              (card | cash | gift_card)
           │      ├── reviews (1:1)
           │      └── coupons ─< coupon_redemptions
           └─< queue_entries
users ─< loyalty_transactions · notifications · favorites · waitlist · memberships >── membership_plans
      ─< refresh_tokens · gift_cards (purchaser)
settings (key → jsonb)
```

| Model (requested) | Table(s) | Notes |
|---|---|---|
| Users | `users`, `refresh_tokens` | bcrypt hash, Google ID, notification prefs, cached loyalty balance, suspension flag |
| Barbers | `barbers`, `working_hours`, `time_off`, `barber_services` | per-barber price/duration overrides, commission, auto-confirm, approval |
| Services | `services` | categories: haircut, beard, coloring, wash, facial, package, custom |
| Appointments | `appointments`, `appointment_services`, `waitlist`, `queue_entries` | multi-service, guest fields, check-in code, reminder flags |
| Payments | `payments` | Stripe/mock/internal, invoice numbers (`invoice_seq`), partial refunds |
| Reviews | `reviews` | one per appointment, barber reply, moderation flag |
| Coupons | `coupons`, `coupon_redemptions` | percent/fixed, min spend, global & per-user limits, expiry |
| LoyaltyPoints | `loyalty_transactions` (+ `users.loyalty_points`) | append-only ledger |
| Notifications | `notifications` | in-app record with delivered channels |
| Bonus | `memberships`, `membership_plans`, `gift_cards`, `gallery_items`, `locations`, `settings` | |

### Key integrity rules
- **No double booking** — `appointments_no_overlap` is an `EXCLUDE USING gist (barber_id WITH =, tstzrange(start_at,end_at) WITH &&)` constraint limited to active statuses. Concurrent requests for the same slot cannot both succeed (verified by the test suite's race test).
- Case-insensitive unique emails (`users_email_lower_idx`).
- One active membership per user (partial unique index).
- Money is `NUMERIC(10,2)`; all timestamps are `TIMESTAMPTZ` (UTC), displayed in the location's timezone.
