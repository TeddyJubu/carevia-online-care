# Patient journey: build plan

Branch: `patient-journey` (created 5 November 2026 from `design-v5-and-4-5`, with `backend` merged in).
Every thread on this work reads this file, [API-CONTRACT.md](API-CONTRACT.md) and the repo's [AGENTS.md](../../AGENTS.md) before writing code.
The wireframes this journey follows are in [wireframes/](wireframes/) (open `wireframes.pdf`). Where they conflict with this file or with the rules below, this file and the rules win.

## Approved decisions

1. **Login: Better Auth inside the Fastify API** (`apps/api`), using its Prisma adapter and the existing Postgres. It replaces the hand-written sessions in `apps/api/src/session.js`. Roles: `patient`, `clinician`, `admin`.
2. **The real patient portal is a new app, `apps/web`** (React, Vite, Tailwind, TypeScript, set up like `v5/`). It is served under `/app/`. It replaces the temporary test portal in `apps/portal` once it does everything that one does; delete `apps/portal` only then. `v5/` holds a Better Auth demo (sign-in, sign-up, account) as a reference to port from; its server code is superseded.
3. **Homepage: Design 04.5, as the existing static build.** `build.mjs` writes it to `dist/index.html`; 04.2 keeps its own URL. The homepage links into `/app/`.
4. **The 4.5 look on app pages, in CSS only:** navy palette, Clash Grotesk headings, the 04.5 body font, pill buttons, glass cards, 44px tap targets, reduced-motion support. The WebGL effects (liquid logo, specular rim, ripple) stay on the homepage.
5. **Demo payment:** a "Pay (demo)" button with no card fields. The real provider is backlog.
6. **Demo video: real Daily calls** on Daily's free plan, with the key saved in the admin app's Daily settings screen (never in code). Without a key, the visit shows a clear "video is off" state.
7. **Geography:** mainland Portugal only. The eligibility question is "Will you be in mainland Portugal during the visit?"
8. **Language:** English for the client demo. Portuguese is a launch requirement.

## Rules that are never broken

These come from `AGENTS.md` and `.cursor/skills/` (read `portugal-telemedicine-constraints`, `imed-clinical-documents` and `daily-video-consultations`).

- **Carevia never generates, stores, mocks or displays prescriptions, CIT (sick-leave certificates), certificates, declarations, test requests or referrals,** not even as demo content or placeholder files. Those exist only in iMED. After a visit, Carevia shows an iMED *status*, never a document.
- **No clinical data in Carevia's database:** no symptoms, diagnoses, medicines, allergies, doses or clinical notes. The patient's own pre-visit questions stay on their device (`localStorage`), never sent to the API.
- **Never promise a document** before the doctor has assessed the patient. Copy says what the doctor *may* decide, never what the patient will receive.
- **Emergency:** "Not an emergency service. In an emergency, call 112." on service details, booking step 1, the waiting room and after the visit.
- **Consent before the visit:** how care is delivered, that in-person care is the alternative, the price, recording off by default, and the 112 limit. Store the accepted text's version and time.
- **Recording is never offered in this build.**
- **A dropped call keeps the same appointment:** reconnect inside the join window, otherwise reschedule. Never create a second appointment.
- **Video privacy:** one private Daily room per confirmed appointment, short-lived tokens issued by the server, no patient name, email, phone or reason in room names, `user_name`, URLs or logs. The doctor's token is owner; the patient's and companion's are not.
- **Demo content is fictional and labelled:**
  - doctor licence numbers stay `DEMO-CEDULA-*`
  - emails use `example.com` or `.test`
  - images of people are illustrative, labelled "Illustrative", and show no real person, institution or logo
- **Demo mode is locked twice.** `DEMO_MODE=true` must be set on the API, *and* the web build must be built with demo mode on. It is off by default. A production build cannot show demo logins or the reset command.
- **No arrow glyphs** (→ ↗ ←) on buttons or links. The client finds them AI-looking.

## Who owns what (to avoid merge conflicts)

Each thread works on its own branch, created from `patient-journey`, and edits only its own paths. If a thread needs a change in another thread's area, it writes the request in its final report instead of making the edit.

| Thread | Branch | Owns | Reads only |
|---|---|---|---|
| **API** | `pj/api` | `apps/api/**`, `apps/admin/**`, `docker-compose.yml`, root `package.json` scripts | `content/patient-journey/**` |
| **Web portal** | `pj/web` | `apps/web/**` (except `apps/web/public/images/**`), root `package.json` workspaces entry for `apps/web` | `src/styles/**`, `build.mjs` (for 04.5 tokens), `v5/src/**`, `content/patient-journey/**` |
| **Homepage** | `pj/homepage` | `build.mjs`, `src/**`, `dist/**` | |
| **Content and images** | `pj/content` | `content/patient-journey/**`, `apps/web/public/images/**` | |

`docs/patient-journey/**` belongs to the orchestrating thread. A thread may add notes to its own report, not to this folder.

## Ports

Several threads run servers at the same time. Use these so they never collide:

| Thread | Postgres | API | Web | Static homepage |
|---|---|---|---|---|
| API | 5432 | 4000 | | |
| Web portal | 5433 | 4001 | 5180 | |
| Homepage | | | | 8085 |
| QA (later) | 5434 | 4002 | 5190 | 8095 |

`apps/api/scripts/db.mjs` must read the Postgres port from `PGPORT` (API thread task A1). The web dev server proxies `/api` to the API, so the browser sees one origin.

## Waves and threads

### Wave 0: orchestrator (done)
Branch created, `backend` merged, this plan and the API contract written.

### Wave 1 and 2: four threads in parallel

**API thread** (`pj/api`), in this order:
1. **A1:** `PGPORT` support in `db.mjs`; install; start the database; existing smoke tests pass.
2. **A2:** Better Auth with the Prisma adapter. It covers:
   - the existing fields (first name, last name, phone, date of birth)
   - roles `patient`, `clinician`, `admin`
   - the 18+ rule on the server
   - the admin login used by `apps/admin`
3. **A3:** Hardening:
   - rate limiting on in every environment
   - leaked-password check (`haveibeenpwned` plugin)
   - email verification and password reset, with a development outbox
   - two-factor login available, and required for clinician and admin accounts outside demo mode
4. **A4:** Schema changes from the API contract:
   - a rolling slot schedule relative to today, in `Europe/Lisbon` time
   - appointment states and holds
   - consent, payment (demo), family members, call events and an access log
   - the link between a clinician login and a doctor profile
5. **A5:** Every endpoint in the API contract, with smoke tests for each.
6. **A6:** Demo seed and demo mode (see the API contract's "Demo data" section).
7. **A7:** Admin app: sign in through Better Auth, an operational appointments list (no clinical data), and Daily settings kept.

**Web portal thread** (`pj/web`):
1. **W1:** Create `apps/web` and the 04.5 design system (tokens, fonts, buttons, fields, stepper, dialogs, and empty, loading and error states).
2. **W2:** An API client typed from the contract, with a mock mode so screens can be built before the API lands.
3. **W3:** Patient screens J1–J12 and the auth screens, following the wireframes and the contract.
4. **W4:** Doctor screens (J13): agenda, visit room as owner, and outcome.
5. **W5:** Demo mode UI: banner, demo logins and the outbox page.
6. **W6:** Switch from mock data to the real API once `pj/api` has landed on `patient-journey`, using the ports above. Then run the full journey end to end.

This thread may use subagents for independent screens once the shell (W1, W2) is committed.

**Homepage thread** (`pj/homepage`):
1. **H1:** `build.mjs` writes Design 04.5 to `dist/index.html`. 04.2 and 04.5 keep their own URLs. Keep the edit small and local: the 04.5 design is still being iterated in other threads.
2. **H2:** Links into the portal, using a `PORTAL_URL` setting that defaults to `/app`:
   - each service-details dialog says "Book [service]" and opens `/app/book?service=<id>` (redirects to the Services v2 doctors for that area)
   - "Find your care" keeps scrolling to the list
   - a "Sign in" link goes to `/app/signin`
   - a "Not sure which one?" card opens `/app/book?service=general` (redirects to Services v2)
3. **H3:** Copy fixes:
   - "free rebook" becomes reconnect, then reschedule
   - "documents saved to your account" becomes "available through iMED"
   - remove anything that promises a prescription, certificate or document
4. **H4:** Rebuild `dist/`, then check the homepage at desktop and phone widths with headless Chrome screenshots.

**Content and images thread** (`pj/content`):
1. **C1:** Draft texts in `content/patient-journey/`, each marked "Draft for legal review": `consent.md`, `emergency.md`, `cancellation.md`, `recording.md` and `demo-banner.md`. Use the exact file names and front matter in the API contract.
2. **C2:** Image audit. Reuse what exists in `src/assets/`. The 220 demo doctors use initials, not photos.
3. **C3:** Generate only what's missing, in the 04.5 style, using the fal.ai pipeline described in `v5/film-src/prompts.md`:
   - one demo-doctor portrait
   - empty-state images (no visits, no family members, video off)
   - a waiting-room still

   Optimise each to WebP at two sizes and put it in `apps/web/public/images/`, with a `manifest.json` (file, alt text, "Illustrative" flag, prompt). If no fal.ai key is available, stop and report. Do not fill gaps with low-quality placeholders.

### Wave 3 and 4: after the API and web branches land
The orchestrator merges each branch into `patient-journey`. A QA thread then:
- runs the demo script end to end in a real browser (mobile and desktop)
- checks accessibility: keyboard use, labels, contrast and reduced motion
- checks the speed of the app pages
- compares screenshots with the wireframes
- updates the wireframe PDF for the revised screen 11, the consent step and the doctor screens

The newest 04.5 design work (branch `c45-hero-wordmark`, still in progress in another thread) is merged by the orchestrator once that design session is finished. It conflicts with this branch in `build.mjs`. Resolve that file by combining both sides, then rebuild `dist/`; never hand-merge generated `dist/` files.

## Backlog (not in this build)
- Audio consultations
- A real payment provider and refunds
- Real email and SMS
- iMED integration
- Admin editing of content, catalog, doctors and schedules
- Passkeys or sign-in by emailed code
- Recording with consent
- Portuguese translation
- VPS deployment, backups and monitoring
- GDPR export and deletion
- Madeira and the Azores

## Launch requirements (never backlog)
- ERS registration
- every doctor's cédula verified
- liability insurance
- data-processing agreements with iMED, Daily, the payment provider and the email/SMS senders
- consent and cancellation text reviewed by a lawyer
- retention periods looked up
- iMED's prescription certification confirmed in writing
- a Portuguese interface

## Definition of done, for every thread
- Typecheck and build pass. The API's smoke tests pass, with new tests for every new endpoint.
- Every screen was looked at in a real browser at 390px and 1280px wide, with a screenshot in the thread's final report.
- No rule above is broken. Check with: `rg -n -i "prescri|certificat|CIT|atestado|referral|diagnos" apps/web/src content` and explain every hit.
- Commits are small, with clear messages, on the thread's own branch. Nothing is pushed, and nothing is merged into `patient-journey`; the orchestrator does that.
- The final report lists:
  - what was built
  - how it was verified, with commands and their output
  - anything skipped
  - requests for other threads
