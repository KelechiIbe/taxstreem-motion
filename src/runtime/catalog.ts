// The scene template catalog: what Claude may use and how. The server builds the prompt from
// this, so the model's instructions and the runtime never drift apart.

export interface TemplateDoc {
  name: string;
  use: string;
  props: string;
  example: Record<string, unknown>;
  /** Comfortable length range in seconds. */
  seconds: [number, number];
}

export const CATALOG: TemplateDoc[] = [
  {
    name: "title",
    use: "Hook or section opener. Big headline that rises word by word. The first scene of most videos.",
    props: `kicker?: short ALL-CAPS label (2-4 words). headline: Title Case, max ~10 words. highlight?: words from the headline to emphasise (blue on light/dark; full white vs dimmed on blue). sub?: one sentence, sentence case. align?: "left" | "center". logo?: true to show the TaxStreem logo above.`,
    example: { kicker: "VAT · Monthly filing", headline: "Your VAT Return Shouldn't Take A Whole Weekend", highlight: ["VAT", "Return"], sub: "TaxStreem prepares it from your transactions." },
    seconds: [2.5, 4],
  },
  {
    name: "statement",
    use: "The brand's two-tone statement: a longer sentence where key words are full strength and connecting words are dimmed. Great on the blue theme, for a mission line or a summary.",
    props: `text: 10-30 words, Title Case. emphasis?: words at full strength (if omitted, connecting words are dimmed automatically). align?: "left" | "center". cta?: optional pill label shown after the text.`,
    example: { text: "TaxStreem Is A Modern Tax Automation Platform That Helps Individuals And Businesses Handle Taxes With Ease" },
    seconds: [3.5, 6],
  },
  {
    name: "stat",
    use: "One number that matters, counting up. Use ONLY numbers the user gave you or that are visible in their screenshots.",
    props: `value: number. prefix?: e.g. "₦". suffix?: e.g. "%", "h", "+". decimals?: digits after the point. compact?: true for ₦1.25M style. from?: start value (default 0). label: what the number is (sentence case). sub?: one supporting line. kicker?: label. badge?: small pill like "20% vs last month". trend?: "up" | "down". bar?: 0..1 to show a progress bar.`,
    example: { kicker: "Last 30 days", value: 100379.38, prefix: "₦", decimals: 2, label: "VAT payable, worked out for you", badge: "20% vs last month" },
    seconds: [3, 4.5],
  },
  {
    name: "screenshot",
    use: "Product UI in a browser window, phone or plain card, with a camera that zooms to regions, a cursor that clicks, spotlight and callout labels. The core of product videos. Wide screenshots in 9:16/1:1 are shown cropped in a larger window and the camera pans, so always give focus regions for them.",
    props: `image: asset id of an uploaded screenshot (required). frame?: "browser" | "phone" | "none" (auto: phone for tall images, browser for wide). url?: text in the browser bar (default app.taxstreem.com). kicker?, title?, sub?, highlight?: header text above (9:16, 1:1) or beside (16:9) the frame. focus?: [{x, y, w, h, at, label?, spotlight?, zoom?}] regions in 0..1 fractions of the IMAGE (x,y = top-left), at = seconds into the scene when the camera moves there; label adds a callout pill; spotlight dims everything else (on by default when there is a label). To zoom back out add {x:0,y:0,w:1,h:1,at}. cursor?: [{x, y, at, click?}] in image fractions; at = when it clicks (it travels for ~0.85s before). view?: {x, y} resting camera centre for cropped views (default 0.5, 0.5). crop?: false to always show the whole screenshot. video?: asset id of a screen recording to play in the frame instead of a still (use with start?, speed?, end?, loop?; focus and cursor fractions are of the video frame). tilt?: "none" | "left" | "right" | "back" for a 3D-leaning frame (glass and neon looks lean by default; it flattens when the camera zooms to a focus region). macro?: {x, y, w, h, out?} open right on that detail of the screenshot (the camera fills the frame with it) and pull back to the whole screen at out seconds (default 1.1): the macro-then-context move; put a cursor click inside the macro region before out.`,
    example: { image: "<asset-id>", kicker: "Dashboard", title: "Every Tax In One View", focus: [{ x: 0.6, y: 0.19, w: 0.18, h: 0.23, at: 1.4, label: "VAT payable" }], cursor: [{ x: 0.69, y: 0.33, at: 2.2 }] },
    seconds: [4, 8],
  },
  {
    name: "features",
    use: "2-6 benefits or features as cards with icons, appearing one after another. List on 9:16, grid on 16:9.",
    props: `kicker?, title?, highlight?. items: [{title (2-5 words), body? (one short sentence), icon? (one of ICONS)}].`,
    example: { title: "Built For Nigerian Businesses", items: [{ title: "VAT, WHT and CIT", body: "Schedules prepared from real transactions.", icon: "receipt" }, { title: "Deadline reminders", body: "Never miss the 21st again.", icon: "calendar-clock" }] },
    seconds: [3.5, 6],
  },
  {
    name: "steps",
    use: "A 2-5 step process that activates one step at a time along a progress line. How-it-works, filing walkthroughs.",
    props: `kicker?, title?, highlight?. steps: [{title (2-5 words), body? (one short sentence)}]. Give each step about 1.2-1.6s of scene time.`,
    example: { kicker: "How it works", title: "Three Steps To Filed", steps: [{ title: "Link your bank", body: "Transactions flow in daily." }, { title: "Review the schedule" }, { title: "File on Rev360" }] },
    seconds: [4, 7],
  },
  {
    name: "chart",
    use: "Bar or line chart that draws itself. Only with real data the user supplied.",
    props: `kicker?, title?, highlight?. kind?: "bar" | "line". data: [{label, value}] (2-10 points). prefix?, suffix?, compact?, decimals?. highlight?: index of the point to colour (default last). source?: short source note shown under the chart.`,
    example: { title: "Hours Back Every Month", data: [{ label: "Manual", value: 14 }, { label: "TaxStreem", value: 1 }], suffix: "h", highlight: 1 },
    seconds: [3.5, 5],
  },
  {
    name: "compare",
    use: "Before/after or without/with: a muted card of pains, then a strong blue card of gains.",
    props: `kicker?, title?, highlight?. left: {title, items: string[] (2-5, 2-4 words each)}. right: {title, items: string[]}.`,
    example: { title: "Filing, Before And After", left: { title: "Without TaxStreem", items: ["Receipts in folders", "Manual VAT sums"] }, right: { title: "With TaxStreem", items: ["Bank-linked records", "Schedules prepared"] } },
    seconds: [4, 5.5],
  },
  {
    name: "deadline",
    use: "Tax deadline callout: a calendar card flips to the date, with title, note and a countdown pill. Use real statutory dates only.",
    props: `day: number. month: "Nov" etc. year?: string. title: Title Case. sub?: one sentence. kicker?: label. countdown?: e.g. "5 days left".`,
    example: { kicker: "Next deadline", day: 21, month: "Nov", title: "October VAT Is Due", sub: "File by the 21st to avoid penalties.", countdown: "19 days left" },
    seconds: [3, 4.5],
  },
  {
    name: "quote",
    use: "A quote or tip, revealed word by word, with optional author. Only real quotes the user provides; never invent testimonials.",
    props: `text: the quote (max ~30 words). highlight?: words in blue. author?: name. role?: role/company. kicker?.`,
    example: { text: "We closed our books and filed VAT the same afternoon.", author: "Name", role: "Founder" },
    seconds: [3.5, 5.5],
  },
  {
    name: "cta",
    use: "Closing call to action: logo, headline, pill button, URL. Optional cursor that clicks the button.",
    props: `headline?: Title Case. highlight?. sub?. cta?: button label (default "Start now"). url?: (default "taxstreem.com"; "" hides it). logo?: false to hide the logo. click?: true for a cursor that presses the button.`,
    example: { headline: "Make Taxes Clearer For Everyone", cta: "Start now", url: "taxstreem.com" },
    seconds: [3, 4.5],
  },
  {
    name: "logo",
    use: "Logo sting: the icon mark assembles, then the wordmark wipes in. Opener or final card.",
    props: `tagline?: one short line (sentence case).`,
    example: { tagline: "Make taxes clearer for everyone." },
    seconds: [2, 3],
  },
  {
    name: "media",
    use: "Full-bleed photo or video clip (footage, b-roll, a recording) with a slow camera move and an optional headline over a soft scrim. Use for real-world scenes, people, places and footage the user uploaded or picked from stock.",
    props: `media: asset id of an image or video (required). start?, speed?, end?, loop?: which part of a clip plays (seconds into the file; speed 0.5 = slow motion). volume?: 0..1 to keep the clip's own sound (default 0, silent). motion?: "in" | "out" | "left" | "right" | "up" | "down" | "none" (slow camera; default "in" for photos, "none" for clips). focus?: {x, y} 0..1 point to keep in view when cropping. fit?: "cover" | "contain". frame?: "card" to show it as a rounded card instead of full-bleed. overlay?: "dark" | "light" | "brand" | "none" (default dark when there is text). grade?: "mono" (black and white, for hype montages) | "dark" | "warm" | "cool". position?: "bottom" | "center" | "top" for the text. kicker?, headline?, sub?, highlight?, align?.`,
    example: { media: "<asset-id>", kicker: "Real businesses", headline: "Built For The Way Lagos Works", highlight: ["Lagos"], position: "bottom" },
    seconds: [2.5, 6],
  },
  {
    name: "split",
    use: "Photo or clip on one side, message on the other (stacked in 9:16): a person with a story, a product shot with three benefits.",
    props: `media: asset id (required). frame?: "card" (rounded, default) | "bleed" (fills half the screen edge to edge). side?: "left" | "right" (where the media sits on 16:9 and 1:1). kicker?, title?, sub?, highlight?. bullets?: up to 4 short lines with check marks. cta?: pill label. tilt?: "none" | "left" | "right" | "back". start?, speed?, end?, loop?, volume?, motion?, focus?, fit? as in media.`,
    example: { media: "<asset-id>", kicker: "Meet Ada", title: "She Files VAT In Ten Minutes", bullets: ["Linked her bank once", "Reviews every return", "Never misses the 21st"] },
    seconds: [3.5, 6],
  },
  {
    name: "collage",
    use: "Two to five photos or clips that slide together into a collage, with a bold headline (people-led campaigns, community, events, 'Send. Save. Grow.' style ads).",
    props: `items: [{media, caption?, start?, volume?, focus?}] 1-5 asset ids (images or clips). headline?, highlight?, kicker?. position?: "top" (default) | "bottom" for the headline on 9:16/1:1 (16:9 puts it at the left).`,
    example: { headline: "Send. Save. File.", highlight: ["File."], items: [{ media: "<asset-id>", caption: "Ada, Lagos" }, { media: "<asset-id>" }, { media: "<asset-id>" }] },
    seconds: [3.5, 6],
  },
  {
    name: "icons",
    use: "Icon tiles (or uploaded logos) that pop in as a row, grid or slow orbit: everything the product covers, integrations, tax types, partner banks.",
    props: `items: [{icon? (one of ICONS), image? (asset id of a logo), label?, highlight? (true for the one to emphasise)}] 2-8 items. layout?: "row" | "grid" | "orbit" (orbit circles the TaxStreem mark, or the title if given). kicker?, title?, highlight?.`,
    example: { title: "Every Tax You Pay", items: [{ icon: "receipt", label: "VAT" }, { icon: "landmark", label: "CIT" }, { icon: "users", label: "PAYE", highlight: true }, { icon: "percent", label: "WHT" }] },
    seconds: [3, 5],
  },
  {
    name: "kinetic",
    use: "Big kinetic type: short phrases that replace each other on the beat (\"Meet\" → \"Martina\"), or stack line by line. Hooks, reveals, music-led openers, keynote moments.",
    props: `lines: ["phrase", ...] or [{text, at?, highlight?}] 1-8 short phrases (1-4 words each). at = seconds into the scene when the phrase lands (default: spread evenly; match them to voiceover word times or music beats when you have them). highlight?: true for the whole phrase in the accent, or an array of words. mode?: "replace" (default, one phrase at a time, huge) | "stack" (each lands under the last, older ones dim). size?: "xl" (default) | "l". align?: "center" | "left". media?: an image or clip behind the words (with overlay?).`,
    example: { lines: ["Meet", { text: "Martina", highlight: true }, "Your Tax Assistant"] },
    seconds: [2, 5],
  },
  {
    name: "ui",
    use: "Native product UI drawn in the video's style, no screenshot needed: a button being clicked, an AI prompt being typed, notifications arriving, a picker landing on a choice, settings switching on, a payment receipt, a chat. Great for showing what the product does without exposing real screens.",
    props: `kind: "button" | "prompt" | "notifications" | "picker" | "toggles" | "payment" | "chat" | "status" | "success". kicker?, title?, sub?, highlight? above the component. tilt?: "none" | "left" | "right" | "back".
  button: label, icon?, after? (label after the click, e.g. "Filed"), at? (seconds when the hand clicks).
  prompt: placeholder?, text (typed in), icon? (default sparkles), chips? (up to 4 suggestion pills).
  notifications: items [{title, body?, icon? (or "taxstreem" for the mark), time?}] up to 4, arriving newest on top.
  picker: items [{label, icon?}] up to 7, selected (index it lands on), result? (text that appears once chosen).
  toggles: items [{label, sub?, icon?, on? (false to leave off)}] up to 6, switching on one by one.
  payment: title?, amount, prefix?, decimals?, rows [{label, value}] up to 5, status? (pill at the bottom).
  chat: messages [{from: "user" | "bot", text}] up to 6; the bot shows typing dots before each reply.
  status: items [{text, sub?, icon?}] up to 6 rows landing one by one, each spinner turning into a green tick (checks running, approvals, "Reading 214 invoices… Working out VAT… Filed with FIRS"); heading?, right? (column labels), style?: "card" | "terminal", every? (seconds between rows).
  success: label (the button, e.g. "File return"), busy? ("Filing…"), done ("Return filed"), sub? (small pill under it), at? (seconds when it is clicked): the cursor presses the button, it turns into a shimmering pill, shrinks into a ring that fills, a tick draws, and the result rises under it. Needs ~4.5s.`,
    example: { kind: "notifications", title: "Never Miss A Deadline", items: [{ title: "VAT due in 5 days", body: "Your return is ready to review.", icon: "calendar-clock" }, { title: "Return filed", body: "FIRS acknowledged your June VAT." }] },
    seconds: [3, 6],
  },
  {
    name: "sentence",
    use: "Kinetic sentences, the main actor of modern launch videos: one short phrase per beat landing word by word, with chips, icons, pictures or the logo living inside the line, swaps in place, brackets, selection highlights and letters assembling. Use it for hooks, setups, payoffs and the voice of the video between product moments.",
    props: `lines: ["phrase", ...] or [{text, at?}] 1-10 phrases of 1-7 words. Inside a phrase: *word* puts it in the accent; {chip:+ New} a UI button inside the sentence; {icon:sparkles} an icon; {image:<asset-id>} a small picture inside the sentence; {logo} the TaxStreem mark. at = seconds into the scene when the phrase lands (default: spread evenly). mode?: "build" (default: words land one at a time, the line re-centres) | "dolly" (the phrase lands big and keeps easing away, next one blurs in: calm, cinematic) | "type" (typewriter with a tall caret) | "scroll" (all phrases continue one line that slides left as words arrive) | "rotate" (the last word swaps through words[]: "Meet your {chip:+ New} *accountant*" → bookkeeper → tax adviser) | "brackets" (the phrase is framed by brackets that then squeeze it away; squeeze?: true to squeeze the last phrase too) | "select" (a selection highlight sweeps across the accent words) | "assemble" (fragments fly in from scattered spots and click together, then scatter) | "stack" (phrases land under each other, older ones dim). words?: for rotate. sparkles?: true for small four-point sparkles by the accent words. size?: "xl" (default) | "l" | "m". align?: "center" | "left". media?: a photo or clip behind (with overlay?).`,
    example: { mode: "rotate", lines: ["Meet your {chip:+ New} *accountant*"], words: ["bookkeeper", "tax adviser", "finance team"] },
    seconds: [1.5, 5],
  },
  {
    name: "verbs",
    use: "Type that acts out its verb, one short phrase per beat on the music (Apple-style): 'File it.' stamps down, 'Track it.' is scanned sharp, 'Relax.' glows, 'Scrap the spreadsheets.' drops away. Fast, rhythmic, best on a dark or plain ground.",
    props: `items: [{text (1-4 words), effect?, at?, accent? (true for the accent colour)}] 2-10 beats, 0.5-1.5s each. effect: "stamp" | "scan" | "glow" | "bounce" | "select" (marquee) | "write" (pen) | "drop" (letters land, fall away) | "glitch" | "strike" (struck through) | "dissolve" (breaks into specks) | "count" (the number in the phrase rolls up) | "type" | "slide". Pick the effect that means the word. size?: "l" for long phrases.`,
    example: { items: [{ text: "Track it.", effect: "scan" }, { text: "File it.", effect: "stamp" }, { text: "Relax.", effect: "glow", accent: true }] },
    seconds: [2, 7],
  },
  {
    name: "doc",
    use: "Document scan: a receipt, invoice or bank statement spins in between two halves of a sentence, straightens, scan brackets snap round it, a scan line passes and its key fields light up, with the extracted values popping out beside it. TaxStreem reading receipts, invoices, payslips and statements.",
    props: `image?: asset id of the document (without one, a clean invoice is drawn; set rows [{label, value}], vat, total, docTitle, docFrom for it). before?, after?: the two halves of the sentence either side ("It reads", "every receipt"). fields?: [{x, y, w, h, label?}] boxes on the document in 0..1 fractions of it, lit in order. values?: [{label, value}] up to 4 extracted values that pop out as cards. title?, kicker?: when there is no sentence. Needs ~5-6s.`,
    example: { before: "It reads", after: "every invoice", values: [{ label: "Vendor", value: "Adaeze Pharmacy" }, { label: "VAT (7.5%)", value: "₦8,662.50" }, { label: "Total", value: "₦124,162.50" }] },
    seconds: [4.5, 7],
  },
  {
    name: "wall",
    use: "Showcase of screens or photos: a tilted endless wall drifting diagonally (scale, 'everything in one place'), a filmstrip that steps card to card with the label above swapping (features, use cases), or a mosaic that slides in and lifts one card to fill the frame (hand-over into a product scene).",
    props: `items: [asset id or {media, label?}] 3-12 uploaded screenshots or photos. layout?: "wall" (default) | "carousel" | "mosaic". title?, kicker?, highlight?: over the wall. portraitCards?: true for phone screens. focus?: index of the mosaic card that lifts; liftAt?: seconds.`,
    example: { layout: "carousel", items: [{ media: "<asset-id>", label: "VAT" }, { media: "<asset-id>", label: "PAYE" }, { media: "<asset-id>", label: "WHT" }] },
    seconds: [3, 6],
  },
  {
    name: "hero",
    use: "Device hero: the product on a phone, laptop or browser rising in with a gentle 3D lean, small UI pieces (notifications, balances, ticks, chat bubbles) floating around it at different depths, headline beside it. App launches, feature reveals.",
    props: `image?: asset id of a screenshot for the screen. device?: "phone" (default) | "laptop" | "browser". chips?: [{text, sub?, icon?}] up to 6 floating pieces (e.g. {text: "VAT filed", icon: "circle-check"}). kicker?, title?, sub?, highlight?. tilt?: "none" | "left" | "right" | "back".`,
    example: { device: "phone", image: "<asset-id>", title: "Your Taxes, On Autopilot", chips: [{ text: "VAT filed", icon: "circle-check" }, { text: "₦100,379 due", sub: "21 Nov", icon: "calendar-clock" }] },
    seconds: [3.5, 6],
  },
  {
    name: "custom",
    use: "Escape hatch for a visual no template covers (a bespoke diagram, a tax-form illustration, a map). Prefer templates; use custom for at most one or two scenes.",
    props: `code: the BODY of a JavaScript function that receives one argument "api" and draws ONE frame. api = {ctx (2D canvas context), t (seconds into the scene), d (scene duration), W, H, u (1 unit = 1px at 1080 on the short side; size everything in u), stage {safe:{x,y,w,h}, portrait, landscape, square}, palette {fg, muted, accent, highlight, card, cardFg, cardMuted, iconTile, iconFg, pillFill, pillFg}, theme, props, brand (colour hexes), lib {clamp, lerp, ease.{outCubic,outExpo,inOutCubic,smooth}, spring(t, settle, bounce), sp(t, settle, bounce) (spring with the look's feel), tween(t, start, dur, fn), remap}, look (the active style: fonts, motion), colors {primary, secondary, tertiary, ink, paper}, drawMedia(assetId, x, y, w, h, {fit?: "cover"|"contain", zoom? (1 = fitted, 1.2 = 20% closer), focusX?, focusY? (0..1 point kept in view), radius?, at? (seconds into a clip), motion?: "in"|"out"|"left"|"right"|"up"|"down", k? (0..1 progress of that motion)}) draws an uploaded picture or clip frame cropped into a box (the easy, safe way to show the team's pictures; animate x, y, w, h, zoom and k with lib.spring/tween), media(assetId, seconds) returns {source, width, height} for an image or video frame (draw its .source) or null while loading, mediaInfo(assetId) gives {width, height, duration, video}, draw {text(ctx,s,x,y,size,weight,color,align,tracking,role "display"|"head"|"body"|"mono"), layoutText, drawLayout, card(ctx,x,y,w,h,r,fill,u,{border}), pill(ctx,x,y,h,label,fill,fg,{align}), icon(ctx,name,x,y,size,color,progress), logo(ctx,x,y,h,variant), mark(ctx,x,y,h,color,alpha), rrect, kicker(ctx,s,x,y,size,color,ruleColor,progress)}, image(assetId)}. The background is already drawn. Everything must be a pure function of t: no Math.random, no Date, no timers, no state between calls. Respect stage.safe and all three aspect ratios.`,
    example: { code: "const {ctx,t,W,H,u,lib,draw,palette}=api; const p=lib.spring(t-0.2,0.8); ctx.globalAlpha=p; draw.text(ctx,'Hello',W/2,H/2+(1-p)*40*u,120*u,500,palette.fg,'center');" },
    seconds: [2, 6],
  },
];

export const ICON_NAMES = [
  "check", "circle-check", "x", "circle-x", "file-text", "receipt", "shield-check", "clock", "calendar", "calendar-clock",
  "chart-column", "trending-up", "trending-down", "wallet", "landmark", "zap", "sparkles", "users", "building-2", "calculator",
  "triangle-alert", "arrow-right", "chevron-right", "bell", "lock", "refresh-cw", "upload", "download", "search", "briefcase",
  "percent", "banknote", "credit-card", "smartphone", "globe", "mail", "file-check", "files", "scan-line", "bot",
  "link", "store", "package", "truck", "hand-coins", "piggy-bank", "scale", "gavel", "badge-check", "timer",
  "layout-dashboard", "list-checks", "message-circle", "send", "star", "heart", "rocket", "target", "eye", "settings",
  "play", "circle-play", "image", "film", "video", "camera", "mic", "music", "headphones", "arrow-up",
  "arrow-down", "arrow-up-right", "chevron-down", "minus", "plus", "ellipsis", "paperclip", "languages", "moon", "sun",
  "cloud", "wifi", "user", "user-check", "house", "map-pin", "phone", "chart-pie", "chart-line", "coins",
  "circle-dollar-sign", "badge-percent", "receipt-text", "file-spreadsheet", "fingerprint", "scan-face", "key-round", "shield", "qr-code", "shopping-cart",
  "gift", "award", "trophy", "flag", "book-open", "graduation-cap", "lightbulb", "megaphone", "hourglass", "inbox",
  "folder", "folder-open", "pen-line", "stamp", "factory", "handshake", "circle-alert", "info", "circle-help", "thumbs-up",
  "smile", "message-square", "layers", "layout-grid", "sliders-horizontal", "toggle-right", "repeat", "external-link", "share-2", "cpu",
  "database", "code", "terminal", "webhook", "mouse-pointer-click", "wand-sparkles", "brain-circuit",
];

export const TRANSITIONS = ["cut", "fade", "push", "slide-up", "wipe", "zoom", "star", "mark", "stack", "blob", "whip", "through"] as const;
