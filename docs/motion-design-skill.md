# TaxStreem Motion: motion-design skill

This is what the studio's Claude follows when it writes scripts and builds videos, distilled from a frame-by-frame study of eleven launch videos the team chose as references: Modus (SaaS demo), Numtera (AI SaaS launch), Google Vids, iBanPay by iBanFirst, Lovio, Gemini Canvas, Apple Creator Studio, a Hyperliquid hype video, the LemFi rebrand film, ConversBank and LangEase. The condensed version lives in `netlify/functions/_lib/prompts.ts` (the MOTION section) and the templates in `src/runtime/blueprints.ts`.

## Principles

1. **Continuity over cuts.** Most references hold one continuous shot for 8-30 seconds. The next beat grows out of the current one: a shape swells into it, the camera dives through a detail, a card lifts out of a grid, a button morphs into a progress ring. Hard cuts are for montages and music hits (the hype video cuts on every beat, about once a second).
2. **Type is the main actor.** One idea per beat, 1-6 words, landing word by word with a little blur. The key word takes the accent colour. Objects live inside sentences (a button chip, an icon, a document, the logo). Words swap in place, brackets frame and squeeze a payoff, a selection sweeps the answer, letters assemble from fragments.
3. **The camera lives on details.** Open extremely close on the one element that matters, act on it (a click, typing), then pull back to show the context. UI panels lean in 3D and settle flat when they matter.
4. **States, not screens.** Show change happening in place: spinners turning into ticks, a pressed button becoming a pill, a ring and a tick; a document scanned and its fields lit; numbers counting.
5. **Rhythm.** Type and montage beats of 0.6-1.5s, product moments of 3-6s. Quick entrances (0.35-0.7s, fast-out-slow-in, a touch of blur), calm holds, exits faster than entrances.
6. **Restraint.** One ground and one accent per video, gradient glows instead of flat fills, at most one dark/light flip, never more than two lines of type at once.
7. **Land on the brand.** The mark swells, draws or assembles; wordmark; a CTA pill with the URL.

## Vocabulary: move → how the engine does it

| Move (seen in) | In a TaxStreem Motion spec |
| --- | --- |
| Word-by-word sentence, line re-centres (Modus, Google Vids) | `sentence` mode `build`; `*word*` for the accent; `sparkles: true` |
| Phrase lands big and drifts away (Modus) | `sentence` mode `dolly` |
| UI chip inside the sentence, last word rotating (Google Vids) | `sentence` mode `rotate`, `{chip:+ File}`, `words: [...]` |
| Typewriter with tall caret (Google Vids, iBanPay, Numtera) | `sentence` mode `type` |
| Line slides left as words arrive (iBanPay) | `sentence` mode `scroll` |
| Brackets frame then squeeze the payoff (Numtera) | `sentence` mode `brackets`, `squeeze: true` |
| Selection highlight on the answer (Numtera, Apple) | `sentence` mode `select` |
| Letters fly together from fragments (Gemini, Apple) | `sentence` mode `assemble` |
| Stacked manifesto lines (LemFi) | `sentence` mode `stack` |
| Type acting out its verb (Apple) | `verbs` with effects stamp, scan, glow, bounce, select, write, drop, glitch, strike, dissolve, count, type |
| Document spins in mid-sentence, scan brackets, fields lit (iBanPay) | `doc` with `before`, `after`, `fields`, `values` |
| Spinners resolving to ticks (iBanPay, Numtera) | `ui` kind `status` |
| Button → pill → ring → tick (iBanPay) | `ui` kind `success` |
| Macro on a detail then pull back (Google Vids, Numtera) | `open: {x, y, zoom}` on any scene; `macro: {x, y, w, h}` on screenshots |
| Push into a detail and through to the next scene | `close: {...}` plus transition `through` |
| Tilted wall of screens (ConversBank) | `wall` layout `wall` |
| Filmstrip with brackets and swapping label (Lovio, Gemini) | `wall` layout `carousel` |
| Mosaic, one card lifts to fill the frame (Lovio, Google Vids) | `wall` layout `mosaic` |
| Phone hero with UI floating round it (ConversBank, LangEase) | `hero` with `chips` |
| Star swell / brand-mark swell (iBanPay, LangEase, Gemini) | transitions `star`, `mark` |
| Brand shapes sweeping (LemFi) | transition `stack` |
| Gradient circles sweeping (Google Vids) | transition `blob` |
| Motion-blurred whip (iBanPay, LemFi) | transition `whip` |
| Black-and-white footage, small mixed type (Hyperliquid) | `media` with `grade: "mono"`, small centred headline, editorial look |

## Templates

### Product Story (`product-story`)

White page, one blue accent: sentences land word by word and the camera lives on your product. Modelled on Modus, Numtera, Google Vids. Best for: Explaining a feature or the whole product on LinkedIn, YouTube or the website. 30-50s, 16:9, look `taxstreem`. Light throughout; one dark interstitial (theme dark) for the turning-point line. Music: Calm modern electronic, 100-115 BPM, light percussion. Needs: 3-5 product screenshots (or screen recordings). No footage needed.

1. **Hook** (3-4s): sentence, mode dolly or build: a question in 2 phrases, the key word in *accent*, sparkles on. ("What if your *VAT*" / "filed *itself*?")
2. **Problem** (3s): sentence, mode select on a three-beat line ("Manual. Late. *Risky.*") or icons row of file icons with a short caption.
3. **Meet** (2.5-3s): sentence, mode rotate: "Meet your {chip:+ File} *accountant*" with words [bookkeeper, tax team]; transition star into it.
4. **Product moment 1** (4-6s): screenshot with props.open {x, y, zoom 2.6} on the element that matters, cursor click on it, then 1-2 focus regions with labels; tilt back settling flat; kicker + title above.
5. **Product moment 2** (4-5s): ui (prompt, toggles or notifications) or a second screenshot with macro; end with close {zoom 1.6} and the next transition through.
6. **Turn** (2.5-3s): sentence, mode type on theme dark: the shift in one line ("Now it files *itself*.").
7. **Proof** (3s): stat counting up or chart; one number only, in the accent.
8. **Payoff** (3s): sentence, mode brackets: setup line, then the payoff in *accent* framed by brackets that squeeze away (squeeze true).
9. **Close** (3s): cta with the logo and URL, or sentence type "Try TaxStreem {logo} today".

Transitions: Mostly through (with a close camera on the outgoing scene) and push; one star at the reveal; no fades. Avoid: more than one idea per beat; full-screen text paragraphs; fade transitions; more than one accent colour.

### Fintech Flow (`fintech-flow`)

A workflow end to end: dark open, a document scanned, checks ticking, a payment or return confirmed. Modelled on iBanPay by iBanFirst. Best for: Showing a process from start to finish: receipts to VAT, payroll to PAYE, invoice to payment. 30-45s, 16:9, look `glass`. First third dark (the problem), a star transition flips to light for the solution, light to the end. Music: Polished electronic, 105-120 BPM, a lift when the scene turns light. Needs: 1-3 screenshots of the flow; a real receipt or invoice photo is a bonus (otherwise one is drawn).

1. **Pain** (3-4s): sentence, mode type on theme dark: the manual pain as a question ("Still typing *invoices* into Excel?").
2. **Brand** (2.5s): title or cta with the logo and a small "AI-powered" pill; transition whip into it.
3. **Action** (3-4s): ui button or prompt (the first click) with open {zoom 2.4} on the button, or sentence mode scroll ("Snap one receipt" / "or a thousand").
4. **Read** (5-6s): doc: before "It reads", after "every receipt", values [vendor, VAT, total]; uploaded document image if there is one.
5. **Turn** (2.5s): transition star into a light scene: sentence build "Time for a quick {icon:sparkles} *check*".
6. **Review** (4-5s): screenshot tilt back with macro on the figure that matters, cursor click, focus label.
7. **Approve** (4-4.5s): ui status: 3 rows (reading, working out, filing) with spinners turning into ticks; heading/right column labels.
8. **Done** (4.5s): ui success: "File return" → "Filing…" → ring → tick → "Return filed" with a small receipt pill.
9. **Outro** (3s): sentence build "Save time. *Avoid errors.*" then transition mark into cta with logo and URL.

Transitions: whip into the brand, star for the dark-to-light turn, through between product beats, mark into the CTA. Avoid: more than 3 status rows; light scenes before the turn; stacking two document scenes.

### Dark Launch (`dark-launch`)

Deep navy with glow: letters assemble, glass screens float in depth, a showcase carousel, a big reveal. Modelled on Gemini Canvas, Lovio. Best for: Launching an AI feature or a big new product moment. 30-60s, 16:9, look `neon`. Dark throughout. Music: Cinematic electronic, slow build 90-110 BPM, a hit at the reveal. Needs: 3-6 screenshots of the feature (dark mode if you have it).

1. **Spark** (2.5s): sentence, mode assemble: the brand or feature name flies together from fragments.
2. **Promise** (3s): sentence, mode dolly: one line with the key word in *accent* ("Your taxes, *reimagined*").
3. **Reveal** (4-5s): hero (browser or laptop) with the main screenshot, tilt right, 2-3 chips floating; transition star.
4. **Prompt** (3.5s): ui prompt typing a real request ("File my November VAT") with tilt back.
5. **Show** (4-5s): wall carousel of 3-5 screenshots, each with a one-word label (VAT, PAYE, WHT, CIT).
6. **Depth** (4-5s): screenshot with open camera on the result, focus labels, tilt back.
7. **Statement** (3s): sentence, mode brackets with the payoff in accent.
8. **Close** (3s): cta with logo; transition mark.

Transitions: star at the reveal, through between product scenes, mark into the close; never push or wipe. Avoid: light themes; busy backgrounds behind text; more than 2 lines on screen.

### Verb Reel (`verb-reel`)

Black screen, music-led: every short phrase moves the way it means. File it. Track it. Relax. Modelled on Apple Creator Studio. Best for: 15-30s social ads and launch teasers; strong with a punchy track. 15-30s, 9:16, look `keynote`. Dark throughout. Music: Upbeat, 110-128 BPM; phrases land on beats (one every 2 beats). Needs: Optional: 2-4 screenshots for quick flashes. A music track from Envato.

1. **Open** (1.5-2s): sentence, mode assemble: "TaxStreem" or the offer name.
2. **Promise** (2s): sentence, mode build: "One app. *Every tax.*".
3. **Verbs 1** (3-4s): verbs: 3-4 items of 1-3 words with effects that mean them (Track it. scan / File it. stamp / Pay it. count).
4. **Flash** (1.5-2s): hero or wall with a screenshot, fast (transition cut).
5. **Verbs 2** (3-4s): verbs: 3-4 more (Remind me. type / Scrap the spreadsheets. drop / Relax. glow, accent).
6. **Offer** (2.5s): sentence, mode type: price or offer line ("Free for your first return.").
7. **Logo** (2s): sentence assemble or cta with logo; transition mark.

Transitions: cut on beats between verb scenes; mark into the logo only. Avoid: phrases longer than 4 words; voiceover; light backgrounds; more than 10 verbs in total.

### Hype Montage (`hype-montage`)

Black-and-white footage cut on every beat, small bold-and-italic type, brand colour only at the end. Modelled on Hyperliquid hype video. Best for: Brand moments, campaign openers, investor or event intros. 20-35s, 16:9, look `editorial`. Dark throughout; colour appears only on the brand beats. Music: Driving, cinematic, 120-140 BPM, hits you can cut to. Needs: 8-15 short clips or photos (Lagos city, markets, people at work, money, speed); Envato works well.

1. **Rhythm lines** (1-1.5 eachs): media scenes, one clip each, grade mono, motion in, headline 1-3 words small and centred (position center, overlay dark), highlight the italic word; 3-word sentences split across clips ("They *move.*" / "They *scale.*").
2. **Brand flash** (2s): title or cta with the logo on theme blue (the only colour so far); transition mark.
3. **Benefits** (1-1.5 eachs): media scenes again: one word each ("*Instant.*" / "*Accurate.*" / "*On time.*").
4. **Line** (3s): sentence, mode build: "All the power. *Zero friction.*" on dark.
5. **End** (3s): cta with logo and URL; transition star or mark.

Transitions: cut between every clip; mark or star only into brand beats. Avoid: big headlines; colour footage; UI screenshots; phrases longer than 4 words.

### Brand Film (`brand-film`)

Bold colour fields, giant type over footage, brand shapes sweeping between beats, the app built piece by piece. Modelled on LemFi rebrand film. Best for: Rebrands, big campaigns, the story of who TaxStreem is for. 45-80s, 16:9, look `campaign`. Alternate blue and light scenes per beat; footage in between. Music: Warm, upbeat Afrobeats-leaning, 105-115 BPM. Needs: 6-10 clips or photos of Nigerian business owners and cities; 2-3 product screenshots.

1. **People** (1-1.5 eachs): kinetic or sentence over footage (media prop), 2-3 words per phrase replacing each other ("Our people" / "don't stay still" / "Neither do we").
2. **Shape turn** (2.5s): split with a photo in a card frame and a short line; transition stack into it.
3. **Product build** (4-5s): ui payment or hero phone with chips appearing one by one.
4. **Name** (2.5s): sentence, mode assemble with the brand name, theme blue.
5. **Cities** (1.5 eachs): title scenes or sentence build with a city name huge (Lagos / Abuja / Port Harcourt) and a small line under it.
6. **Manifesto** (3-4s): sentence, mode stack: "File." / "Save." / "*Grow.*".
7. **End** (3s): cta with logo; transition mark.

Transitions: stack between sections, cut inside footage runs, mark at the end. Avoid: small type; long product demos; more than 3 colours.

### App Launch (`app-launch`)

Soft pastel gradient, the phone as hero with UI floating round it, a wall of screens, one-word captions. Modelled on ConversBank. Best for: Mobile app launches and app-store moments. 30-45s, 9:16, look `corporate`. Light with one dark beat for the wall of screens. Music: Bright pop-electronic, 110-120 BPM. Needs: 3-6 phone screenshots of the app.

1. **Old way** (3s): sentence, mode type: "Taxes have always looked the *same*" (light).
2. **Icon** (2s): logo or cta with the app icon; transition through.
3. **Hero** (4-5s): hero phone with the main screen, title left/top, 3 chips floating (VAT filed / ₦ due date / PAYE ready).
4. **Wall** (3.5s): wall layout wall on theme dark, portraitCards true, title "Every Tax In One App".
5. **Feature words** (2.5 eachs): hero again with a different screen and a one-word title ("Intuitive." then "Automatic.").
6. **Carousel** (4s): wall carousel of phone screens with labels.
7. **Get it** (3s): cta "Download TaxStreem today" with the store line.

Transitions: through and push; blob once at the dark beat. Avoid: desktop screenshots in phones; long captions; dark looks.

### People + Product (`people-product`)

Real customers on camera, the product floating over their world, then a clean demo and a friendly close. Modelled on LangEase. Best for: Customer-centred ads: a pharmacy owner, a trader, an SME finance lead. 25-40s, 16:9, look `taxstreem`. Footage and light scenes, one deep-blue question beat. Music: Warm, light corporate, 95-110 BPM. Needs: 2-4 clips or photos of real customers at work (Envato or your own) and 2-3 screenshots.

1. **Person** (3s): media with a customer photo or clip, headline "Ada runs a pharmacy" position bottom; close {zoom 1.4} and transition through.
2. **Their tool** (4s): split with the same person on one side and a screenshot card beside them (or hero browser), kicker with their name.
3. **Promise** (3s): sentence, mode type: "I'll show you how in *30 seconds*".
4. **Demo** (5s): screenshot with macro and focus labels, cursor clicks.
5. **Question** (3s): sentence build on theme blue: "Need PAYE *too*?" then "We've got that.".
6. **Choice** (3s): ui picker landing on the tax type, result line.
7. **Close** (3s): cta with logo, "Try free" pill and URL; transition star.

Transitions: through out of footage, push between demo beats, star into the close. Avoid: stock-looking people who aren't Nigerian; more than 2 demo scenes.


## Reference study notes


Pacing (hard cuts / avg shot): v01 28/2.7s, v02 8/9.1s, v03 11/4.4s, v04 21/3.9s, v05 3/12s, v06 1/17.5s, v07 10/8.7s, v08 1/30s, v09 29/1.0s, v10 3/8s, v11 7/5.5s.
=> Most are continuous: elements transform into the next beat instead of cutting. Only the hype video (v09) cuts on every beat.

### v01 LemFi rebrand film (78s, 25fps)
- Opens on footage with huge condensed display type, 2-3 words per phrase, phrases replace each other each ~1s ("Our people / Don't stay still / Neither do we").
- Brand shape transitions: stacked rounded-square cards (3 colours, offset + rotated) sweep across and wipe to the next scene; a photo sits inside the shape (mask).
- UI assembly: a blank white card appears, content fills in (send form), then more cards stack above it, then it shrinks into a phone that lands on an illustrated ground.
- Logo build: letters type on, mascot pops on top. Type specimen and colour-bar wipes (vertical stripes sliding) for "new colours".
- City beats: big city name + small pill under it, illustrated skyline rising behind (London / Rio / Lagos).
- Phones over a soft photo backdrop (clouds), success check animates; phones slide in as a row/carousel.
- Motion-blurred whip transition between footage; split screens of faces; end: "Send. Save. Grow." stacked word build, then logo.
- Full-bleed colour backgrounds switch per beat (lime, lilac, purple, green). Tiny palette, bold.

### v02 Modus SaaS demo (82s, 30fps) - "white + one accent" product story
- White ground, one accent colour (orange) for key words, black for interstitials. Almost one continuous take (8 cuts).
- Kinetic sentence build: words land one at a time at the centre, the sentence re-centres as it grows; key words in the accent; a small sparkle/asterisk floats near them.
- Giant-word pan: a phrase set huge, cropped by the frame, slides across while the same sentence sits small as a caption.
- Product UI as floating panels in 3D perspective (tilted back, several fanned out at different depths, thin accent border), the camera glides between them and settles flat on one.
- Big hand cursor clicks tabs; a tab bar scrolls sideways with the active tab bold (Performance → Insights).
- Problem beat: file icons in a row with a caption ("Manual. Repetitive. Outdated."), the hand drags one into a drop zone.
- Rolodex text: a spinning logo mark on the left, status lines rolling vertically beside it ("Calculating quotas…").
- Accent panel slides in from the right and fills half the screen; text inside rolls to the next line.
- Line chart draws point by point; a stat sentence ("You'll be $2.3M off in Q4") with the number in the accent.
- Typewriter with a block caret on black, then the word grows huge and pans.
- Ends: tagline, logo mark spins into the wordmark, fade.

### v03 Lovio AI product (53s) - "dark premium / glass"
- Deep navy-violet ground with slow aurora glows; glass UI panels (frosted, soft shadow) over blurred photos with light leaks.
- Opens on a sparkle; a soft blob-shaped mask grows to reveal the scene (shape mask reveal). Prompt box types with a caret.
- Words blur in (defocus to sharp) with a glow; gradient-filled key word ("idea"); logo blurs in.
- Devices in context: laptop on a desk, phone in a hand, a person typing, then the UI floats out of the device.
- "Generating…" pill with a progress bar; code panel scrolls; a mosaic grid of generated screens, one card zooms forward out of the grid.
- Letter-spaced word assembling ("a t  o n c e"), letters drifting together; inline picture inside a sentence ("Beautifully [screen] designed").
- Filmstrip of screens sliding sideways, brackets { } close around the centre one (carousel focus).
- Ends on an abstract 3D bloom and the logo blurring in.

### v04 Google Vids (87s) - "airy product launch"
- White ground with soft blue/violet gradient blooms; one rounded sans; blue accent.
- Sentence with a live UI chip inside it and a rotating last word: "Meet your [+ New] designer / editor / storyteller" (the last word slides/blurs out and the next slides in).
- Macro UI: the camera starts extremely close on one element (a giant "+ New" button, a menu item, a prompt field), the cursor clicks (button squashes), then the camera pulls back to reveal the full screen. Repeated as the main rhythm.
- Giant typing: a prompt types huge with a tall caret, then pulls back into the real input field.
- Fly-in: file icons fly from the sides into a prompt pill and get absorbed.
- Gradient "Creating…" pill with a sparkle; outline rows of the plan slide in one by one.
- Big soft gradient circles and pills sweep across as transitions; pill shapes morph into a picker; waveform bars pulse for "voice".
- Mosaic of stock photos slides in rows, one lifts out, grows and lands in the editor timeline (fly-to-target).
- Countdown 3-2-1 in a circle over a blurred webcam, then picture-in-picture.
- Play button with pulsing rings; end list replaces words in the same spot ("event recaps / vendor outreach / how-to tutorials"), app icon grid, logo.

### v05 iBanPay / iBanFirst fintech demo (48s) - "fintech flow, closest to TaxStreem"
- Starts dark (deep purple to black, glow at the bottom), switches to white with lilac glows halfway. 3 cuts in 48s.
- Typewriter headline with caret over faint invoice/payment cards drifting at different depths behind it.
- Logo arrives with a heavy horizontal motion-blur whip, settles with an "AI-powered" glowing pill under it.
- Sentence scroller: the line slides left as new words arrive ("Send one → or multiple invoices"); old words fade at the left edge.
- Big pill button ("New mail") pressed, then the inbox appears as a browser window tilted in 3D, camera drifting along it.
- Object inside a sentence: "It extracts [invoice] all key details" with the document spinning in 3D between the words, then it straightens, grows, and corner brackets snap round it (scan frame) while fields highlight.
- A big soft 4-point star swells to fill the frame and turns the scene white (shape transition).
- Inline sparkle icon between words ("Time for a quick ✦ check").
- Dashboard tilted in 3D, the camera slides; a slice of UI (a date row with a button) pulled out and enlarged.
- Approval flow: "Send for approval" click, approver rows slide in with spinners that turn into ticks, a glowing "Payment approved" pill, a ring progress that completes into a tick, "Payment sent".
- Ends: thin lines sweep in arcs, the logo mark draws, wordmark + URL pill.

### v06 Apple Creator Studio (35s) - "type that acts out the verb"
- Pure black, white text, colour only from the content. One cut. A beat every 0.5–1.5s, locked to the music.
- The idea: every short phrase is animated in the way its verb means. "Make a beat" letters bounce on the beat into a music timeline; "Edit a [clip strip] video" (a filmstrip slides into the gap in the sentence); "Take your design anywhere" grows inside a card that changes colour and gets picked up; "Prompt it." dissolves into glittering particles; "Perform it." keys pressed by hands; "Select it." a selection box sweeps the word; "Write it" is handwritten stroke by stroke; "Scrap it." letters fall into a bin; "Move it." letters jump about; "Upscale it." a scan line sharpens the word; "Share it." blooms with glow.
- Logo: letters glitch through other glyphs/colours before resolving.
- A wall of app screens zooms past; price line types in; product names roll vertically in their colours.

### v07 Numtera AI SaaS launch (95s) - "blue gradient SaaS, macro + brackets"
- White to sky-blue gradient glows, deep navy for statement beats. Typewriter captions with caret; UI fragments (dropdowns, badges, chat bubbles) float at the edges around the caption.
- Text-selection highlight: a word gets a blue selection box like selected text ("Different").
- "Meet" huge and heavy, shrinks as the product name and logo join it.
- 3D-tilted dashboard sweeps in; split screen: light UI on the left, dark terminal on the right with status lines appearing one by one, ticks turning green ("Connected… Scanning… Verified source found… Resolved case #442").
- Macro progress bar "learning…" huge, then pulls back into a card; a scan line passes over a card.
- Brackets: "[ Reusable knowledge ]" brackets snap around the phrase, then squeeze it to nothing and become the next beat.
- Wide stretched italic word that slides through ("Auto-resolved"), then blurs out.
- Macro form fields typing huge, pull back to the form; a workflow builds as numbered nodes joined by lines, step by step.
- Big words slide across the frame ("They close tickets"), the answer in the accent ("We eliminate them"). Logo, typed tagline, typed CTA on black.

### v08 Gemini Canvas (60s) - "dark with rim light"
- Near-black with blue/violet glow; UI windows have a glowing rim (light along the edge) and sit in 3D perspective, the camera drifting.
- Big 4-point star mark swells next to the wordmark. Captions are one sentence with one accent word.
- Scattered letters: the letters of a phrase start spread across the frame and fly together into the word; word halves slide together ("collabora|tion").
- Macro chip: a "Canvas" button huge with a glow, then smaller in context; prompt types inside a gradient pill.
- Document scrolls at an angle; side toolbar with hover labels; cursor clicks open a suggestion card.
- Thin glowing curves sweep in from the four corners and frame the caption (a transition and a frame at once).
- Showcase beat: a category word sits over a tilted example window that swaps every ~1s ("docs / timelines / data / games / apps").
- End: the chip shrinks to a pill, CTA line with URL under it.

### v09 Hype launch video (31s) - "montage cut to the beat"
- Black-and-white stock footage, a new clip on every beat (about 1s): rocket launch, light streaks, white buildings, racing cars, code, a Rubik's cube, banknote engraving, price charts, Big Ben. Single accent colour (mint green) only on brand beats (smoke, logo).
- Small, centred type over the footage, mixing a bold sans with a serif italic in the same line ("They *scale*.", "We're making it *unstoppable*."). Words arrive one at a time, short sentences, rhythm "They move. They scale. They dominate."
- Footage is graded flat and dark so small type reads; slow push-ins on each clip.
- Ends: a liquid blob morphs into the mark, wordmark letters appear one by one.

### v10 LangEase B2B ad (32s) - "real people + floating UI"
- Opens on live footage with a caption fading in, then the footage shrinks into a video card inside the app's library (footage becomes UI; continuity instead of a cut). More cards slide in beside it.
- Pale blue-white ground with soft blue glows; typewriter line with caret; a number punches in with a soft blur trail ("30 Seconds").
- Office footage with the app window floating over it as a glass panel (background blurred), the cursor working inside; small round feature badges pop out of the window edge.
- Deep blue gradient with a big waveform behind a question ("voiceover?"), answer line in a lighter weight.
- Drum picker: a vertical list of languages rotates past a centre point (items fade and shrink away from the centre) while the word beside it swaps to the same greeting in that language.
- 4-point star swells, shrinks into the logo mark, wordmark wipes out from the mark, "Try free" pill and URL appear.

### v11 ConversBank banking app (44s) - "pastel fintech app launch"
- Soft pastel gradient ground (lilac, peach, pale blue) with a blurred grid of the app's UI behind the caption; caption types in at the centre.
- App icon pops in the middle with a soft shadow; phone with the app beside a left-aligned headline (headline lines rise in one by one).
- A wall of phone screens, tilted in 3D on a dark ground, drifting diagonally (infinite grid of screens).
- Phone turning in 3D on dark with blue light streaks sweeping past it.
- UI fragments (chat bubbles, avatars, small cards) float around a centred caption at different depths, gently bobbing.
- Drag to reorder: list rows lift and swap places; a light/dark toggle flips the whole UI's theme.
- Bank cards fan out in 3D; single-word captions ("Intuitive", "Enjoyable") beside the phone; grid of screens with avatar bubbles popping on top.
- Ends: App Store style page, then the logo mark draws as concentric arcs, wordmark and tagline.

### Close-up timing (frame strips)
- v02 words: each phrase lands big (~1.4x) and keeps shrinking slowly while it's on screen (a slow dolly-out); the next phrase blurs in from the right with motion blur. Accent words are the brand colour; tiny 4-point sparkles twinkle near them. ~0.6-0.9s per phrase.
- v04 opener: "Meet your [+ New] designer": the chip sits inside the sentence; the last word swaps every ~0.7s (old one blurs up and out, new one rises in). Then the camera is right on top of the "+ New" button, the cursor arrives and clicks, a menu drops, the camera dives into the menu item, three gradient triangles (the logo shape) sweep across as the transition.
- v05 document: the invoice spins in from depth between "It extracts" and "all key details" (about 1s, turning on its vertical axis), the words fade, the page straightens and grows, four corner brackets snap in from outside to the page corners, then field boxes outline one by one.
- v05 approval: card with a glowing edge, cursor clicks "Send for approval"; a table header lands, rows slide up one by one each with a spinner that resolves to a green tick; "Payment approved" pill glows, the pill shrinks into a circle that becomes a progress ring, the ring completes and a tick draws, "Payment sent" rises under it with a small download pill.
- v01 brand shapes: an app icon on a phone (macro), pull back to the person; then three rounded squares in brand colours sweep diagonally from bottom-left, the footage ends up inside the front square on the right while the line types on the left; the next line replaces a word with a squashed italic slide.
- v07 brackets: the setup line ("it turns the solution into") shrinks and dims while the payoff appears big in the accent between wide brackets; then the brackets squeeze inward, clipping the words, down to "[ ]", then a white flash into the product.
- v08 letters: the phrase splits into syllable fragments that fly out to scattered positions at different sizes; the next phrase's fragments fly in from scattered positions and click together.
- v06 verbs: "Select it." gets a marquee and turns lime; "Write it" is drawn along a curved path then swoops away; "Scrap it." sits over a bin that fills; "Move it." letters jump out of line.

### Motion principles common to all of them
- Continuity: the next beat grows out of the current one (shape swells, an element flies into another, the camera dives into a detail, footage shrinks into a UI card). Hard cuts are kept for montage and music hits.
- Camera on UI: open close on one detail, act (click/type), pull back to context. Tilted 3D panels with depth and a slow drift; the camera settles flat when it matters.
- Type is the main actor: one idea per beat, 1-5 words, landing word by word with blur, accent colour on the key word, inline objects (chips, icons, documents) living inside the sentence, swaps in place, brackets, selection highlights, letters assembling.
- Easing: fast-out slow-in (expo/quint), entrances 0.35-0.7s, little or no bounce except in playful brand work; blur on anything moving fast.
- States over screens: spinners turn into ticks, buttons press and morph into progress rings, numbers count, statuses stack.
- Palette: one ground + one accent per video, gradient glows instead of flat fills, a single dark or light flip at most.
- End: logo builds from its mark (draws, morphs or swells), tagline, CTA pill with URL.
