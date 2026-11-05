# Carevia

A responsive Carevia marketing site in three designs: Design 03 (olive with Geist Serif headings), Design 04.2 (deep-blue editorial) and Design 04.5 (04.2 with the night film hero, the homepage). `dist/index.html` is Design 04.5; the others keep their own URLs (`design-03.html`, `design-04-2.html`, `design-04-5.html`). It keeps the Alder-inspired glass animation on Design 03. The glass animation uses the reference's horizontal-refraction geometry, with pointer tracking, gentle idle movement and touch-friendly clearing.

## Edit and run

- Copy: `src/content.mjs`, `src/design-03.html` and `src/design-04-2.html`
- Layout, spacing and responsive rules: `src/styles/site.css`
- UI interactions: `src/scripts/site.js`
- Glass animation: `src/scripts/glass.js`
- Photographs: `src/assets/`

Build with `node build.mjs`. Preview with `python3 -m http.server 8085 --directory dist`.

## Links into the patient portal

Design 04.5 links into the patient portal (`apps/web`, served under `/app/`): "Sign in" in the nav, "Book {service}" in each service's details, "Not sure which one?" beside the care list, and "Create your account". The portal's base URL is one setting, `PORTAL_URL`, read when you build. It defaults to `/app`, for when the portal is served from the same host as the homepage.

For local development, where the portal runs on its own port, build with its full URL:

```sh
PORTAL_URL=http://localhost:5180/app node build.mjs
```

No package install is needed to build or run the site. The output in `dist/` is ready for static hosting. `.openai/hosting.json` preserves the existing Sites project.

## v5 (local, React)

`v5/` is a separate React + Vite + Tailwind + TypeScript + shadcn/ui page with a cinematic film hero. It reads copy and prices from `src/content.mjs` and `src/services-04-2.mjs`, so those stay the single source. Run it with `cd v5 && npm install && npm run dev`. The films and their prompts are in `v5/public/film/` and `v5/film-src/`. `node build.mjs` doesn't touch v5.

## Content and behaviour

Service descriptions and example prices follow the supplied Carevia website. The expanded editorial copy describes the experience and preparation for a visit; it does not fabricate reviews, clinician identities, credentials, or treatment outcomes. Doctor portraits are illustrative and labelled accordingly.

Pricing, care-detail dialogs, reading dialogs, account tabs, the mobile menu, theme switching, and FAQs are browser interactions. This presentation site does not process medical data, payments or bookings; Design 04.5 hands booking and sign-in to the portal. Design 03's and 04.2's external Carevia links open the existing Carevia site, and on 04.5 only "Visit Carevia" does.

Motion respects the operating system's reduced-motion setting. Images have responsive sizes. The page content is available in the initial HTML.
