# TaxStreem Motion: notes for Claude

- Rendering must stay deterministic: every frame a pure function of `t` (no `Math.random`, `Date`, timers, or state carried between frames). Use `spring`, `springSteps`, `tween`, `rng(seed)` from `src/runtime/lib.ts`.
- Templates live in `src/runtime/scenes.ts`; each must lay out for 9:16, 1:1 and 16:9 using `s.safe` and `s.u`. The prompt is generated from `src/runtime/catalog.ts`, so document every template and prop there.
- Brand rules are in `src/runtime/draw.ts` (palettes, logo, mark, pill, backgrounds) and in the system prompt (`netlify/functions/_lib/prompts.ts`). TaxStreem is one word with a capital S; tiny palette; calm motion; no emoji.
- After changing a template, render contact sheets in all three formats with `scripts/render.mjs` and inspect them before committing.
- Supabase is shared with The Bridge: only touch `motion_*` tables and `media/motion/` storage. Functions act as the signed-in user (no service key), so RLS applies.
- No StrictMode: the preview canvas is transferred to the worker once.
