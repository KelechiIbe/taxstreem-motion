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
    props: `image: asset id of an uploaded screenshot (required). frame?: "browser" | "phone" | "none" (auto: phone for tall images, browser for wide). url?: text in the browser bar (default app.taxstreem.com). kicker?, title?, sub?, highlight?: header text above (9:16, 1:1) or beside (16:9) the frame. focus?: [{x, y, w, h, at, label?, spotlight?, zoom?}] regions in 0..1 fractions of the IMAGE (x,y = top-left), at = seconds into the scene when the camera moves there; label adds a callout pill; spotlight dims everything else (on by default when there is a label). To zoom back out add {x:0,y:0,w:1,h:1,at}. cursor?: [{x, y, at, click?}] in image fractions; at = when it clicks (it travels for ~0.85s before). view?: {x, y} resting camera centre for cropped views (default 0.5, 0.5). crop?: false to always show the whole screenshot.`,
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
    name: "custom",
    use: "Escape hatch for a visual no template covers (a bespoke diagram, a tax-form illustration, a map). Prefer templates; use custom for at most one or two scenes.",
    props: `code: the BODY of a JavaScript function that receives one argument "api" and draws ONE frame. api = {ctx (2D canvas context), t (seconds into the scene), d (scene duration), W, H, u (1 unit = 1px at 1080 on the short side; size everything in u), stage {safe:{x,y,w,h}, portrait, landscape, square}, palette {fg, muted, accent, highlight, card, cardFg, cardMuted, iconTile, iconFg, pillFill, pillFg}, theme, props, brand (colour hexes), lib {clamp, lerp, ease.{outCubic,outExpo,inOutCubic,smooth}, spring(t, settle, bounce), tween(t, start, dur, fn), remap}, draw {text(ctx,s,x,y,size,weight,color,align), layoutText, drawLayout, card(ctx,x,y,w,h,r,fill,u,{border}), pill(ctx,x,y,h,label,fill,fg,{align}), icon(ctx,name,x,y,size,color,progress), logo(ctx,x,y,h,variant), mark(ctx,x,y,h,color,alpha), rrect, kicker(ctx,s,x,y,size,color,ruleColor,progress)}, image(assetId)}. The background is already drawn. Everything must be a pure function of t: no Math.random, no Date, no timers, no state between calls. Respect stage.safe and all three aspect ratios.`,
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
];

export const TRANSITIONS = ["cut", "fade", "push", "slide-up", "wipe", "zoom"] as const;
