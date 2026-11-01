# Klippers REST API

Base URL: `/api` · JSON in/out · Auth: `Authorization: Bearer <accessToken>`
Refresh token lives in an httpOnly cookie (`klippers_rt`, path `/api/auth`).

**Roles:** `guest` (no token) · `customer` · `barber` · `admin`
**Errors:** `{ "error": { "message": "…", "details": [{ "field", "message" }] } }`
Status codes: 400 validation · 401 unauthenticated · 403 forbidden/suspended · 404 · 409 conflict (e.g. slot taken) · 429 rate limited.

Rate limits: 600 req / 15 min per IP globally · 20 / 15 min on credential endpoints · 15 / min on booking, AI, check-in and other expensive endpoints.

## Auth — `/api/auth`
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/register` | guest | `{name, email, password, phone?, role: customer\|barber}` → `{accessToken, user}` + refresh cookie. Barbers start unapproved. |
| POST | `/login` | guest | `{email, password}` |
| POST | `/google` | guest | `{credential}` (Google Identity Services ID token) |
| POST | `/refresh` | cookie | Rotates refresh token, returns new access token |
| POST | `/logout` | any | Revokes refresh token |
| POST | `/forgot-password` | guest | `{email}` → emails 1-hour reset link |
| POST | `/reset-password` | guest | `{token, password}` — revokes all sessions |
| GET | `/me` | auth | Current user |
| PATCH | `/me` | auth | `{name?, phone?, avatar_url?, notify_email?, notify_sms?, notify_push?}` |
| PATCH | `/me/password` | auth | `{currentPassword, newPassword}` |

## Catalogue
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/services?category=` | public | Active services (`?all=true` includes inactive) |
| GET | `/services/:id` | public | |
| POST / PATCH / DELETE | `/services[/:id]` | admin | Create / update / soft-delete |
| GET | `/locations` | public | Shop locations (multi-location) |
| POST / PATCH | `/locations[/:id]` | admin | |
| GET | `/settings/public` | public | Tax rate, loyalty rules, contact info |

## Barbers — `/api/barbers`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/?locationId&serviceId&search&sort=rating\|experience\|name` | public | Directory (`is_favorite` when signed in) |
| GET | `/:id` | public | Profile, services (with barber pricing), hours, reviews, gallery |
| GET | `/:id/availability?date=YYYY-MM-DD&serviceIds=a,b` | public | Every slot of the day with `available` flag + `timezone` |
| GET | `/:id/availability/month?month=YYYY-MM&duration=` | public | Open-slot count per day (calendar dots) |
| GET | `/me` | barber | Own profile, hours, services, time off |
| PATCH | `/me` | barber | `{title, bio, experience_years, specialties[], photo_url, auto_confirm, slot_interval}` |
| PUT | `/me/hours` | barber | `{hours: [7 × {day_of_week, is_off, start_time, end_time, break_start?, break_end?}]}` |
| POST | `/me/time-off` | barber | `{start_date, end_date, reason?}` — warns about clashing bookings |
| DELETE | `/me/time-off/:id` | barber | |
| PUT | `/me/services` | barber | `{services: [{service_id, custom_price?, custom_duration?}]}` |
| GET | `/me/dashboard` | barber | Today, pending requests, stats, 30-day revenue, top customers |
| GET | `/me/customers` | barber | Customers served |
| GET | `/me/customers/:id` | barber | Visit history + private notes |
| POST / DELETE | `/me/customers/:id/notes[/:noteId]` | barber | Private customer notes |

## Appointments — `/api/appointments`
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/quote` | public | `{barberId, serviceIds[], couponCode?, redeemPoints?}` → itemised price incl. membership, coupon, points, tax |
| POST | `/` | public | Book. `{barberId, serviceIds[], startAt (ISO), notes?, couponCode?, redeemPoints?, guest?: {name,email,phone}, customerId? (staff)}`. 409 if the slot is taken. |
| GET | `/?scope=upcoming\|past\|all&status&barberId&customerId&from&to&search&page&limit` | auth | Role-scoped list |
| GET | `/calendar?from&to&barberId&locationId` | barber, admin | Calendar feed |
| GET | `/:id` | owner/staff | Appointment + payments |
| GET | `/:id/qr` | owner/staff | QR code data URL for check-in |
| PATCH | `/:id/reschedule` | owner/staff | `{startAt, barberId? (admin)}` — customers must be outside the cancellation window |
| PATCH | `/:id/cancel` | owner/staff | `{reason?}` — auto-refund + restore points unless late cancellation; notifies waitlist |
| PATCH | `/:id/status` | barber, admin | `{status: confirmed\|rejected\|checked_in\|in_progress\|completed\|no_show, reason?}` (validated transitions). `completed` awards points and settles cash. |
| POST | `/checkin` | public | `{code}` — kiosk/QR check-in (opens 2h before) |
| POST | `/walk-in` | barber, admin | `{serviceIds[], name, phone?, customerId?, barberId? (admin), startAt?}` |
| POST | `/guest/lookup` · `/guest/cancel` | guest | `{code, email}` |

Status workflow: `pending → confirmed → checked_in → in_progress → completed`, plus `rejected`, `cancelled`, `no_show`.

## Payments — `/api/payments`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/config` | public | `{provider: stripe\|mock, publishableKey}` |
| POST | `/appointments/:id` | owner/staff | `{method: card\|cash\|gift_card, giftCardCode?}` — Stripe returns `clientSecret` |
| GET | `/` | auth | Payment history (role-scoped) |
| GET | `/:id/invoice` | owner/staff | Printable HTML invoice |
| POST | `/:id/mark-paid` | barber, admin | Settle pending cash payment |
| POST | `/:id/refund` | admin | `{amount?, reason?}` full or partial refund |
| POST | `/api/webhooks/stripe` | Stripe | Signature-verified webhook |

## Customer — `/api/me`
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/dashboard` | customer | Upcoming, past, favorites, rewards, membership |
| GET / POST / DELETE | `/favorites[/:barberId]` | auth | Favorite barbers |
| GET | `/loyalty` | auth | Balance, tier, history, rules |
| GET | `/notifications` · PATCH `/notifications/:id/read` · PATCH `/notifications/read-all` | auth | In-app notification centre |
| POST / GET / DELETE | `/waitlist[/:id]` | customer (GET: all roles) | Waiting list |
| POST | `/reviews` | customer | `{appointmentId, rating 1-5, comment?}` (+bonus points) |
| GET | `/reviews` | barber, admin | Review management |
| PATCH | `/reviews/:id/reply` | barber, admin | `{reply}` |
| PATCH | `/reviews/:id/visibility` · DELETE `/reviews/:id` | admin | Moderate |

## Admin — `/api/admin` (admin only)
| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` | KPIs, 30-day revenue, popular services, barber performance, status mix |
| GET | `/users?role&search&status&page` | User management |
| PATCH | `/users/:id/status` | `{is_active}` suspend / activate (revokes sessions) |
| PATCH | `/users/:id/role` | `{role}` |
| POST | `/users/:id/points` | `{points, reason}` manual loyalty adjustment |
| GET / POST / PATCH | `/barbers[/:id]` | List, create (pre-approved), approve / commission / location / auto-confirm |
| GET / POST / PATCH / DELETE | `/coupons[/:id]` | Coupon & discount management |
| GET / PUT | `/settings` | Business settings |

## Reports — `/api/reports` (admin; `?from&to&groupBy=day|week|month&format=json|csv`)
`/revenue` · `/appointments` (+ busiest hours) · `/retention` (cohorts, repeat rate, at-risk) · `/services` · `/barbers`

## Bonus features
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/coupons/validate` | public | `{code, amount}` |
| GET / POST / DELETE | `/gallery[/:id]` | public / barber, admin | Before & after gallery |
| GET | `/memberships/plans` · `/memberships/me` | public / auth | |
| POST | `/memberships/subscribe` · `/memberships/cancel` · `/memberships/plans` | customer / auth / admin | |
| POST | `/gift-cards/purchase` | auth | `{amount, recipientName, recipientEmail, message?}` |
| GET | `/gift-cards/mine` · `/gift-cards/:code/balance` · `/gift-cards` | auth / public / admin | |
| GET / POST | `/queue?locationId` | public | Live walk-in queue (names masked for public) |
| PATCH | `/queue/:id` | barber, admin | `{status: waiting\|serving\|done\|left}` |
| POST | `/ai/recommendations` | public | `{faceShape, hairType, hairLength, beard?, maintenance?, lifestyle?}` |
| POST | `/webhooks/whatsapp` | Twilio | WhatsApp booking bot (TwiML) |
| GET | `/health` | public | Liveness + DB check |

## Real-time (Socket.IO)
Connect with `auth: { token }`. Rooms: `user:<id>` (auto) → `notification`; `barber:<id>` (emit `subscribe`) → `slots:changed`, `appointment:updated`; `location:<id>` → `queue:updated`.
