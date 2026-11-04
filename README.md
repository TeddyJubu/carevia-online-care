# Carevia

A responsive Carevia marketing site in two designs: Design 03 (olive with Geist Serif headings) and Design 04.2 (deep-blue editorial, the homepage). It keeps the Alder-inspired glass animation on Design 03. The glass animation uses the reference's horizontal-refraction geometry, with pointer tracking, gentle idle movement and touch-friendly clearing.

## Edit and run

- Copy: `src/content.mjs`, `src/design-03.html` and `src/design-04-2.html`
- Layout, spacing and responsive rules: `src/styles/site.css`
- UI interactions: `src/scripts/site.js`
- Glass animation: `src/scripts/glass.js`
- Photographs: `src/assets/`

Build with `node build.mjs`. Preview with `python3 -m http.server 8085 --directory dist`.

No package install is needed to build or run the site. The output in `dist/` is ready for static hosting. `.openai/hosting.json` preserves the existing Sites project.

## v5 (local, React)

`v5/` is a separate React + Vite + Tailwind + TypeScript + shadcn/ui page with a cinematic film hero. It reads copy and prices from `src/content.mjs` and `src/services-04-2.mjs`, so those stay the single source. Run it with `cd v5 && npm install && npm run dev`. The films and their prompts are in `v5/public/film/` and `v5/film-src/`. `node build.mjs` doesn't touch v5.

## Content and behaviour

Service descriptions and example prices follow the supplied Carevia website. The expanded editorial copy describes the experience and preparation for a visit; it does not fabricate reviews, clinician identities, credentials, or treatment outcomes. Doctor portraits are illustrative and labelled accordingly.

Pricing, care-detail dialogs, reading dialogs, account tabs, the mobile menu, theme switching, and FAQs are browser interactions. This presentation site does not process medical data, payments or bookings. Its external Carevia links open the existing Carevia site.

Motion respects the operating system's reduced-motion setting. Images have responsive sizes. The page content is available in the initial HTML.
