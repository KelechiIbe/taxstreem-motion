# TaxStreem Motion

TaxStreem's in-house motion design engine. The team chats with Claude to turn content, product screenshots, voiceovers and music into on-brand motion videos, then refines them in the same chat and exports MP4s in 9:16, 1:1 and 16:9.

Live demo, no sign-in: `/#/demo` on the deployed site.

## How it works

```
chat + screenshots + audio
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

- **Claude directs, templates draw.** Claude never invents pixels. It picks and configures reviewed TaxStreem scene templates (title, statement, stat, screenshot, features, steps, chart, compare, deadline, quote, cta, logo) and can drop in a small custom scene when nothing fits. That keeps every video on-brand and every edit instant.
- **Deterministic `seek(t)` rendering.** Every frame is a pure function of time: closed-form springs, seeded grain, no timers. The same code drives the preview, the review frames and the export, so what you see is what you get.
- **Frame review.** After each new version the browser renders a contact sheet (early/mid/settled frames of every scene and a frame inside every transition) and Claude inspects it for overlaps, cut-offs, illegible text, brand slips and invented claims, then saves fixes as a new version. Toggle it under the Assets panel.
- **Audio as timeline.** ElevenLabs voiceovers come back with word timings (uploaded recordings are transcribed for them); Claude cuts scenes on sentence starts and the renderer burns in karaoke captions. Music gets tempo and beat detection so cuts can land on beats; the voice ducks the music.
- **Truth rules.** The prompt forbids invented statistics, quotes and deadlines; screenshots are evidence.

The approach follows the "automated motion design system" pattern (brief → structured data → scene engine → frame review → render → variants), adapted to TaxStreem's brand and stack.

## Stack

- **Netlify**: static app (Vite + React) and functions in `netlify/functions` (`motion-start`, background `motion-run`, `motion-tts`, `motion-stt`, `motion-voices`, `motion-keys`).
- **Supabase**: shares The Bridge's project (`thebridgepodcast`). Same team logins and roles (`profiles`, `is_member()`, `has_role()`); tables prefixed `motion_`; files in the private `media` bucket under `motion/`. Migration: `supabase/migrations/0001_motion.sql`.
- **Claude**: `claude-opus-5-5` via the Messages API with a forced tool call (override with `MOTION_MODEL`). System prompt: `netlify/functions/_lib/prompts.ts`, built from the template catalog in `src/runtime/catalog.ts`.
- **ElevenLabs**: TTS with timestamps, Scribe for uploaded recordings, voices from The Bridge's cast plus the library.
- **Rendering**: `src/runtime/*` (Canvas 2D in a worker, Mediabunny for MP4/WebM). Inter stands in for Helvetica Neue, which isn't licensed as a webfont.

## Setup

1. Netlify environment (Functions scope): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `APP_SECRET` (48+ random characters).
2. Sign in with a Bridge account, open **Settings**, paste the Anthropic and ElevenLabs keys (admins only). Keys are AES-256-GCM encrypted with `APP_SECRET` before they're stored.
3. Use Chrome or Edge on a laptop/desktop for MP4 export (H.264 + AAC). Browsers without AAC fall back to WebM.

## Working on it

```bash
npm install
npm run dev                      # app at http://localhost:5173 (functions need `netlify dev`)
npm run build
node scripts/render.mjs samples/vat-explainer.json --format 9:16 --asset dash=samples/dashboard.png --sheet sheet.jpg
node scripts/render.mjs samples/vat-explainer.json --format 16:9 --asset dash=samples/dashboard.png --out video.mp4
node scripts/gen-assets.mjs      # regenerate icon + logo paths after changing the icon list
```

`scripts/render.mjs` renders headless with Playwright + FFmpeg using the same runtime (the lab page). It's the path to server-side or batch rendering later (GitHub Actions or Cloud Run).

### Adding a template

1. Write it in `src/runtime/scenes.ts` (a function of `t`; lay out for 9:16, 1:1 and 16:9 using `s.safe` and `s.u`).
2. Register it in `TEMPLATES` and document it in `src/runtime/catalog.ts` (the prompt is built from the catalog).
3. Render a contact sheet in all three formats and look at it before shipping.
