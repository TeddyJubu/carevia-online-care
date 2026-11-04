## Learned User Preferences

- Keep customer-facing frontend work on `main` and backend work (API, database, and admin) on `backend`. Sync by merging the branch that moved into the one being worked on.
- Build the real customer portal UI on `main`. On `backend`, build the admin panel, the API, and a temporary wireframe test portal that calls the same API and is replaced by the `main` UI later.
- Save the Daily API key only from the admin Daily settings screen, on the server. Video stays off until a key is saved. Use Daily’s free plan for testing and swap the key in that screen for a paid plan later. Never put a real Daily key in source.
- Make customer-portal content editable from the admin portal, including pages, catalog, doctors, schedules, and booking copy, instead of hardcoding it in React.
- Use the shared patient-booking wireframe as the visit flow, and add consultation type (video or audio) as the choice that selects the rest of the flow. Finish the video path before audio calling or sending patients to iMED.
- Treat the wireframe and DrOnline as references the real product will diverge from. Portuguese healthcare constraints and iMED win when they conflict.

## Learned Workspace Facts

- Carevia is a private online doctor consultation service for patients in Portugal. This repo’s marketing site is a static build (`build.mjs` fills HTML from `src/content.mjs` and writes `dist/`). On `backend`, the product apps are `apps/api` (Node.js, Fastify, Prisma, PostgreSQL, httpOnly session cookies), `apps/admin`, and `apps/portal`.
- Demo services, doctors, and slots on `backend` are seeded from the patient-booking wireframe, including its service groups.
- PostgreSQL stores operational data only: accounts, consent, services, prices, appointments, payments, and call state. The clinical chart, prescriptions, test requests, certificates, and CIT stay in iMED (https://imed.pt/imed/home). Carevia must not generate those documents.
- Video visits use Daily (https://www.daily.co/products/video-sdk/): a private room per appointment and short-lived tokens from the server, with no patient identifiers in room names or logs. Audio visits are outbound cellular calls to the patient’s confirmed mobile. Do not assume Daily dial-out already places `+351` calls.
- DrOnline (https://dronline.pt/) is the market example for service menu and booking shape: choose a priced service, pick a time, pay, then join in the browser. It is not a source of clinical promises or visual design.
- Patient registration collects first name, last name, email, phone, date of birth, and password. Sex and Número de Utente belong on the profile before an iMED sync, not on the first signup form. Do not collect NIF, identity-document number, or full address at registration.
- A visit is confirmed only after payment. Video then follows intake, device check, waiting room, and the Daily call. Audio is stored on the appointment and waits. Recording stays off unless the patient gives separate consent. A dropped call keeps the same appointment open.
- The initial patient-flow wireframe is `/Users/tamannajuthi/Documents/ChatGPT/Online Doctor platform/patient-booking-wireframe-before-portugal.html`.
- Planning skills for this product live in `.cursor/skills/`: `portugal-telemedicine-constraints`, `dronline-product-reference`, `imed-clinical-documents`, `daily-video-consultations`, and `cellular-audio-consultations`.
