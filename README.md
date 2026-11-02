# TaxStreem Motion

TaxStreem's in-house motion design engine. The team shares an idea and its context; Claude writes an editable script; once it's approved, Claude builds the video from it in the chosen style, using product screenshots, screen recordings, photos, footage, stock, AI images, voiceovers and music. The team refines it in the same chat and exports MP4s in 9:16, 1:1 and 16:9.

Live demo, no sign-in: `/#/demo` on the deployed site.

## How it works

```
idea + context (+ sample to replicate)
        │
        ▼
editable script (voiceover · words on screen · visual · seconds)  ── team edits, approves
        │
chat + screenshots + clips + audio
        │
        ▼
Claude Opus 5.5  ──writes──▶  VideoSpec (JSON: scenes, text, timings, camera, audio)
        ▲                              │
        │                              ▼
  frame review  ◀── contact sheet ── seek(t) renderer (Canvas, in a Web Worker)
  (fixes, new version)                 │
                                       ▼
                         live preview · MP4 export (WebCodecs)
```

- **Script first.** New videos start in Script mode. Claude turns the idea into scenes the team can edit line by line (voiceover, on-screen words, visual direction, timing, media). "Make voiceover from script" sends the VO lines to ElevenLabs. "Approve and build" makes the video from the script, keeping its words verbatim.
- **Claude directs, templates draw.** Claude never invents pixels. It picks and configures reviewed scene templates (title, statement, stat, screenshot, features, steps, chart, compare, deadline, quote, cta, logo, and for photos, clips and product moments: media, split, collage, icons, kinetic, ui) and can drop in a small custom scene when nothing fits.
- **Styles.** Ten looks change fonts, backgrounds, card surfaces, how words enter, spring feel, transitions and cursor: TaxStreem Calm, Corporate Clean, Punchy Kinetic, Glass SaaS Launch, Neon Dark AI, Keynote Black, Bold Campaign, Editorial Serif, Playful Animated and Minimal Mono (`src/runtime/looks.ts`). Colours stay TaxStreem's unless the team picks the look's own colourway or custom colours.
- **Media.** Images and video clips play inside scenes (decoded with WebCodecs, frame-exact in preview and export), screenshots can be screen recordings, product frames can tilt in 3D, and clip sound can be mixed in. Stock comes from Envato Elements: the studio searches it through Envato's official catalogue service (`motion-envato`), and scripts can ask for `envato:` files that show up as "Find on Envato" buttons. Envato has no download API and its licence asks for each download to be registered to a project, so a person downloads each item on Envato and adds the file; its Envato link is kept with it. Pexels still works when a key is set (`stock:` requests are fetched automatically). AI images come from ElevenLabs (`generate:` requests or the AI image picker).
- **Samples.** Upload a motion design you like and ask Claude to replicate or tweak it: the browser finds its cuts, shot lengths, tempo and main colours and sends Claude a labelled frame sheet. YouTube links in the chat give Claude the title and thumbnail only (videos are never downloaded).
- **Deterministic `seek(t)` rendering.** Every frame is a pure function of time: closed-form springs, seeded grain, no timers. The same code drives the preview, the review frames and the export, so what you see is what you get.
- **Frame review.** After each new version the browser renders a contact sheet (early/mid/settled frames of every scene and a frame inside every transition) and Claude inspects it for overlaps, cut-offs, illegible text, brand slips and invented claims, then saves fixes as a new version. Toggle it under the Assets panel.
- **Audio as timeline.** ElevenLabs voiceovers come back with word timings (uploaded recordings are transcribed for them); Claude cuts scenes on sentence starts and the renderer burns in karaoke captions. Music gets tempo and beat detection so cuts can land on beats; the voice ducks the music.
- **Truth rules.** The prompt forbids invented statistics, quotes and deadlines; screenshots are evidence.

The approach follows the "automated motion design system" pattern (brief → structured data → scene engine → frame review → render → variants), adapted to TaxStreem's brand and stack.

## Stack

- **Netlify**: static app (Vite + React) and functions in `netlify/functions` (`motion-start`, background `motion-run` for scripts, videos, reviews, stock imports and AI images, `motion-stock`, `motion-envato`, `motion-tts`, `motion-stt`, `motion-voices`, `motion-keys`). Merging to `main` deploys automatically; pull requests get deploy previews.
- **Supabase**: shares The Bridge's project (`thebridgepodcast`). Same team logins and roles (`profiles`, `is_member()`, `has_role()`); tables prefixed `motion_`; files in the private `media` bucket under `motion/`. Migrations: `supabase/migrations/0001_motion.sql`, `0002_motion_v2.sql`.
- **Claude**: `claude-opus-5-5` via the Messages API with a tool call for every answer (override with `MOTION_MODEL`). System prompt: `netlify/functions/_lib/prompts.ts`, built from the template catalog in `src/runtime/catalog.ts`.
- **ElevenLabs**: TTS with timestamps, Scribe for uploaded recordings, voices from The Bridge's cast plus the library, and image generation (the key needs the Image & Video permission; override the model with `MOTION_IMAGE_MODEL`).
- **Envato Elements**: catalogue search through `https://mcp.envato.com/mcp` (no key needed); downloads and licences stay on Envato.
- **Pexels** (optional): free stock photos and clips (200 searches an hour). Credit is stored with each file.
- **Rendering**: `src/runtime/*` (Canvas 2D in a worker, Mediabunny for MP4/WebM). Inter stands in for Helvetica Neue, which isn't licensed as a webfont.

## Setup

1. Netlify environment (Functions scope): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `APP_SECRET` (48+ random characters; the same value in production and deploy previews).
2. Sign in with a Bridge account, open **Settings**, paste the Anthropic, ElevenLabs and Pexels keys (admins only). Keys are AES-256-GCM encrypted with `APP_SECRET` before they're stored.
3. Use Chrome or Edge on a laptop/desktop for MP4 export (H.264 + AAC). Browsers without AAC fall back to WebM.

## Working on it

```bash
npm install
npm run dev                      # app at http://localhost:5173 (functions need `netlify dev`)
npm run build
node scripts/render.mjs samples/vat-explainer.json --format 9:16 --asset dash=samples/dashboard.png --sheet sheet.jpg
node scripts/render.mjs samples/vat-explainer.json --format 16:9 --asset dash=samples/dashboard.png --out video.mp4
node scripts/render.mjs samples/all-templates.json --look editorial --palette look --asset dash=samples/dashboard.png --sheet looks.jpg --at 0.9
node scripts/render.mjs samples/media-templates.json --asset clip=footage.webm --asset photo1=a.jpg ... --sheet media.jpg
node scripts/gen-assets.mjs      # regenerate icon + logo paths after changing the icon list
```

`scripts/render.mjs` renders headless with Playwright + FFmpeg using the same runtime (the lab page). It's the path to server-side or batch rendering later (GitHub Actions or Cloud Run).

### Adding a template

1. Write it in `src/runtime/scenes.ts` (a function of `t`; lay out for 9:16, 1:1 and 16:9 using `s.safe` and `s.u`; take colours from `c.pal`, fonts through `D.text`/`D.layoutText` roles, and motion from `sp()` so every look applies).
2. Register it in `TEMPLATES` and document it in `src/runtime/catalog.ts` (the prompt is built from the catalog).
3. Render a contact sheet in all three formats and look at it before shipping.
