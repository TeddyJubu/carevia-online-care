# Patient portal images: audit and prompts

Generated on fal.ai on 5 November 2026, in the same world as the v5 films (see `v5/film-src/prompts.md`). Every image was checked at full size before it was kept. Output is in `apps/web/public/images/` as WebP at 480 and 960 px wide; `manifest.json` there lists each file (`{w}` in `file` is the width), its alt text, the "Illustrative" flag, the prompt and the model.

## Audit of `src/assets/` (what the portal can reuse)

- **Reuse:** `film/night.webp` and `film/morning.webp` (the 04.5 film posters), and the service photos `freedom`, `sky`, `field` and `sea` (480/960/1600 JPEGs), which 04.5 already uses for General, Mental health, Nutrition and Specialist. `premium-blue/mental-health` and `premium-blue/weight-management` are also safe.
- **Homepage only:** `clinician-45-1..3`. They are the homepage's clinicians, so they are not reused as named demo doctors.
- **Don't use in the portal:**
  - `doctor-1/3/4` show ID badges and lanyards.
  - `banner-care/warm` show EU flags and badges.
  - `visit-plan` shows a crest on a white coat.
  - `hero-telecare` and `hero-search-poster` show a search-engine bar and logo.
  - `clinician-1..3` are older stock-style portraits.
  - `care42-*` and `premium-blue/certificates-assessments`, `test-requests-renewals`, `general-urgent-care`, `specialist-care` and `treatments` show paperwork, pill bottles, sample tubes, screens or examinations.
- The 220 demo doctors use initials. Only Dr Emma Laurent (doctor id 0) has a portrait, and it is labelled "Illustrative".

## Dr Emma Laurent (illustrative, fictional) — `doctor-emma-laurent`

`bytedance/seedream/v5/pro/text-to-image`, 1536×2048, then cropped to 1440×1920 to remove a sliver of desk clutter at the bottom-left edge.

> Cinematic 35mm film still, waist-up portrait of a fictional woman general practitioner in her early forties with an ordinary, kind face, calm warm expression and a gentle closed-mouth smile, looking softly toward the camera. Shoulder-length light brown hair loosely tied back, minimal makeup. She wears a deep navy fine-knit cardigan over an off-white linen shirt; no white coat, no stethoscope, no badge, no lanyard, no jewellery with text. She sits at a simple oak desk in a calm Lisbon apartment study in soft early morning light. Behind her, out of focus, a tall window with sheer white linen curtains and pale terracotta rooftops. Off-white walls, deep navy accents, natural fabric textures, shallow depth of field, soft window light on her face, fine film grain, muted palette of navy, oatmeal and warm ivory, photorealistic, natural skin texture. No text, no logos, no name badge, no documents, no screens, no medicine.

## No upcoming visits — `empty-no-visits`

`bytedance/seedream/v5/pro/text-to-image`, 2304×1536.

> Cinematic 35mm film still, a quiet corner of a calm Lisbon apartment in soft early morning light. A low linen armchair with an oatmeal wool blanket folded over its arm, and beside it a small round oak side table holding a pale ceramic cup and a single olive sprig in a clear glass of water. Sheer white linen curtains glow in a tall window, pale terracotta rooftops softly blurred outside. Wide calm negative space on the left, off-white plaster walls, deep navy shadows, gentle warm light, natural fabric textures, fine film grain, muted palette of navy, oatmeal and warm ivory, photorealistic. No people, no text, no logos, no screens, no paper, no books, no medicine.

## No family members — `empty-no-family`

`bytedance/seedream/v5/pro/text-to-image`, 2304×1536.

> Cinematic 35mm film still, the entryway of a calm Lisbon apartment in soft morning light. A row of five simple oak wall pegs above a low oak bench: a single deep navy wool coat hangs on one peg and the other pegs are empty. On the bench, an oatmeal wool scarf neatly folded beside a small woven basket. Off-white plaster wall, warm sunlight falling across it from a window out of frame, long soft shadows, wide calm negative space, natural textures, fine film grain, muted palette of navy, oatmeal and warm ivory, photorealistic. No people, no text, no logos, no screens, no paper, no medicine.

## Video is off — `empty-video-off`

`bytedance/seedream/v5/pro/text-to-image`, 2304×1536. The first result had a logo-like mark on the laptop lid, so it was passed through `bytedance/seedream/v5/pro/edit` with the second prompt.

> Cinematic 35mm film still, a simple oak desk by a tall window in a calm Lisbon apartment at blue hour. On the desk, a closed silver laptop with its lid shut, a small brass desk lamp switched off, and a ceramic cup. Sheer white linen curtains, outside a deep cobalt dusk sky over terracotta rooftops with a few warm lit windows. Deep navy shadows, cool quiet light, wide calm negative space above the desk, natural textures, fine film grain, muted navy and soft amber palette, photorealistic. No people, no text, no logos, no open screens, no paper, no medicine.

Edit:

> Same image, same camera angle and exact same composition and lighting. The closed laptop lid is completely plain, smooth brushed aluminium with no logo, no emblem and no marks of any kind. Everything else stays identical. Photorealistic, cinematic 35mm film grain, no text, no logos.

## Waiting room — `waiting-room`

`bytedance/seedream/v5/pro/edit`, 2560×1440, with `v5/film-src/night-keyframe.jpg` as the reference, so it is the hero film's room a few minutes before a visit.

> Same room, same camera angle and exact same composition, a few minutes before a video consultation at blue hour. The low linen sofa by the window is empty: the oatmeal wool blanket is draped loosely over the cushions, and a ceramic cup of tea with a thin wisp of steam rests on the window seat. There is no laptop and no screen. The small brass lamp still casts a warm amber pool of light on the left, the sheer linen curtains hang still, and outside the cobalt dusk sky over terracotta rooftops is calm. Quiet, expectant, reassuring mood, same cinematic 35mm film grain, deep navy shadows, photorealistic, no text, no logos, no people.
