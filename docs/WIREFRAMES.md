# UI wireframes

Design language: charcoal (`#111113`) surfaces, brass-gold accent (`#d4a24c`), cream light mode (`#f7f3ec`),
Playfair Display headings + Inter body, animated barber-pole stripe as the brand motif.
Dark mode is the default; the sun/moon toggle persists the choice. Layouts are mobile-first:
sidebars collapse to a drawer, grids collapse to one column, the booking summary stacks below the steps.

Rendered screenshots of the real app are in [`docs/screenshots/`](screenshots).

## 1. Home (public)
```
┌─────────────────────────────────────────────────────────────────────┐
│▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚ barber-pole stripe ▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚│
│ [✂ KLIPPERS]  Services Barbers Gallery AI-Advisor Members Gift  ☀ [Book]│
├─────────────────────────────────────────────────────────────────────┤
│  ✦ New: AI hairstyle advisor          ┌──────────────────────┐      │
│  Sharp cuts.                          │ ║  hero photo        │      │
│  Zero waiting.  (gold)                │ ║                    │      │
│  Book master barbers in seconds…      │ ┌──────────────────┐ │      │
│  [Book an appointment →] [Barbers]    │ │✓ Booking confirmed│ │      │
│  (●●●●) ★★★★★ 4.8/5                    │ └──────────────────┘ │      │
│                                       └──────────────────────┘      │
│ [⏱ Real-time] [▦ QR check-in] [🎁 Loyalty] [🛡 Secure payments]      │
│ Services & pricing ─ 6 cards (icon · name · duration · price)       │
│ Master barbers ─ 3 photo cards (rating, specialties)                │
│ ┃ CTA: "Not sure what suits you?" [✦ Try the Style Advisor]       ┃ │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Animated booking flow (`/book`) — slides left/right between steps
```
 (1)━━━━━━(2)━━━━━━(3)──────(4)          progress bar animates as you advance
┌─────────────────────────────────────────┐ ┌──────────────────────┐
│ STEP 1  Services (multi-select)         │ │ Your booking         │
│  HAIRCUTS                               │ │ Skin Fade     $42.00 │
│  [✂ Classic Haircut  $35  30m]  [✓ Skin…]│ │ ─────────────────── │
│  BEARD & SHAVE …                        │ │ (MR) Marcus Reed     │
│ STEP 2  Barber cards (photo, ★, tags)   │ │ ⏱ Wed Nov 4 · 4:00PM │
│ STEP 3  ┌ Month calendar ┐┌ Slots ─────┐│ │ Subtotal / member −% │
│         │ • = open days  ││ MORNING    ││ │ Coupon / points −$   │
│         │ [4] selected   ││[9:00][9:15]││ │ Tax 8.875%           │
│         └────────────────┘│ ~~10:00~~  ││ │ TOTAL       $46.05   │
│                           └────────────┘│ │ [‹] [  Continue   ]  │
│ STEP 4  Guest name/email/phone (if no   │ └──────────────────────┘
│         account) · notes · coupon ·     │
│         redeem points                   │
└─────────────────────────────────────────┘
 SUCCESS: 🎉 spring-animated badge · QR code · 8-char check-in code · [View & pay]
```
Live: slots grey out instantly when someone else books (Socket.IO). Fully booked day → "Join waiting list".

## 3. Customer dashboard (`/dashboard`)
```
┌──────────┬──────────────────────────────────────────────────────────┐
│ ✂ KLIPPERS│ ← Back to site                     [Book now] ☀ 🔔(2)   │
│ ▣ Overview│ Hey John 👋                                               │
│ ▤ Appts   │ [Upcoming 5] [Points 3980] [Visits 76] [Favorites 2]      │
│ ♥ Favs    │ ┌ Upcoming bookings ───────────────┐ ┌ Loyalty tier ────┐│
│ 🎁 Rewards│ │ NOV│ Groom Package     (Pending)  │ │ PLATINUM ▓▓▓▓▓▓▓ ││
│ ✦ Advisor │ │  3 │ 2:00–4:00 PM · Downtown $163 │ └──────────────────┘│
│ 👤 Profile│ │ TUE│ (DA) Diego Alvarez           │ ┌ Membership ──────┐│
│           │ │ [QR pass][Pay now][Reschedule][✕]│ │ Gold Club · 15%  ││
│           │ └──────────────────────────────────┘ └──────────────────┘│
│ (JC) John │ Recent visits … [Leave review] [Invoice]  Favorite barbers│
└──────────┴──────────────────────────────────────────────────────────┘
```

## 4. Barber dashboard (`/barber`)
```
 Good morning, Marcus                                   [Open calendar]
 [Today 4] [Earnings (month) $X · 65%] [Lifetime $Y] [Repeat clients 72%]
 Booking requests (3)   ┌ card ─ [Accept] [Decline] ┐ ┌ card … ┐
 ┌ Today's schedule (timeline) ───────────┐ ┌ Appointment statistics ┐
 │ ● 9:00  Ryan Patel · Beard   [Check in]│ │      ◯ donut + legend   │
 │ ● 10:00 Noah Garcia · Groom  [Complete]│ ├ Top customers ──────────┤
 └────────────────────────────────────────┘ └─────────────────────────┘
 ┌ Revenue — last 30 days (area chart) ─────────────────────────────┐
```
Other barber screens: **Calendar** (Day / Week / Month, now-line, colour by status, click → actions),
**Hours & time off** (7-day editor with breaks, vacation ranges), **My services** (toggle + custom price/duration),
**Customers** (list ▸ detail with visit history + private notes), **Walk-ins & queue**, **Reviews** (reply), **Profile**.

## 5. Admin dashboard (`/admin`)
```
 Dashboard                                                [Full reports]
 [Revenue · 30d $ ▲8%] [Total bookings] [Active customers] [Avg rating]
 (⏱ 13 booking requests awaiting barbers) (✂ 1 barber pending approval)
 ┌ Revenue overview (area, 30d) ─────────────────┐ ┌ Status donut ────┐
 ┌ Popular services (bars) ──────┐ ┌ Barber performance (bars) ──────┐
 ┌ Latest bookings (table) ──────────────────────────────────────────┐
```
Other admin screens: **Appointments** (list filters ⇄ calendar, walk-in), **Users** (search, role, suspend/activate,
points), **Barbers** (approve, location, commission, auto-confirm), **Services** (CRUD modal), **Payments** (invoice,
refund, mark cash paid), **Reviews** (hide/delete/reply), **Coupons**, **Queue**, **Reports** (5 tabs, date range,
grouping, chart + table, CSV export), **Settings** (business rules, locations, membership plans, gift cards).

## 6. Other public screens
- **Barbers**: search + location + sort filters, photo cards with ♥ favourite, rating, specialties, [Profile] [Book].
- **Barber profile**: cover banner, avatar, stats, about, services with per-service [Book], before/after portfolio slider,
  reviews with barber replies, working hours, rating distribution bars.
- **Gallery**: tag tabs, drag-to-compare before/after sliders.
- **AI Style Advisor**: chip pickers (face shape, hair type…) → three animated recommendation cards with "tell your barber" script.
- **Live queue**: lobby list with positions & ETA (updates live) + "join the line" form.
- **Check-in kiosk**: big 8-character code field; auto-submits from a scanned QR link.
- **Memberships**, **Gift cards** (live card preview), **Guest booking lookup**, **Login / Register / Reset**.
