# Carevia API

Node.js API for accounts, the service catalog, doctor search, video booking, and the Daily API key. It listens on `http://127.0.0.1:4000`.

Clinical documents stay in iMED. This API does not create prescriptions, CIT certificates, test requests, or referrals. Doctor cédulas in the seed are fictional (`DEMO-CEDULA-*`). Recording is off. Room names and meeting tokens do not include the patient’s name, email, or phone.

Audio booking returns `AUDIO_DISABLED`. Video booking creates a confirmed appointment and does not call Daily until a join token is requested. A real launch still needs payment before a visit is confirmed; this demo confirms the video appointment at booking so the portal can continue.

The Daily API key is stored only in Postgres. It is never written to the repo. `GET /api/video/status` returns `{ enabled }` and nothing else. Admin reads return the last four characters, and only when the key is longer than four characters.

## Commands

From the repo root:

```sh
npm install
npm run db
npm run db:setup
npm run dev:api
```

`npm run db` starts embedded Postgres (user `carevia`, password `carevia`, database `carevia`, port `5432`) and keeps it running. Data is stored in `apps/api/data/pg`, which is gitignored. Stop it with Ctrl+C in that terminal.

`npm run db:setup` applies Prisma migrations and seeds the catalog. Run it again only when you want to reset doctors, slots, and the Daily key.

`npm run dev:api` starts the API with `node --watch`. `npm run start --prefix apps/api` starts it once.

`docker compose up -d` is the Docker alternative. Do not run it while embedded Postgres is using port 5432. Copy `apps/api/.env.example` to `apps/api/.env` if that file is missing. Both use:

```
DATABASE_URL=postgresql://carevia:carevia@127.0.0.1:5432/carevia
```

Portal and admin dev scripts are `npm run dev:portal` and `npm run dev:admin`. Those apps are not part of this package.

Check the running API with:

```sh
npm run smoke --prefix apps/api
```

## Demo logins

Patient: Demo Patient, born 1990-01-01, `patient@example.com`, `+00 000 000 000`, password `demo-password`.

Admin: `admin@carevia.test`, password `admin-demo-password`, role `admin`.

`POST /api/auth/login` returns `role`. `POST /api/admin/login` is the same login and rejects anyone who is not an admin.

## HTTP

Passwords are stored as bcrypt hashes (`bcryptjs`, the pure JavaScript implementation).

Session cookie: `carevia_session`, httpOnly, SameSite `lax`, path `/`. Browsers on `http://localhost:5173` and `http://localhost:5174` can send it (`credentials: 'include'`).

- `POST /api/auth/register` with `firstName`, `lastName`, `email`, `phone`, `dateOfBirth`, `password`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/services`
- `GET /api/doctors` with `q`, `language`, `specialty`, `maxFee`, `availability` (`any` or `0`/`1`/`2`), `service`, `group`
- `GET /api/doctors/:id` and `GET /api/doctors/:id/slots`
- `POST /api/appointments` with `doctorId`, `service`, `slot`, `channel`
- `GET /api/video/status`
- `POST /api/appointments/:id/video-token`
- `GET /api/admin/daily` and `PUT /api/admin/daily` with `{ "apiKey": "" }` to clear the key

Booking without a session returns `401` `{ "error": "AUTH_REQUIRED", "message": "Log in or register to book a consultation" }`. `channel: "audio"` returns `400` `{ "error": "AUDIO_DISABLED" }`. A video token with no key returns `409` `{ "error": "VIDEO_DISABLED" }`. A Daily failure returns `502` and the process keeps running.
