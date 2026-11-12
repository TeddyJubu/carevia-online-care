# Doctors journey: plan

Status: planning draft, 12 November 2026. Companion file: [wireframes/wireframes.html](wireframes/wireframes.html)
(open in a browser, print to PDF landscape).

This plan covers the doctor's whole life in Carevia: finding Carevia, applying, being verified, getting a
login, setting up, seeing patients day to day, and leaving. The patient's rules in
[../patient-journey/PLAN.md](../patient-journey/PLAN.md) and `AGENTS.md` still win everywhere. Where this plan
conflicts with them, they win.

## What already exists (do not rebuild)

Verified against the code on `main` on 12 November 2026:

| Piece | Where | State |
|---|---|---|
| Public "Join Carevia" application form | `/app/join` (`apps/web/src/pages/join.tsx`) | Done. Why-join copy, three steps, form with professional body, cédula, specialty, languages, consent. No account is created. |
| Application received confirmation | `/app/join` sent state | Done. |
| Admin applications inbox | `apps/admin` Applications screen | Done, basic. Filter by status (new, contacted, approved, declined), change status. Approving creates nothing. |
| Admin doctor profiles and schedules | `apps/admin` Doctors screen, `/api/admin/doctors*` | Done. Create/edit profile, shown/hidden, add/remove upcoming times. |
| Clinician sign-in | `/app/signin` (shared Better Auth) | Done. Two-factor required for clinician and admin outside demo mode. |
| Clinician agenda | `/app/doctor` (`Agenda`) | Done. One day at a time, next visit, outcomes to record, link to profile and iMED. |
| Visit room as owner | `/app/doctor/visits/:id` (`DoctorVisit`) | Done. Four steps: Prepare, Call (Daily, owner token), Outcome (four outcomes, no free text), Write it up in iMED. |
| Own profile and open times | `/app/doctor/profile` (`DoctorProfile`) | Done, basic. Tap times open/closed, add a time, "See what patients see". Profile fields are read-only. |
| Demo clinician | `doctor@carevia.test` linked to doctor 0 (Dr Emma Laurent) | Done for the demo. |
| Homepage links into joining | Clinicians section, footer, menu open `/app/join` | Done. |

## The gaps this plan fills

1. **Nobody can create a clinician login.** Sign-up is hard-coded to `role: patient`
   (`apps/api/src/auth.js`), the admin Doctors editor has no field for the login link, and
   `Doctor.clinicianUserId` can only be set by hand in the database. The admin comment "link their clinician
   account there" describes a screen that does not exist. This is the single blocking gap in the journey.
2. **No onboarding.** A clinician's first sign-in lands straight on the agenda. There is no profile check,
   no working-agreement acknowledgement, no device test, no "set your first hours" moment, and nothing stops
   a profile going live before the doctor has seen what patients see.
3. **No clinician account screen.** Password change and two-factor setup live on the patient profile
   (`/app/account/profile`), which is guarded `patient` only. A clinician who must enrol in two-factor
   outside demo mode has no screen that lets them.
4. **No past-visit view, no notifications, no time off.** The agenda only looks at one day. A doctor cannot
   see yesterday's completed visits, is never told a visit was booked or cancelled, and can only close times
   one by one.
5. **No way to cancel, pause, or leave.** A doctor who is ill cannot cancel one visit properly, and admin
   hiding a doctor (`active: false`) has no rule for the visits already booked with them.
6. **No earnings view.** Deliberately last: demo payment takes no money, so any earnings screen before a real
   payment provider is a mock. Planned, not built, in this pass (screen D18, backlog).

## The journey at a glance

| Stage | Doctor's goal | Screens | State |
|---|---|---|---|
| 1. Discover and apply | "Is this for me, and can I join in five minutes?" | D01 Join, D02 Received | Exists |
| 2. Verification (admin) | Carevia checks cédula, identity, specialty, insurance, then decides | A01 Application detail, A02 Verification checklist | New, in admin |
| 3. Provisioning (admin) | A doctor profile and a clinician login exist and are linked | A03 Invite and link login | New, in admin |
| 4. First login and onboarding | Set password, secure the account, check the public profile, agree how Carevia work works, open first hours, test the camera | D03 Accept invite, D04 Checklist, D05 Security, D06 Profile preview, D07 Agreement, D08 First hours, D09 Device check, D10 Ready | New, in `/app/doctor/welcome` |
| 5. Daily practice | See today's patients, run each call, close each visit properly | D11 Agenda, D12 Prepare, D13 Call, D14 Outcome, D15 iMED hand-off | Exists |
| 6. Practice admin | Keep hours and account in shape without calling Carevia | D16 Profile and times, D17 Visit history, D18 Earnings (later), D19 Account and security, D20 Time off | Extend and new |
| 7. Exceptions | Something went wrong and the patient is still looked after | E01 Patient did not join, E02 Poor connection, E03 Doctor cancels a visit, E04 Account paused or not linked | Partly exists |
| 8. Leaving | Pause or leave without stranding patients | D21 Request a pause or to leave, A04 Admin close-down | New |

Rules that shape every stage:

- **An application is not an account.** No login exists until an admin has verified the cédula and approved.
  Approved is a decision, not an automatic account creation.
- **One person, one login, one doctor profile.** `Doctor.clinicianUserId` is unique. A login with role
  `clinician` but no linked profile sees the "not linked" state (E04), never an empty agenda.
- **The profile is not live until onboarding is finished.** `active` (shown to patients) stays off through
  verification and setup, and turns on only at D10 (doctor confirms) or by an admin afterwards.
- **Carevia never holds clinical data, for doctors either.** No notes field, no reason field, no document
  upload anywhere in this journey. The outcome list stays the existing four, with no free text. Anything
  clinical is written in iMED, under iMED's own login, which Carevia never collects or stores.
- **Identity the patient can check.** Name, specialty and cédula shown on the patient side are the verified
  ones. A doctor cannot self-edit name, cédula, specialty, fee, or area of care; they can flag an error
  (D06) and an admin corrects it. Languages, experience and training text can be proposed by the doctor and
  are shown after saving, matching today's "contact the Carevia team" note being replaced by a flag, not chat.
- **Two-factor is part of onboarding, not a surprise later.** Outside demo mode a clinician cannot reach the
  agenda until two-factor is on. The agenda is also blocked until email is verified.
- **Every operational email the doctor gets has no clinical content and no patient identifiers beyond what
  the doctor already sees in their own agenda** (first name and service, as in the agenda). Booking alerts
  follow the same rule as patient messages in the API contract.
- **No arrow glyphs on buttons or links. Recording is never offered. The 112 limit and "doctor decides what
  to issue" copy appear wherever a patient-facing claim is made (D01).** Demo accounts and `DEMO-CEDULA-*`
  stay demo-only, and none of these screens show in a production build as demo content.
- **Audio consultations are out of this plan.** The doctor's audio flow (outbound call to the patient's
  mobile) gets its own plan; the visit room here is video only, as built.

## Stage notes

### 1. Discover and apply (D01, D02) — exists, small changes

Keep the screen. Changes only:

- Add an eligibility strip before the form: current cédula with one of the three Ordens, practising within
  your competence, a private space and a computer or tablet with camera. This prevents most declined
  applications without adding fields.
- Add what happens after approval to the three steps (invite by email, set up your login, open your hours),
  so D04's checklist is not a surprise.
- Application status updates go by email (outbox in demo) at `contacted` and at the decision. There is no
  public "track my application" page and no login to check; an application reference in the email is enough.

### 2. Verification (A01, A02) — new, admin only

The inbox stays a list. Opening a row gets a detail view with the full application and a **verification
checklist**, each item ticked by a named admin with a date:

- cédula checked with the Ordem (number and body match the application)
- identity matches the cédula holder (checked on the call)
- specialty and requested area of care are within competence
- professional liability insurance confirmed (launch gate; record "confirmed" and the date, not policy files)
- introductory call done

Decision buttons sit under the checklist: **Approve** (enabled only when every required item is ticked),
**Decline** (asks for nothing clinical; the applicant gets a plain email, no reasons stored beyond a
status), and the existing **Contacted**. Approving moves the application to `approved` and opens A03 with the
application's details carried over. Nothing here creates a login yet.

Data: `DoctorApplication` gains `reviewedBy`, `reviewedAt`, and a small checklist record (item, done, by,
at). This is operational data about the application, not clinical data, so it may live in Postgres.

### 3. Provisioning (A03) — new, admin only, the blocking fix

One screen, reached from an approved application or from the Doctors editor, that does three things in order:

1. **Doctor profile**: pre-filled from the application (name, specialty, languages, cédula, area of care),
   plus fee, service, experience, training, approach. Saved hidden (`active: false`).
2. **Login link**: shows one of three states — no login yet, invite pending (email, sent date), linked
   (account email, two-factor on or off). 
3. **Send invite**: creates the `User` with `role: clinician`, `clinicianUserId` set, email unverified, and
   sends a set-password invite (Better Auth password-reset style token, expiring, single use). Resend and
   revoke sit beside it. Creating a second login for an email that already has one is refused with a plain
   message; a patient account can never be converted into a clinician account from this screen.

The Doctors editor gains the same login-link panel, so an admin can fix a link without an application (the
seeded and imported doctors need this). API sketch (admin role, access-logged where it touches appointments):

- `POST /api/admin/doctors/:id/invite` — create the clinician user and link, send invite. `409 EMAIL_IN_USE`,
  `409 ALREADY_LINKED`.
- `POST /api/admin/doctors/:id/invite/resend`, `POST /api/admin/doctors/:id/invite/revoke` (revoke disables
  the login, keeps the profile).
- `GET /api/admin/doctors/:id` starts returning `login: { linked, email, invitedAt, emailVerified,
  twoFactorEnabled }`.

### 4. First login and onboarding (D03 to D10) — new, `/app/doctor/welcome`

D03 is the invite landing: the link signs the doctor into a password-setting screen (not the generic patient
reset copy). Then `/app/doctor/welcome` is a checklist that carries across sign-outs; until it is complete,
the clinician shell shows only the checklist, sign out, and help. The agenda is not reachable.

| Step | Screen | Done when |
|---|---|---|
| Secure your account | D05 | Email verified and two-factor on (skippable only in demo mode, and the checklist says so) |
| Check your public profile | D06 | Doctor has seen the patient view and either confirmed it or flagged an error. Flagging does not block; it notifies admin and the profile stays hidden until resolved |
| How Carevia work works | D07 | Doctor ticks each statement and accepts the clinician agreement, version and time stored (same pattern as patient consent). Statements: private and quiet space for every call; your name and cédula are shown to patients; the clinical record, prescriptions and certificates are written in iMED only; nothing is recorded; if connection quality is too poor for a safe opinion, end the visit and record why in iMED; Carevia is not an emergency service and patients are told to call 112; you only see patients in mainland Portugal. |
| Open your hours | D08 | At least one future open time exists, set with the weekly pattern editor (see D20) or single times, as today |
| Test your camera and microphone | D09 | Device check passes (camera, mic, speaker, browser), in a test room with no patient. Reuses the patient device-check pattern, clinician wording. Also a reminder to sign in to iMED separately; Carevia never asks for the iMED password |
| Ready | D10 | Summary of the above; "Start seeing patients" turns the profile shown (`active: true`) and lands on the agenda |

Data: a `ClinicianOnboarding` record (user, step states, agreement version and acceptance time), or the
equivalent fields on the linked doctor row. One row per clinician, no clinical content. API sketch
(clinician role, own record only): `GET /api/clinician/onboarding`, `POST /api/clinician/onboarding/step`
with `{ step, version? }`, `POST /api/clinician/onboarding/complete` which flips `active` only when every
required step is done.

### 5. Daily practice (D11 to D15) — exists, small extensions

The agenda and four-step visit room stay as built. Extensions, in priority order:

- **Week strip on the agenda**: seven days with visit counts, over the existing day navigation. Not a month
  calendar; the rolling schedule is 21 days and a week matches how doctors scan.
- **Booked and cancelled alerts**: when a patient books, cancels, or reschedules with this doctor, an email
  goes to the clinician (outbox in demo) and the agenda shows a small "New since you last looked" marker on
  the visit. Carevia stores a per-clinician "agenda seen at" time, nothing about the patient.
- The agenda row and visit room already show companion and reconnect counts; keep them. The doctor never
  sees the patient's pre-visit questions (those stay on the patient's device, by rule).

### 6. Practice admin (D16 to D21) — extend

- **D16 Profile and times** is today's `DoctorProfile`, rearranged: public profile card (read-only fields
  with "Flag an error" opening the D06 flag), editable languages/experience/training proposal, then hours.
- **D20 Hours editor**: the tap-to-toggle day list stays. Add a weekly pattern ("Weekdays 09:00 to 13:00")
  that proposes times for the next 21 days for the doctor to confirm in bulk, and **time off**: pick a
  range, close every open time in it. Closing a range that contains a booked visit is refused and lists the
  visits, pointing at E03. Booked times can never be closed, as today. API: pattern apply and range close
  are bulk versions of the existing slot endpoints, same `SLOT_BOOKED` rule per slot.
- **D17 Visit history**: past days, one row per visit (time, patient display name, service, outcome, fee),
  reached from the agenda. Operational only; the clinical record is in iMED and the screen says so.
- **D19 Account and security**: the patient's Profile and TwoFactor components, allowed for the clinician
  role: name on the login, email change, phone, password, two-factor, active sessions. Carevia account
  details only; the public doctor profile is D16. This is the screen that unblocks the two-factor rule for
  clinicians provisioned before this plan.
- **D21 Request a pause or to leave**: a short form (pause from/to or leave, optional message to the Carevia
  team, nothing clinical). It notifies admin; it does not itself hide the profile or cancel anything.

### 7. Exceptions (E01 to E04)

- **E01 Patient did not join**: exists inside the outcome step ("Patient didn't join"). Add waiting-room
  colour in the visit room: before the call, the Prepare step shows whether the patient has confirmed and
  joined the waiting room (pre-join state is already stored; no new data). The doctor still decides.
- **E02 Poor connection**: exists ("Ended: poor connection" keeps the same appointment open; patient can
  rejoin or reschedule free). The doctor's outcome copy already says this. No change beyond testing it.
- **E03 Doctor cancels a visit**: new. From a visit the doctor cannot do: "I can't do this visit" asks for a
  confirmation that names the patient-facing result — the patient is told the visit is cancelled, is offered
  a new time with the same doctor or another in the same area, and refund wording follows
  `content/patient-journey/cancellation.md`. It never deletes the visit; it sets the existing `cancelled`
  status with a `cancelledBy: clinician` marker, frees the slot, emails the patient (outbox in demo), and
  shows on the admin appointments list. Data: one nullable field on `Appointment`. API:
  `POST /api/clinician/appointments/:id/cancel` (own visits only, before start, confirmed only).
- **E04 Paused or not linked**: new states, not screens with forms. A clinician login with no linked profile,
  a revoked login, or (outside demo) two-factor not yet on, each gets one plain page saying what happened
  and who to contact. No agenda data is shown behind any of them.

### 8. Leaving (A04) — new, admin only

From the Doctors editor: **Pause this doctor** (hidden from patients, existing visits untouched, login still
works, agenda read-only with a banner) and **Close this doctor down**. Close-down is refused while confirmed
future visits exist, and lists them; the admin first cancels them one by one (each patient gets the E03
message and the cancellation terms) or waits for them to pass. Only then: profile hidden, open future times
closed, login disabled (not deleted — access logs and past appointment rows keep their actor). iMED is
untouched; the clinical record stays with its depositary. Past Carevia rows stay as operational history.

## Screen inventory

Admin screens are in the admin app, everything else under `/app/`. Tags: Exists, Extend, New.

| ID | Screen | Route | Tag |
|---|---|---|---|
| D01 | Join Carevia (public) | `/app/join` | Exists |
| D02 | Application received | `/app/join` sent state | Exists |
| A01 | Application detail | admin, Applications, row | New |
| A02 | Verification checklist and decision | admin, within A01 | New |
| A03 | Invite and link login | admin, Doctors editor panel | New |
| D03 | Accept invite, set password | `/app/reset-password` variant for invite | New |
| D04 | Onboarding checklist (shell) | `/app/doctor/welcome` | New |
| D05 | Security: verify email, two-factor | `/app/doctor/welcome/security` | New |
| D06 | Check your public profile | `/app/doctor/welcome/profile` | New |
| D07 | How Carevia work works (agreement) | `/app/doctor/welcome/agreement` | New |
| D08 | Open your first hours | `/app/doctor/welcome/hours` | New |
| D09 | Camera and microphone check | `/app/doctor/welcome/device-check` | New |
| D10 | Ready to see patients | `/app/doctor/welcome/ready` | New |
| D11 | Agenda (day plus week strip) | `/app/doctor` | Extend |
| D12 | Visit: Prepare | `/app/doctor/visits/:id` | Exists |
| D13 | Visit: Call (owner) | same, call step | Exists |
| D14 | Visit: Outcome | same, outcome step | Exists |
| D15 | Visit: Write it up in iMED | same, iMED step | Exists |
| D16 | Your profile (public view, flag errors) | `/app/doctor/profile` top | Extend |
| D17 | Visit history | `/app/doctor/history` | New |
| D18 | Earnings | `/app/doctor/earnings` | Later |
| D19 | Account and security | `/app/doctor/account` | New |
| D20 | Your hours (pattern and time off) | `/app/doctor/profile` hours | Extend |
| D21 | Request a pause or to leave | `/app/doctor/account/pause` | New |
| A04 | Pause or close down a doctor | admin, Doctors editor | New |
| E01 | Patient in waiting room (state) | within D12 | Extend |
| E02 | Poor connection outcome | within D14 | Exists |
| E03 | Doctor cancels a visit | within visit, dialog | New |
| E04 | Not linked / paused / two-factor needed | `/app/doctor` states | New |

## Build order

Four small waves. No new app; admin screens stay in `apps/admin`, clinician screens in `apps/web`, API in
`apps/api`, following the ownership rules of the patient-journey plan.

1. **Wave D-A (unblocks everything):** A01, A02, A03, the admin invite API, D03, and the E04 "not linked"
   state. After this wave a real doctor can be taken from application to a working login by an admin,
   without touching the database by hand. Demo seed keeps working: the demo clinician is already linked.
2. **Wave D-B (onboarding):** D04 to D10, the onboarding API, and the "not live until ready" rule. Doctors
   invited in wave D-A who have not onboarded sit hidden, which is the correct state for them.
3. **Wave D-C (daily life):** week strip and booking alerts on D11, D17 history, D19 account and security,
   D20 pattern and time off, E03 doctor-cancels, D21 pause request, A04 close-down.
4. **Wave D-D (later, needs real payments):** D18 earnings, a real invite and alert email provider (today
   everything lands in the outbox), Portuguese translation of every new string, and the audio-visit doctor
   flow under its own plan.

## Launch gates this journey adds

On top of the patient-journey launch list, before a real doctor sees a real patient:

- cédula verification with the Ordem is happening in practice, not just as a checklist item (ERS registration
  and verified cédulas are already launch gates; A02 is where they are evidenced)
- liability insurance confirmed per doctor
- the clinician agreement text (D07) reviewed by the same lawyer reviewing consent and cancellation
- data-processing agreements already listed (iMED, Daily, email and SMS senders) cover clinician emails
- a tested path for a doctor cancelling a visit (E03) and for close-down with booked visits (A04)
- Portuguese versions of D01 to D21

## Open questions

- Do clinicians need to be physically in Portugal, or is a Portuguese cédula plus patients in mainland
  Portugal enough? The plan assumes the second; confirm with the lawyer before D07's wording is final.
- Who sets the fee: Carevia centrally, or per doctor within a range? A03 assumes admin sets it at
  provisioning and the doctor sees it at D06 but cannot change it. Confirm before wave D-A.
- Should profile text the doctor edits (languages, experience) go live immediately or after an admin glance?
  The plan says immediately for those three fields only; everything identifying stays admin-controlled.
- Earnings and payouts (D18) wait for the payment provider decision already in the backlog. Nothing in
  waves D-A to D-C should pre-empt it.
