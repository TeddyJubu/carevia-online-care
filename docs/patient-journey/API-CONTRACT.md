# Patient journey: API contract

The API thread implements this; the web thread builds against it, with a mock mode until the API lands. Change it only through the orchestrator. If something here is wrong or impossible, say so in your report and implement the closest safe version.

Read [PLAN.md](PLAN.md) first. Its rules (no clinical documents, no clinical data, demo locking, video privacy) apply to every endpoint.

## Conventions

- **Base path `/api`.** JSON in and out. The web dev server proxies `/api` to the API, so cookies are first-party and CORS is not involved.
- **Errors:** `{ "error": "CODE", "message": "Plain sentence for the patient." }`, using the HTTP codes listed here. Keep the existing codes (`AUTH_REQUIRED`, `SLOT_TAKEN`, `VIDEO_DISABLED`, `AUDIO_DISABLED`, `DAILY_ERROR` and so on).
- **Times are ISO 8601 in UTC** (`"2026-11-06T09:30:00.000Z"`). The web app shows them in `Europe/Lisbon`. Slot generation uses `Europe/Lisbon` wall-clock times, so 09:30 Lisbon is 09:30 in winter and 08:30Z in summer.
- **Money:** `fee` is in whole euros, as in the existing schema.
- **Ids:** appointments use cuid strings; doctors, groups and services keep their integer ids. Every service group also gets a stable `slug`, matching the homepage's ids: `general`, `mental`, `nutrition`, `specialist`, `certificates`, `treatments`, `renewals` (same order as the existing groups 0–6).
- **Auth:** Better Auth's session cookie. Every endpoint marked (patient), (clinician) or (admin) returns `401 AUTH_REQUIRED` without a session and `403 FORBIDDEN` with the wrong role. A patient can only see their own appointments and family members; a clinician only appointments with their doctor profile; an admin sees operational fields only.
- **Logs:** never log names, emails, phones, dates of birth, cookies or Daily tokens. Use ids.

## Auth (Better Auth, mounted at `/api/auth/*`)

Better Auth's standard email-and-password endpoints replace the old `/api/auth/register`, `/login`, `/logout` and `/me`:

| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/auth/sign-up/email` | `{ email, password, name, firstName, lastName, phone, dateOfBirth }` | `name` = first and last name. `dateOfBirth` is `YYYY-MM-DD`; under-18s get `400 UNDERAGE` ("You need to be 18 or over to create an account. A parent or guardian can book for a child."). `phone` is E.164 (`+351…` or another country). Starts a session. |
| `POST /api/auth/sign-in/email` | `{ email, password }` | `401` with Better Auth's code on failure. If two-factor login is on, it returns the two-factor challenge. |
| `POST /api/auth/sign-out` | | |
| `GET /api/auth/get-session` | | `{ session, user }` or `null`. `user` = `{ id, email, emailVerified, firstName, lastName, phone, dateOfBirth, role }`. |
| `POST /api/auth/request-password-reset`, `POST /api/auth/reset-password` | Better Auth's shapes | Reset link: `/app/reset-password?token=…` |
| `GET /api/auth/verify-email` | Better Auth's shape | Verification link lands on `/app/account?verified=1` |
| Two-factor endpoints | Better Auth's `two-factor` plugin | Required for clinician and admin outside demo mode |

Rate limiting is on in every environment. Passwords found in breach data are rejected with Better Auth's code; the web app shows "This password has appeared in a data breach. Choose a different one."

The admin app signs in with the same endpoint, then checks `role === "admin"`.

## Catalog (public)

- **`GET /api/services`:** `{ groups: [{ id, slug, name, blurb, icon, fromFee, services: [{ id, name }] }] }`. Services now include their id.
- **`GET /api/doctors`:** keeps the existing filters (`q`, `language`, `specialty`, `maxFee`, `availability`, `service`, `group`) and adds:
  - `groupSlug`
  - `sort=first-available`
  - in each doctor, `nextAvailableAt` (or `null`)
- **`GET /api/doctors/:id`:** unchanged. The `education` text stays explicitly illustrative.
- **`GET /api/doctors/:id/slots?from=YYYY-MM-DD&days=7`:** `{ doctorId, slots: [{ id, startsAt, endsAt }] }`. Returns only free slots: not booked, not under an unexpired hold, and not in the past.
- **`GET /api/slots/first-available?groupSlug=&serviceId=&language=&limit=6`:** `{ slots: [{ id, startsAt, endsAt, doctor: { id, name, initials, specialty, languages, fee, cedula } }] }`, earliest first, across doctors.

The schedule is rolling: every doctor has slots on working days over the next 21 days, generated relative to today in `Europe/Lisbon` time, and kept topped up (on start-up and daily). Keep the existing per-doctor availability variety (`availabilityIndex`) so some doctors are free today and others later.

## Booking

A hold reserves a slot for 10 minutes. It can start **before** the patient has an account: the hold is tied to an httpOnly cookie, `carevia_hold`, and claimed after sign-in or sign-up.

| # | Endpoint | Body / result |
|---|---|---|
| 1 | `POST /api/bookings` | `{ slotId, serviceId, channel: "video", for: "self" \| "child" \| "adult", inMainlandPortugal: true }` returns `201 { appointment }` with `status: "held"` and `holdExpiresAt`. Rejects `inMainlandPortugal: false` with `400 NOT_ELIGIBLE` ("Carevia can only see patients who are in mainland Portugal during the visit."). Rejects `channel: "audio"` with `400 AUDIO_DISABLED`, and a taken slot with `409 SLOT_TAKEN`. A new hold by the same browser releases its previous hold. |
| 2 | `POST /api/bookings/:id/claim` (patient) | Attaches the held appointment to the signed-in patient. `404` if the hold isn't this browser's, `410 HOLD_EXPIRED` if it has expired. |
| 3 | `PUT /api/bookings/:id/patient` (patient) | `{ familyMemberId: string \| null }`. `null` = the patient themself. Required when `for` is `child` or `adult`. |
| 4 | `GET /api/consent/current` | `{ version, title, body }` (Markdown) from `content/patient-journey/consent.md`, plus `{ recordingOffered: false }` |
| 5 | `POST /api/bookings/:id/consent` (patient) | `{ version }` must equal the current version. Stores a consent record (appointment, user, version, time). `409 CONSENT_OUTDATED` if the version is stale. |
| 6 | `POST /api/bookings/:id/pay` (patient) | `{ method: "demo" }`. Requires consent, an unexpired hold and the patient set. Creates a payment (`method: "demo", status: "paid"`) and sets `status: "confirmed"`. Sends a confirmation message (outbox): the visit's date and time in Lisbon time, the doctor's name and a link to `/app/visits/:id`; no reason for the visit, no clinical data and no patient name. Outside demo mode it returns `501 PAYMENT_UNAVAILABLE`. If the same person (the account holder or one family member) already has a confirmed visit that overlaps, it returns `409 TIME_CLASH`. |
| 7 | `DELETE /api/bookings/:id` (patient or hold cookie) | Releases a hold. |

## Appointments

The `appointment` object, which every endpoint returns in this shape (with only the fields that role may see):

```json
{
  "id": "ck…",
  "status": "held | confirmed | completed | cancelled | expired",
  "outcome": "completed | ended_poor_quality | needs_in_person | no_show | null",
  "holdExpiresAt": "… | null",
  "startsAt": "…", "endsAt": "…",
  "channel": "video",
  "fee": 45,
  "service": { "id": 1, "name": "Adult urgent care", "groupSlug": "general", "groupName": "General & urgent care" },
  "doctor": { "id": 0, "name": "Dr Emma Laurent", "initials": "EL", "specialty": "General practitioner", "languages": "English · French", "cedula": "DEMO-CEDULA-…" },
  "patient": { "kind": "self | family", "displayName": "Ana Silva" },
  "consent": { "version": "…", "acceptedAt": "…" },
  "payment": { "status": "paid", "method": "demo", "amount": 45, "paidAt": "…" },
  "reminders": { "email": true, "sms": false, "sentAt": "… | null" },
  "preJoin": { "confirmedAt": "… | null", "companion": false },
  "call": { "joinOpensAt": "…", "joinClosesAt": "…", "state": "not_started | in_progress | ended", "reconnects": 0 },
  "imed": { "status": "not_connected" }
}
```

`imed.status` is always `"not_connected"` in this build. The web app explains: "Your doctor records this visit in iMED, Carevia's clinical system. Your clinical summary and anything your doctor decides to issue are available through iMED, not in Carevia." No document data ever appears here.

`payment` and `reminders` are in the patient's view only (an admin sees `payment.status` and `payment.method`; a clinician sees neither). `payment` is everything the web receipt shows: it is payment data only, never clinical. `payment.status` is `paid` in this build (`refunded` is reserved for a real provider); the web app shows a cancelled demo visit as "No charge", because no money was taken.

The join window opens 10 minutes before `startsAt` and closes 60 minutes after `endsAt`.

| Endpoint | Notes |
|---|---|
| `GET /api/appointments?scope=upcoming\|past` (patient) | `{ appointments: [...] }`, newest first for `past` |
| `GET /api/appointments/:id` (patient owner, clinician of that doctor, admin) | `{ appointment }` |
| `POST /api/appointments/:id/cancel` (patient) | Allowed until `startsAt`. Sets `cancelled` and releases the slot. Refund wording comes from `content/patient-journey/cancellation.md`. |
| `POST /api/appointments/:id/reschedule` (patient) | `{ slotId }`. Moves the **same** appointment (same id, consent and payment; never a second appointment). Allowed while it is `confirmed` and either hasn't started, or ended with `ended_poor_quality` and the join window has closed; otherwise `409 CANNOT_RESCHEDULE`. The new slot must be the same doctor or a doctor in the same service group (`400 SERVICE_MISMATCH`), in the future, and free (`409 SLOT_TAKEN`, by the same no-double-booking index; `404 SLOT_NOT_FOUND`). The same person may not have another confirmed visit at the new time (`409 TIME_CLASH`). The old slot is freed. Pre-join is asked again and a new Daily room is made for the new time. The fee already paid stands. Sends a "new time" message to the outbox. Another patient's appointment is `404`. Returns `{ appointment }`. |
| `PUT /api/appointments/:id/reminders` (patient) | `{ email: boolean, sms: boolean }`, both required, nothing else (`400 VALIDATION`). Stores the choice on this appointment (default email on, SMS off). `409 NOT_CONFIRMED` unless confirmed; `409 VISIT_STARTED` once it has started. Another patient's appointment is `404`. Returns `{ appointment }`. One reminder goes out about 24 hours before a confirmed visit that was paid for earlier than that (a visit booked inside 24 hours has just had its confirmation). A job every 5 minutes sends it and stores `reminders.sentAt` first, so it is sent once only, even across restarts. Content as the confirmation: Lisbon time, the doctor, the link to `/app/visits/:id` and the 112 line; no patient name and no reason. Email goes to the outbox; **SMS is not sent: there is no SMS provider yet.** In demo mode or development an SMS is written to the outbox with `channel: "sms"`, marked not sent. Moving a visit clears `sentAt`, so the new time gets its reminder. |
| `GET /api/appointments/:id/calendar.ics` (patient) | Calendar file. Summary "Carevia video consultation" plus the doctor's name; no health details; links to `/app/visits/:id`. |
| `GET /api/appointments/:id/receipt.pdf` (patient owner) | Payment receipt as a PDF download (`application/pdf`, `Content-Disposition: attachment`, `Cache-Control: private, no-store`). Carevia's operational data only: receipt number (`CV-<YYYYMMDD of payment>-<last 6 of payment id>`), date paid and visit date in Lisbon time, service ("Video consultation · <group name>"), amount, payment method, status, clinician name and cédula, patient name (plus "Booked by" for a family member's visit) and the appointment id. No reason for the visit and nothing clinical; no names in the PDF metadata. Marked "Demo receipt" while `DEMO_MODE` is on, and always "not a tax invoice (fatura)". `409 NOT_PAID` without a payment; another patient's appointment is `404`; signed out `401`. |
| `POST /api/appointments/:id/pre-join` (patient) | `{ emailConfirmed: true, mobileConfirmed: true, companion: boolean }`. Both confirmations are required (Portuguese teleconsulta rule). Stores the time. |
| `POST /api/appointments/:id/video-token` (patient, clinician) | Existing endpoint, extended. Requires `confirmed` status, the join window and (for patients) the pre-join step. Clinician gets `is_owner: true`, patient `false`. With `{ "companion": true }`, the patient gets a second, non-owner token. Returns `{ token, url, roomName, expiresAt }`. `409 VIDEO_DISABLED` without a Daily key; `425 TOO_EARLY` before the window; `410 WINDOW_CLOSED` after it. |
| `POST /api/appointments/:id/call-events` (patient, clinician) | `{ type: "joined" \| "left" \| "reconnect" \| "error" }`. Operational only. |
| `GET /api/video/status` | Unchanged: `{ enabled }` |

## Family members

- `GET /api/family` (patient): `{ members: [{ id, firstName, lastName, dateOfBirth, relationship: "child" \| "adult" }] }`
- `POST /api/family` (patient): same fields. A `child` must be under 18; an `adult` 18 or over.
- `PATCH /api/family/:id` and `DELETE /api/family/:id` (patient). You can't delete a member who has an upcoming appointment (`409 HAS_UPCOMING`).

## Profile

- `PATCH /api/me` (patient): `{ firstName?, lastName?, phone? }`. Email changes go through Better Auth's change-email flow.
- Sex and Número de Utente (the national health number) are not collected in this build.

## Clinician

- **`GET /api/clinician/agenda?date=YYYY-MM-DD` (clinician):** `{ doctor: {...}, appointments: [ appointment ] }` for that day in Lisbon time. It includes the patient's display name, service, time, status and call state. It never includes clinical fields, because there are none.
- **`POST /api/clinician/appointments/:id/outcome` (clinician):** `{ outcome: "completed" | "ended_poor_quality" | "needs_in_person" | "no_show" }`. Sets `status: "completed"` (or keeps `confirmed` for `ended_poor_quality`, so the patient can reconnect or reschedule). There's no free-text reason: the reason goes in iMED.
- **`GET /api/clinician/schedule` (clinician):** the doctor's own profile (`doctor`, without the login id) and every time from now to the end of the rolling schedule (`days`, 21): `slots: [{ id, startsAt, endsAt, open, booked }]`. Removed times stay listed with `open: false` so they can be opened again. No patient names: the agenda shows who booked. Web: `/app/doctor/profile`.
- **`POST /api/clinician/slots` (clinician):** `{ date: "YYYY-MM-DD", time: "HH:MM" }` in Lisbon time opens a 30-minute time, or reopens a removed one (same slot id). `201 { slot }`; `400 VALIDATION` or `SLOT_PAST`; `409 SLOT_EXISTS` when it overlaps an open time. Same rules as the admin Doctors screen.
- **`DELETE /api/clinician/slots/:id` (clinician):** removes an upcoming free time on the doctor's own schedule (closed, not deleted, so the hourly top-up doesn't add it back). `409 SLOT_BOOKED` while a hold or visit is on it; another doctor's time is `404`.
- **`GET /api/clinician/imed-link`:** `{ url }` from the `IMED_URL` setting, defaulting to `https://imed.pt/imed/home`.

## Admin (operational only)

- `GET /api/admin/appointments?date=&status=`: id, status, outcome, `startsAt`, service, doctor name, call state and payment status. No patient date of birth, phone or email.
- `GET` and `PUT /api/admin/daily`: unchanged.
- Patients: `GET /api/admin/patients?q=`, `GET /api/admin/patients/:id` (with their appointments, access-logged), `PATCH /api/admin/patients/:id` (name, email, phone; `409 EMAIL_IN_USE`).
- Services: `GET /api/admin/service-groups`, `POST /api/admin/service-groups`, `PATCH /api/admin/service-groups/:id`, `POST /api/admin/services`, `PATCH /api/admin/services/:id`. `active: false` takes a group or service off the patient menu and blocks booking it (`404 SERVICE_NOT_FOUND`).
- Doctors: `GET /api/admin/doctors?q=`, `GET`, `POST` and `PATCH /api/admin/doctors/:id`. `active: false` hides the doctor from patients, and their times can't be held (`409 SLOT_TAKEN`).
- Schedule: `GET /api/admin/doctors/:id/slots` lists open future times. `POST` with `{ date, time }` (Lisbon) adds a time, or reopens one removed earlier (`400 SLOT_PAST`, `409 SLOT_EXISTS` if it overlaps). `DELETE /api/admin/doctors/:id/slots/:slotId` closes the time (`409 SLOT_BOOKED` while a live hold or visit is on it). Closed times keep their row, so the hourly top-up doesn't add them back.
- Every admin or clinician read of an appointment writes an access-log row (who, which appointment, when, which endpoint).
- Doctor applications: `GET /api/admin/doctor-applications?status=` (newest first, at most 200) and `PATCH /api/admin/doctor-applications/:id` with `{ status: new | contacted | approved | declined }`. Approving creates nothing: add the doctor and its clinician login under Doctors.

## Doctor registration (public)

- `POST /api/doctor-applications`: `{ firstName, lastName, email, phone (E.164), body: medicos | psicologos | nutricionistas, cedula, specialty, groupSlug?, yearsInPractice, languages, message?, consent: true }` returns `201 { id }`. No account or password is created. Five per IP per hour (`429 TOO_MANY_REQUESTS`).

## Demo mode (`DEMO_MODE=true` only)

- `GET /api/demo` returns `{ enabled: true, accounts: [{ role, email, password, label }] }`. Without demo mode, it's `404`.
- `POST /api/demo/reset` (admin, demo mode only): reseeds everything.
- `GET /api/dev/outbox` (demo mode or `NODE_ENV=development`): emails that would have been sent, newest first: `{ messages: [{ id, channel, to, subject, text, links, sentAt }] }`, where `channel` is `email` or `sms` (SMS rows were never delivered).

## Demo data (seed)

All fictional. It keeps the existing catalog (7 groups, 55 services, 220 doctors with `DEMO-CEDULA-*`) and adds:

| Account | Email | Password | Notes |
|---|---|---|---|
| Patient | `patient@example.com` | `demo-password` | Demo Patient, born 1990-01-01, phone `+351 900 000 000` (a non-working demo number). Has a child, "Leo Patient" (born 2018-03-14). |
| Clinician | `doctor@carevia.test` | `doctor-demo-password` | Linked to doctor id 0 (Dr Emma Laurent, General practitioner). In the web app her portrait is the illustrative demo-doctor image; everywhere else, initials. |
| Admin | `admin@carevia.test` | `admin-demo-password` | |

The demo patient's appointments, all with Dr Emma Laurent so the clinician demo sees them:

- **Today:** a confirmed video visit starting in about 15 minutes (relative to seed time), with consent and demo payment done. This shows off the waiting room. `POST /api/demo/reset` moves it to about 15 minutes from the reset time.
- **In 3 days:** a confirmed visit for the child.
- **Past:** a completed visit (`outcome: "completed"`), a completed one with `needs_in_person`, and a cancelled one.

No seed row, fixture or file contains clinical content or a document.

## Content files (owned by the content thread)

`content/patient-journey/*.md`. Each file starts with front matter:

```yaml
---
id: consent            # consent | emergency | cancellation | recording | demo-banner
version: 2026-11-05.1  # bump when the text changes
status: draft-legal-review
title: Before your consultation
---
```

The API reads `consent.md` for `/api/consent/current`. The web app imports the others at build time (`?raw`). Until the content thread lands, each consumer uses a clearly marked placeholder with the same front matter.

## Web routes (owned by the web thread; all under `/app/`)

| Route | Screen |
|---|---|
| `/app/book` | Booking, step 1: search and the areas of care. Old links: `?service=<slug>` opens that area's doctors, `&doctor=<id>` that doctor's times |
| `/app/book/doctors?group=<slug>&service=<id>` | Choose who cares for you: area, service, filters, doctors with their next times |
| `/app/book/doctors/:id` | Doctor profile |
| `/app/book/doctors/:id/times?slot=<id>` | The doctor's times and who the visit is for (Me, my child, another adult); Continue holds the time |
| `/app/book/checkout` | Your details (signed out), the child or adult (from Family or new), mainland and consent boxes, demo payment; then claim, patient, consent and pay as in the Booking table |
| `/app/book/<old step>`, `/app/services-v2/…` | Old addresses: the step-by-step flow's screens go to `/app/book`; `/app/services-v2/…` to the same path under `/app/book` |
| `/app/appointments` | Every visit on the account (the patient's and family members'), Upcoming and Past, each linking to `/app/visits/:id`. In the account menu and, for patients, the header |
| `/app/visits/:id` | J7: confirmation and preparation, calendar file, questions stored on the device; reminder choices, the payment card and Documents (receipt PDF; after a completed visit, a Prescription panel that explains national e-prescription delivery and never shows a document) |
| `/app/visits/:id/join` | J8: confirm email and mobile, companion option (new screen) |
| `/app/visits/:id/waiting` | J9: device check and waiting room |
| `/app/visits/:id/call` | J10: Daily call (Prebuilt or call object, embedded) |
| `/app/visits/:id/done` | J11: visit status and the iMED explanation, plus "book a follow-up" |
| `/app/visits/:id/receipt` | Printable demo payment confirmation (not a tax invoice / fatura). Payment only. |
| `/app/account`, `/app/account/family`, `/app/account/payments`, `/app/account/profile` (password and two-factor live here) | J12. Payments lists paid visits and shows the refund terms from `cancellation.md`. |
| `/app/signin`, `/app/signup`, `/app/forgot-password`, `/app/reset-password` | Auth |
| `/app/join` | Doctor registration: why join, three steps, and the application form. Linked from the homepage clinicians section, footer and menu ("For doctors") |
| `/app/doctor`, `/app/doctor/visits/:id` | J13: agenda; visit room as owner, plus outcome |
| `/app/dev/outbox` | Demo or development only |
