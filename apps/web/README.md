# Carevia patient portal (`apps/web`)

React 19, Vite 8, Tailwind 4, TypeScript. Served under `/app/`; `/api` is the API on the same origin.
Plan and rules: `docs/patient-journey/PLAN.md`. Endpoints: `docs/patient-journey/API-CONTRACT.md`.

| Command (from `apps/web`) | What it does |
|---|---|
| `npm run dev:mock` | Dev server on http://localhost:5180/app/ with the in-memory mock API and demo UI. No API needed. |
| `npm run dev` | Dev server on 5180, proxying `/api` to `API_URL` (default `http://127.0.0.1:4001`; the API binds IPv4). |
| `npm run build` | Typecheck and production build to `dist/`. No mock, no demo logins. |
| `npm run build:demo` | The same with demo mode on. Demo UI still needs `GET /api/demo` (API with `DEMO_MODE=true`). |
| `node scripts/check-time.ts` | Self-check for Lisbon time, DST and age rules. |
| `node scripts/walk-booking.mjs <dir> [width]` | Playwright: books a visit for a child, screenshotting each step. `SIGNUP=1` signs up a new account and adds a new child. |
| `node scripts/walk-visit.mjs <dir> [width]` | Playwright: visit, waiting room (fake camera), call, after-visit and doctor screens. Against the real API it reads ids and moves today's demo visit into the join window; set `MOCK=1` for the mock. |
| `node scripts/walk-reschedule.mjs <dir> [width]` | Playwright: change a visit's time; with `DROPPED_ID`, the dropped-call screen. |

Every walk (and `a11y.mjs`, `shot.mjs`) runs local Chromium by default. With `BROWSERBASE=1` and `BROWSERBASE_API_KEY` set, it runs in a Browserbase cloud browser in Frankfurt instead and prints a replay link to share. Point it at production with `BASE_URL=https://carevia.claudemod.tech`. The fake-camera flags only apply locally. Example: `BROWSERBASE=1 BASE_URL=https://carevia.claudemod.tech node scripts/walk-edges.mjs out 390`.

Against the real API: start it with `PUBLIC_APP_URL=http://localhost:5180` (see `apps/api/README.md`), run `npm run dev`, and open `http://localhost:5180/app/` (not 127.0.0.1: the API's origin check).

Demo accounts (mock and demo API): `patient@example.com` / `demo-password`, `doctor@carevia.test` / `doctor-demo-password`.

Rules the code relies on:
- The patient's questions live in `localStorage` (`carevia-questions-<id>`) and are never sent to the API.
- After a visit Carevia shows an iMED status, never a document.
- Demo mode is locked twice: `VITE_DEMO=1` at build time and `GET /api/demo` at run time.
- Content comes from `content/patient-journey/*.md` at build time; draft notes show in development only.
