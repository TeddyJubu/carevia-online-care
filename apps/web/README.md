# Carevia patient portal (`apps/web`)

React 19, Vite 8, Tailwind 4, TypeScript. Served under `/app/`; `/api` is the API on the same origin.
Plan and rules: `docs/patient-journey/PLAN.md`. Endpoints: `docs/patient-journey/API-CONTRACT.md`.

| Command (from `apps/web`) | What it does |
|---|---|
| `npm run dev:mock` | Dev server on http://localhost:5180/app/ with the in-memory mock API and demo UI. No API needed. |
| `npm run dev` | Dev server on 5180, proxying `/api` to `API_URL` (default `http://localhost:4001`). |
| `npm run build` | Typecheck and production build to `dist/`. No mock, no demo logins. |
| `npm run build:demo` | The same with demo mode on. Demo UI still needs `GET /api/demo` (API with `DEMO_MODE=true`). |
| `node scripts/check-time.ts` | Self-check for Lisbon time, DST and age rules. |
| `node scripts/walk-booking.mjs <dir> [width]` | Playwright: books a visit for the demo child, screenshotting each step. |
| `node scripts/walk-visit.mjs <dir> [width]` | Playwright: visit, waiting room (fake camera), call, after-visit and doctor screens. |

Demo accounts (mock and demo API): `patient@example.com` / `demo-password`, `doctor@carevia.test` / `doctor-demo-password`.

Rules the code relies on:
- The patient's questions live in `localStorage` (`carevia-questions-<id>`) and are never sent to the API.
- After a visit Carevia shows an iMED status, never a document.
- Demo mode is locked twice: `VITE_DEMO=1` at build time and `GET /api/demo` at run time.
- Content comes from `content/patient-journey/*.md` at build time; draft notes show in development only.
