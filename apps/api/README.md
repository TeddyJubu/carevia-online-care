# Carevia API

Node.js API (Fastify, Prisma, PostgreSQL, Better Auth) for the patient journey: accounts, the service catalog, doctor search, booking, demo payment, video visits with Daily, family members, the clinician agenda and the admin desk. The contract is [`docs/patient-journey/API-CONTRACT.md`](../../docs/patient-journey/API-CONTRACT.md).

What it never does:

- **No clinical documents or clinical data.** No prescriptions, CIT, certificates, test requests, referrals, symptoms, diagnoses or medicines, not even in demo data. Those live in iMED; appointments carry `imed.status: "not_connected"`.
- **No patient identifiers sent to Daily.** One private room per confirmed appointment, random room names from Daily, `user_name` is `Patient`, `Companion` or the doctor's professional name. Recording is never turned on.
- **No names, emails, phones, birth dates, cookies or tokens in logs.** Requests are logged by method, path (no query string; reset tokens masked) and status.
- **A dropped call keeps the same appointment.** Reconnect inside the join window (10 minutes before the start to 60 minutes after the end).

## Setup

From the repo root:

```sh
npm install                 # if ~/.npm is not writable: npm install --cache "$TMPDIR/npm-cache"
cp apps/api/.env.example apps/api/.env   # then set BETTER_AUTH_SECRET
npm run db                  # embedded Postgres on PGPORT (default 5432); leave it running
npm run db:setup            # migrations, catalog, demo accounts, 21-day schedule, demo visits
npm run dev:api             # API on 127.0.0.1:PORT (default 4000), restarts on change
```

If npm skips install scripts, run `npx prisma generate` in `apps/api` once.

`npm run db:setup` resets the catalog, the schedule, demo data and the Daily key. `docker compose up -d` is the Docker alternative to `npm run db` (it also reads `PGPORT`).

Every setting is in [`.env.example`](.env.example). The ones that matter most:

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | API port. The VPS uses `4100` behind nginx. |
| `PGPORT` | `5432` | Port for `npm run db`. Keep `DATABASE_URL` in step. |
| `PUBLIC_APP_URL` | `http://localhost:5180` | The origin patients use. Better Auth's `baseURL`, email links and trusted origin. On the VPS: `https://carevia.triplelabs.dev`. |
| `ADMIN_APP_URL` | `http://localhost:5174` | The admin app's origin (trusted). |
| `DEMO_MODE` | off | Exactly `true` turns on demo logins, demo payment, `POST /api/demo/reset` and waives two-factor login for staff. |
| `NODE_ENV` | | `development` shows the outbox without demo mode; `production` refuses changing requests that carry neither `Origin` nor `Sec-Fetch-Site`. |
| `TRUST_PROXY` | `false` | `true` behind nginx, so the rate limiter sees the real client IP. |

Ports per thread are in `docs/patient-journey/PLAN.md` (API thread: Postgres 5432, API 4000).

## Demo logins

Seeded by `npm run db:setup`. All fictional.

| Role | Email | Password | Notes |
|---|---|---|---|
| Patient | `patient@example.com` | `demo-password` | Demo Patient, born 1990-01-01, `+351900000000`. Child: Leo Patient (2018-03-14). |
| Clinician | `doctor@carevia.test` | `doctor-demo-password` | Linked to doctor 0, Dr Emma Laurent. |
| Admin | `admin@carevia.test` | `admin-demo-password` | |

Demo visits, all with Dr Emma Laurent: today (about 15 minutes after seeding or reset), the child's visit in 3 days, and past completed, `needs_in_person` and cancelled visits.

## Auth

Better Auth 1.7, mounted at `/api/auth/*`, stores users in the same Postgres through the Prisma adapter.

- Session cookie: `carevia.session_token` (httpOnly, SameSite Lax). With an https `PUBLIC_APP_URL` it is Secure and named `__Secure-carevia.session_token`.
- Sign-up requires `firstName`, `lastName`, `phone` (E.164; spaces allowed, stored as `+351…`) and `dateOfBirth` (`YYYY-MM-DD`). Under-18s get `400 UNDERAGE`; a bad phone `400 INVALID_PHONE`. `role` cannot be set at sign-up.
- 18+ rule: `isAdult()` in `src/rules.js`. Someone born on 29 February turns 18 on 1 March in a non-leap year.
- Rate limiting is on in every environment (Better Auth defaults: 3 sign-ins or sign-ups per 10 s per IP; 100 requests per minute otherwise).
- Breached passwords are refused (`PASSWORD_COMPROMISED`, "This password has appeared in a data breach. Choose a different one.").
- Email verification, password reset (`/app/reset-password?token=…`) and change-email messages go to the outbox (`GET /api/dev/outbox`) in demo mode or development. No real email is sent in this build.
- Two-factor login (TOTP and backup codes). Outside demo mode, clinician and admin routes return `403 TWO_FACTOR_REQUIRED` until it is on.
- `/api/auth/update-user` is disabled; profile edits go through `PATCH /api/me`.

**CSRF.** `POST`, `PUT`, `PATCH` and `DELETE` on `/api/*` (outside `/api/auth/*`, which Better Auth checks) need an `Origin` in the trusted list, or `Sec-Fetch-Site: same-origin` when there is no `Origin`. Neither header is allowed only outside production. Otherwise: `403 FORBIDDEN_ORIGIN`. SameSite Lax alone would let sibling `*.triplelabs.dev` sites send cookie-carrying requests.

## Endpoints

Errors are `{ "error": "CODE", "message": "…" }`. Better Auth's own endpoints answer `{ "code", "message" }` (the sign-up rules above also include `error`).

**Catalog (public):** `GET /api/services`, `GET /api/doctors` (`q`, `language`, `specialty`, `maxFee`, `availability`, `service`, `group`, `groupSlug`, `sort=first-available`), `GET /api/doctors/:id`, `GET /api/doctors/:id/slots?from=YYYY-MM-DD&days=7`, `GET /api/slots/first-available?groupSlug=&serviceId=&language=&limit=6`. Service ids are stable (1–55). The schedule covers working days over the next 21 days at 09:00, 10:30, 12:00, 14:30, 16:00, 17:30 and 19:00 Lisbon time, 30 minutes each, topped up on start-up and hourly.

**Booking:** `POST /api/bookings` (hold for 10 minutes; `carevia_hold` cookie), `POST /api/bookings/:id/claim`, `PUT /api/bookings/:id/patient`, `GET /api/consent/current`, `POST /api/bookings/:id/consent`, `POST /api/bookings/:id/pay` (`{ method: "demo" }`; `501 PAYMENT_UNAVAILABLE` outside demo mode; `409 TIME_CLASH` if the same person, the account holder or one family member, already has a confirmed visit that overlaps; sends a confirmation to the outbox with the Lisbon date and time, the doctor and the visit link), `DELETE /api/bookings/:id`. A signed-in patient's hold is theirs at once (claim is then a no-op). The database allows at most one held or confirmed appointment per slot (partial unique index `Appointment_active_slot_key`).

**Appointments:** `GET /api/appointments?scope=upcoming|past`, `GET /api/appointments/:id`, `POST /api/appointments/:id/cancel`, `POST /api/appointments/:id/reschedule` (`{ slotId }`: moves the same appointment, never a second one; `409 CANNOT_RESCHEDULE`, `409 SLOT_TAKEN`, `409 TIME_CLASH`, `400 SERVICE_MISMATCH`), `GET /api/appointments/:id/calendar.ics`, `POST /api/appointments/:id/pre-join`, `POST /api/appointments/:id/video-token` (`{ companion: true }` for the companion's token; `409 VIDEO_DISABLED`, `425 TOO_EARLY`, `410 WINDOW_CLOSED`, `409 PRE_JOIN_REQUIRED`), `POST /api/appointments/:id/call-events`, `GET /api/video/status`.

**Family and profile:** `GET`/`POST /api/family`, `PATCH`/`DELETE /api/family/:id` (deleting archives, so past visits keep the name; `409 HAS_UPCOMING`), `PATCH /api/me`.

**Clinician:** `GET /api/clinician/agenda?date=`, `POST /api/clinician/appointments/:id/outcome`, `GET /api/clinician/imed-link`.

**Admin:** `GET /api/admin/appointments?date=&status=`, `GET /api/admin/access-log?appointmentId=`, `GET`/`PUT /api/admin/daily`. Admin and clinician reads of appointments write access-log rows. Those are the only writes made by `GET` requests.

**Demo and development:** `GET /api/demo`, `POST /api/demo/reset` (admin; optional `{ startsInMinutes: 0–120 }`, default 15; keeps the catalog and Daily key), `GET /api/dev/outbox`.

The Daily key is stored only in Postgres. `GET /api/video/status` returns `{ enabled }` only; admin reads return the last four characters.

## Smoke and unit tests

```sh
npm test --prefix apps/api          # node --test: dates, DST, schedule, holds, join window, origin check, consent
```

The smoke script drives the running API, starts a fake Daily on `127.0.0.1:4090`, and uses Prisma once to backdate a hold. Start the API for it like this, then run `npm run smoke --prefix apps/api`:

```sh
# Demo mode (the full journey, 130 checks)
DEMO_MODE=true NODE_ENV=development DAILY_API_URL=http://127.0.0.1:4090/v1 npm run start --prefix apps/api
# Demo mode off (locks: 404 demo routes, 501 payment, two-factor required, CSRF in production; 27 checks)
NODE_ENV=production DAILY_API_URL=http://127.0.0.1:4090/v1 npm run start --prefix apps/api
```

The demo run ends with a demo reset, so the database is left in its seeded state.

## Admin app

`npm run dev:admin` serves `apps/admin` on `http://localhost:5174` (production builds use `base: '/admin/'`, next to `/app/` and `/api` on one origin) and proxies `/api` to `API_URL` (default `http://127.0.0.1:4000`). It signs in through Better Auth (with the two-factor step), lists appointments operationally (no patient details) and keeps the Daily settings screen. Demo logins appear only when built with `VITE_DEMO_MODE=true` (or `VITE_DEMO=1`) and the API is in demo mode.
