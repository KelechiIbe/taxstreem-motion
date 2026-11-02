// Video templates ("blueprints"): complete recipes distilled from the reference launch videos
// the team chose (Modus, Numtera, Google Vids, iBanPay, Lovio, Gemini Canvas, Apple Creator Studio,
// Hyperliquid, LemFi, ConversBank, LangEase). Each one fixes the structure, rhythm, moves,
// transitions, look and music so an idea becomes a finished video with few tweaks.
// The studio's template picker and Claude's prompt are both built from this file.

export interface BlueprintBeat {
  /** What the beat is for, e.g. "Hook". */
  label: string;
  /** Typical length in seconds. */
  seconds: string;
  /** Which template and move, in plain words Claude can follow. */
  how: string;
}

export interface Blueprint {
  id: string;
  name: string;
  /** One line for the picker. */
  tagline: string;
  inspiredBy: string;
  bestFor: string;
  length: [number, number];
  format: "9:16" | "1:1" | "16:9";
  look: string;
  /** How the scene themes move through the video. */
  themes: string;
  music: string;
  /** What the team should provide. */
  needs: string;
  beats: BlueprintBeat[];
  /** The motion vocabulary this template is built from. */
  moves: string[];
  transitions: string;
  avoid: string[];
}

export const BLUEPRINTS: Blueprint[] = [
  {
    id: "product-story",
    name: "Product Story",
    tagline: "White page, one blue accent: sentences land word by word and the camera lives on your product.",
    inspiredBy: "Modus, Numtera, Google Vids",
    bestFor: "Explaining a feature or the whole product on LinkedIn, YouTube or the website.",
    length: [30, 50],
    format: "16:9",
    look: "taxstreem",
    themes: "Light throughout; one dark interstitial (theme dark) for the turning-point line.",
    music: "Calm modern electronic, 100-115 BPM, light percussion.",
    needs: "3-5 product screenshots (or screen recordings). No footage needed.",
    beats: [
      { label: "Hook", seconds: "3-4", how: "sentence, mode dolly or build: a question in 2 phrases, the key word in *accent*, sparkles on. (\"What if your *VAT*\" / \"filed *itself*?\")" },
      { label: "Problem", seconds: "3", how: "sentence, mode select on a three-beat line (\"Manual. Late. *Risky.*\") or icons row of file icons with a short caption." },
      { label: "Meet", seconds: "2.5-3", how: "sentence, mode rotate: \"Meet your {chip:+ File} *accountant*\" with words [bookkeeper, tax team]; transition star into it." },
      { label: "Product moment 1", seconds: "4-6", how: "screenshot with props.open {x, y, zoom 2.6} on the element that matters, cursor click on it, then 1-2 focus regions with labels; tilt back settling flat; kicker + title above." },
      { label: "Product moment 2", seconds: "4-5", how: "ui (prompt, toggles or notifications) or a second screenshot with macro; end with close {zoom 1.6} and the next transition through." },
      { label: "Turn", seconds: "2.5-3", how: "sentence, mode type on theme dark: the shift in one line (\"Now it files *itself*.\")." },
      { label: "Proof", seconds: "3", how: "stat counting up or chart; one number only, in the accent." },
      { label: "Payoff", seconds: "3", how: "sentence, mode brackets: setup line, then the payoff in *accent* framed by brackets that squeeze away (squeeze true)." },
      { label: "Close", seconds: "3", how: "cta with the logo and URL, or sentence type \"Try TaxStreem {logo} today\"." },
    ],
    moves: ["kinetic sentences with inline chips and sparkles", "macro-then-context camera on screenshots (open + focus + cursor)", "tilted UI settling flat", "typewriter interstitial", "brackets squeeze", "number count-up"],
    transitions: "Mostly through (with a close camera on the outgoing scene) and push; one star at the reveal; no fades.",
    avoid: ["more than one idea per beat", "full-screen text paragraphs", "fade transitions", "more than one accent colour"],
  },
  {
    id: "fintech-flow",
    name: "Fintech Flow",
    tagline: "A workflow end to end: dark open, a document scanned, checks ticking, a payment or return confirmed.",
    inspiredBy: "iBanPay by iBanFirst",
    bestFor: "Showing a process from start to finish: receipts to VAT, payroll to PAYE, invoice to payment.",
    length: [30, 45],
    format: "16:9",
    look: "glass",
    themes: "First third dark (the problem), a star transition flips to light for the solution, light to the end.",
    music: "Polished electronic, 105-120 BPM, a lift when the scene turns light.",
    needs: "1-3 screenshots of the flow; a real receipt or invoice photo is a bonus (otherwise one is drawn).",
    beats: [
      { label: "Pain", seconds: "3-4", how: "sentence, mode type on theme dark: the manual pain as a question (\"Still typing *invoices* into Excel?\")." },
      { label: "Brand", seconds: "2.5", how: "title or cta with the logo and a small \"AI-powered\" pill; transition whip into it." },
      { label: "Action", seconds: "3-4", how: "ui button or prompt (the first click) with open {zoom 2.4} on the button, or sentence mode scroll (\"Snap one receipt\" / \"or a thousand\")." },
      { label: "Read", seconds: "5-6", how: "doc: before \"It reads\", after \"every receipt\", values [vendor, VAT, total]; uploaded document image if there is one." },
      { label: "Turn", seconds: "2.5", how: "transition star into a light scene: sentence build \"Time for a quick {icon:sparkles} *check*\"." },
      { label: "Review", seconds: "4-5", how: "screenshot tilt back with macro on the figure that matters, cursor click, focus label." },
      { label: "Approve", seconds: "4-4.5", how: "ui status: 3 rows (reading, working out, filing) with spinners turning into ticks; heading/right column labels." },
      { label: "Done", seconds: "4.5", how: "ui success: \"File return\" → \"Filing…\" → ring → tick → \"Return filed\" with a small receipt pill." },
      { label: "Outro", seconds: "3", how: "sentence build \"Save time. *Avoid errors.*\" then transition mark into cta with logo and URL." },
    ],
    moves: ["typewriter on dark with drifting UI", "logo whip", "document spin and scan with brackets", "status rows resolving to ticks", "button → pill → ring → tick", "star transition from dark to light"],
    transitions: "whip into the brand, star for the dark-to-light turn, through between product beats, mark into the CTA.",
    avoid: ["more than 3 status rows", "light scenes before the turn", "stacking two document scenes"],
  },
  {
    id: "dark-launch",
    name: "Dark Launch",
    tagline: "Deep navy with glow: letters assemble, glass screens float in depth, a showcase carousel, a big reveal.",
    inspiredBy: "Gemini Canvas, Lovio",
    bestFor: "Launching an AI feature or a big new product moment.",
    length: [30, 60],
    format: "16:9",
    look: "neon",
    themes: "Dark throughout.",
    music: "Cinematic electronic, slow build 90-110 BPM, a hit at the reveal.",
    needs: "3-6 screenshots of the feature (dark mode if you have it).",
    beats: [
      { label: "Spark", seconds: "2.5", how: "sentence, mode assemble: the brand or feature name flies together from fragments." },
      { label: "Promise", seconds: "3", how: "sentence, mode dolly: one line with the key word in *accent* (\"Your taxes, *reimagined*\")." },
      { label: "Reveal", seconds: "4-5", how: "hero (browser or laptop) with the main screenshot, tilt right, 2-3 chips floating; transition star." },
      { label: "Prompt", seconds: "3.5", how: "ui prompt typing a real request (\"File my November VAT\") with tilt back." },
      { label: "Show", seconds: "4-5", how: "wall carousel of 3-5 screenshots, each with a one-word label (VAT, PAYE, WHT, CIT)." },
      { label: "Depth", seconds: "4-5", how: "screenshot with open camera on the result, focus labels, tilt back." },
      { label: "Statement", seconds: "3", how: "sentence, mode brackets with the payoff in accent." },
      { label: "Close", seconds: "3", how: "cta with logo; transition mark." },
    ],
    moves: ["letters assembling", "glass panels with glow in 3D", "floating chips around a device", "carousel with brackets and swapping label", "blur-in type"],
    transitions: "star at the reveal, through between product scenes, mark into the close; never push or wipe.",
    avoid: ["light themes", "busy backgrounds behind text", "more than 2 lines on screen"],
  },
  {
    id: "verb-reel",
    name: "Verb Reel",
    tagline: "Black screen, music-led: every short phrase moves the way it means. File it. Track it. Relax.",
    inspiredBy: "Apple Creator Studio",
    bestFor: "15-30s social ads and launch teasers; strong with a punchy track.",
    length: [15, 30],
    format: "9:16",
    look: "keynote",
    themes: "Dark throughout.",
    music: "Upbeat, 110-128 BPM; phrases land on beats (one every 2 beats).",
    needs: "Optional: 2-4 screenshots for quick flashes. A music track from Envato.",
    beats: [
      { label: "Open", seconds: "1.5-2", how: "sentence, mode assemble: \"TaxStreem\" or the offer name." },
      { label: "Promise", seconds: "2", how: "sentence, mode build: \"One app. *Every tax.*\"." },
      { label: "Verbs 1", seconds: "3-4", how: "verbs: 3-4 items of 1-3 words with effects that mean them (Track it. scan / File it. stamp / Pay it. count)." },
      { label: "Flash", seconds: "1.5-2", how: "hero or wall with a screenshot, fast (transition cut)." },
      { label: "Verbs 2", seconds: "3-4", how: "verbs: 3-4 more (Remind me. type / Scrap the spreadsheets. drop / Relax. glow, accent)." },
      { label: "Offer", seconds: "2.5", how: "sentence, mode type: price or offer line (\"Free for your first return.\")." },
      { label: "Logo", seconds: "2", how: "sentence assemble or cta with logo; transition mark." },
    ],
    moves: ["type that acts out its verb", "glitch/assemble logo", "hard cuts on the beat", "glow on the payoff word"],
    transitions: "cut on beats between verb scenes; mark into the logo only.",
    avoid: ["phrases longer than 4 words", "voiceover", "light backgrounds", "more than 10 verbs in total"],
  },
  {
    id: "hype-montage",
    name: "Hype Montage",
    tagline: "Black-and-white footage cut on every beat, small bold-and-italic type, brand colour only at the end.",
    inspiredBy: "Hyperliquid hype video",
    bestFor: "Brand moments, campaign openers, investor or event intros.",
    length: [20, 35],
    format: "16:9",
    look: "editorial",
    themes: "Dark throughout; colour appears only on the brand beats.",
    music: "Driving, cinematic, 120-140 BPM, hits you can cut to.",
    needs: "8-15 short clips or photos (Lagos city, markets, people at work, money, speed); Envato works well.",
    beats: [
      { label: "Rhythm lines", seconds: "1-1.5 each", how: "media scenes, one clip each, grade mono, motion in, headline 1-3 words small and centred (position center, overlay dark), highlight the italic word; 3-word sentences split across clips (\"They *move.*\" / \"They *scale.*\")." },
      { label: "Brand flash", seconds: "2", how: "title or cta with the logo on theme blue (the only colour so far); transition mark." },
      { label: "Benefits", seconds: "1-1.5 each", how: "media scenes again: one word each (\"*Instant.*\" / \"*Accurate.*\" / \"*On time.*\")." },
      { label: "Line", seconds: "3", how: "sentence, mode build: \"All the power. *Zero friction.*\" on dark." },
      { label: "End", seconds: "3", how: "cta with logo and URL; transition star or mark." },
    ],
    moves: ["mono-graded footage", "a cut on every beat", "small mixed bold/italic type", "slow push-ins", "colour saved for the brand"],
    transitions: "cut between every clip; mark or star only into brand beats.",
    avoid: ["big headlines", "colour footage", "UI screenshots", "phrases longer than 4 words"],
  },
  {
    id: "brand-film",
    name: "Brand Film",
    tagline: "Bold colour fields, giant type over footage, brand shapes sweeping between beats, the app built piece by piece.",
    inspiredBy: "LemFi rebrand film",
    bestFor: "Rebrands, big campaigns, the story of who TaxStreem is for.",
    length: [45, 80],
    format: "16:9",
    look: "campaign",
    themes: "Alternate blue and light scenes per beat; footage in between.",
    music: "Warm, upbeat Afrobeats-leaning, 105-115 BPM.",
    needs: "6-10 clips or photos of Nigerian business owners and cities; 2-3 product screenshots.",
    beats: [
      { label: "People", seconds: "1-1.5 each", how: "kinetic or sentence over footage (media prop), 2-3 words per phrase replacing each other (\"Our people\" / \"don't stay still\" / \"Neither do we\")." },
      { label: "Shape turn", seconds: "2.5", how: "split with a photo in a card frame and a short line; transition stack into it." },
      { label: "Product build", seconds: "4-5", how: "ui payment or hero phone with chips appearing one by one." },
      { label: "Name", seconds: "2.5", how: "sentence, mode assemble with the brand name, theme blue." },
      { label: "Cities", seconds: "1.5 each", how: "title scenes or sentence build with a city name huge (Lagos / Abuja / Port Harcourt) and a small line under it." },
      { label: "Manifesto", seconds: "3-4", how: "sentence, mode stack: \"File.\" / \"Save.\" / \"*Grow.*\"." },
      { label: "End", seconds: "3", how: "cta with logo; transition mark." },
    ],
    moves: ["brand-shape stack sweeps", "giant type over footage", "colour-field backgrounds per beat", "phrase replacement on the beat", "stacked manifesto"],
    transitions: "stack between sections, cut inside footage runs, mark at the end.",
    avoid: ["small type", "long product demos", "more than 3 colours"],
  },
  {
    id: "app-launch",
    name: "App Launch",
    tagline: "Soft pastel gradient, the phone as hero with UI floating round it, a wall of screens, one-word captions.",
    inspiredBy: "ConversBank",
    bestFor: "Mobile app launches and app-store moments.",
    length: [30, 45],
    format: "9:16",
    look: "corporate",
    themes: "Light with one dark beat for the wall of screens.",
    music: "Bright pop-electronic, 110-120 BPM.",
    needs: "3-6 phone screenshots of the app.",
    beats: [
      { label: "Old way", seconds: "3", how: "sentence, mode type: \"Taxes have always looked the *same*\" (light)." },
      { label: "Icon", seconds: "2", how: "logo or cta with the app icon; transition through." },
      { label: "Hero", seconds: "4-5", how: "hero phone with the main screen, title left/top, 3 chips floating (VAT filed / ₦ due date / PAYE ready)." },
      { label: "Wall", seconds: "3.5", how: "wall layout wall on theme dark, portraitCards true, title \"Every Tax In One App\"." },
      { label: "Feature words", seconds: "2.5 each", how: "hero again with a different screen and a one-word title (\"Intuitive.\" then \"Automatic.\")." },
      { label: "Carousel", seconds: "4", how: "wall carousel of phone screens with labels." },
      { label: "Get it", seconds: "3", how: "cta \"Download TaxStreem today\" with the store line." },
    ],
    moves: ["phone hero with floating chips at depth", "tilted wall of screens", "carousel", "single-word captions", "typewriter open"],
    transitions: "through and push; blob once at the dark beat.",
    avoid: ["desktop screenshots in phones", "long captions", "dark looks"],
  },
  {
    id: "people-product",
    name: "People + Product",
    tagline: "Real customers on camera, the product floating over their world, then a clean demo and a friendly close.",
    inspiredBy: "LangEase",
    bestFor: "Customer-centred ads: a pharmacy owner, a trader, an SME finance lead.",
    length: [25, 40],
    format: "16:9",
    look: "taxstreem",
    themes: "Footage and light scenes, one deep-blue question beat.",
    music: "Warm, light corporate, 95-110 BPM.",
    needs: "2-4 clips or photos of real customers at work (Envato or your own) and 2-3 screenshots.",
    beats: [
      { label: "Person", seconds: "3", how: "media with a customer photo or clip, headline \"Ada runs a pharmacy\" position bottom; close {zoom 1.4} and transition through." },
      { label: "Their tool", seconds: "4", how: "split with the same person on one side and a screenshot card beside them (or hero browser), kicker with their name." },
      { label: "Promise", seconds: "3", how: "sentence, mode type: \"I'll show you how in *30 seconds*\"." },
      { label: "Demo", seconds: "5", how: "screenshot with macro and focus labels, cursor clicks." },
      { label: "Question", seconds: "3", how: "sentence build on theme blue: \"Need PAYE *too*?\" then \"We've got that.\"." },
      { label: "Choice", seconds: "3", how: "ui picker landing on the tax type, result line." },
      { label: "Close", seconds: "3", how: "cta with logo, \"Try free\" pill and URL; transition star." },
    ],
    moves: ["footage with captions", "person beside the product", "typewriter promise", "macro demo", "picker landing on a choice"],
    transitions: "through out of footage, push between demo beats, star into the close.",
    avoid: ["stock-looking people who aren't Nigerian", "more than 2 demo scenes"],
  },
];

export const BLUEPRINT_BY_ID = new Map(BLUEPRINTS.map((b) => [b.id, b]));

/** The full recipe, written for Claude. */
export function blueprintGuide(id: string | null | undefined): string {
  const b = id ? BLUEPRINT_BY_ID.get(id) : undefined;
  if (!b) return "";
  return [
    `VIDEO TEMPLATE: "${b.name}" (${b.id}), modelled on ${b.inspiredBy}. Follow it closely: the team picked it to get a finished video with few tweaks.`,
    `Feel: ${b.tagline}`,
    `Length ${b.length[0]}-${b.length[1]}s. Look "${b.look}". Themes: ${b.themes} Music: ${b.music}`,
    `Structure (keep the order; drop or repeat a beat only when the content needs it):`,
    ...b.beats.map((x, i) => `${i + 1}. ${x.label} (${x.seconds}s): ${x.how}`),
    `Moves: ${b.moves.join("; ")}.`,
    `Transitions: ${b.transitions}`,
    `Avoid: ${b.avoid.join("; ")}.`,
    `It needs: ${b.needs} If something is missing, use envato: requests in the script (or build the beat with a template that needs no media) and say so.`,
  ].join("\n");
}

/** One line per template, for Claude to suggest one when the team hasn't picked. */
export function blueprintMenu(): string {
  return BLUEPRINTS.map((b) => `- "${b.id}" ${b.name}: ${b.tagline} Best for: ${b.bestFor}`).join("\n");
}
