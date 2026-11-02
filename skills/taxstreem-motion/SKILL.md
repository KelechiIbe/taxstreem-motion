---
name: taxstreem-motion
description: Design and render on-brand TaxStreem motion videos from a brief, screenshots and audio, using the TaxStreem Motion scene templates and the seek(t) renderer in this repo.
---

# TaxStreem Motion (Claude Code)

Use this when working in the taxstreem-motion repo to make or check a video without the web app.

1. Read `src/runtime/catalog.ts` for the templates and their props, and `netlify/functions/_lib/prompts.ts` (GENERATE_SYSTEM) for the brand, truth, story, sound and camera rules. Follow them exactly.
2. Write a VideoSpec JSON (shape in `src/runtime/types.ts`; example in `samples/vat-explainer.json`). Screenshot focus/cursor coordinates are fractions of the image measured from its top-left; open the image and box the exact UI element.
3. `npm run build`, then render a contact sheet for each format you'll ship:
   `node scripts/render.mjs spec.json --format 9:16 --asset <id>=<path.png> --sheet sheet.jpg`
4. Look at the sheet. Check story, overlaps and cut-offs, phone-size legibility, brand and facts. Fix the spec and re-render until it's right. Never call a video finished without looking at rendered frames.
5. Render the MP4: `node scripts/render.mjs spec.json --format 9:16 --asset ... --out video.mp4 [--audio mix.wav] [--words words.json]`.

Never invent statistics, quotes or deadlines. TaxStreem is one word with a capital S.
