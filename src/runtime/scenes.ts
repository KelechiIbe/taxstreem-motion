// Scene templates. Each one draws a single frame of its scene from local time t, so any
// frame can be rendered on its own. The active look decides the feel (fonts, surfaces, entry
// style, spring timing), so one template serves every style. One idea per scene.

import * as D from "./draw";
import { type Ctx, type LaidWord, type Palette, type Stage, type TextLayout } from "./draw";
import { clamp, ease, formatNumber, lerp, remap, rng, spring, springSteps, tween } from "./lib";
import type { Entry } from "./looks";
import type { SceneSpec, Theme } from "./types";

export interface MediaFrame {
  source: CanvasImageSource & { width: number; height: number };
  width: number;
  height: number;
}

export interface SceneCtx {
  ctx: Ctx;
  s: Stage;
  t: number;
  d: number;
  p: Record<string, any>;
  pal: Palette;
  theme: Theme;
  scene: SceneSpec;
  index: number;
  image(id: string | undefined): (ImageBitmap & { width: number; height: number }) | null;
  /** A still or a video frame: images by id, videos at media time `at` (seconds into the clip). */
  media(id: string | undefined, at?: number): MediaFrame | null;
  /** Size and length of a media asset (duration 0 for stills), or null when it isn't loaded. */
  mediaInfo(id: string | undefined): { width: number; height: number; duration: number; video: boolean } | null;
  warn(msg: string): void;
}

export type Template = (c: SceneCtx) => void;

// ---------------------------------------------------------------- shared motion helpers

const M = () => D.activeLook().motion;

/** Spring shaped by the look: snappier for punchy looks, bouncier for playful ones. */
export const sp = (t: number, settle = 0.7, bounce = 0) => spring(t, settle * M().settle, Math.min(0.5, bounce + M().bounce));
/** Spring with the look's timing but no extra bounce (cameras, progress, anything that shouldn't wobble). */
export const spCalm = (t: number, settle = 0.7) => spring(t, settle * M().settle, 0);

const stag = (n: number, max = 0.07, total = 0.9) => Math.min(max, total / Math.max(1, n)) * M().stagger;

interface WordOpts {
  color: string;
  hl?: string;
  dimAlpha?: number;
  stagger?: number;
  settle?: number;
  entry?: Entry;
  wordAlpha?: (w: LaidWord) => number;
}

const colorOf = (w: LaidWord, o: WordOpts) => (w.highlight && o.hl ? o.hl : o.color);
const alphaOf = (w: LaidWord, o: WordOpts) => (o.wordAlpha ? o.wordAlpha(w) : o.dimAlpha !== undefined && !w.highlight ? o.dimAlpha : 1);

/** Typewriter: characters appear at a steady rate with a caret. Returns the end time. */
function typewriter(c: SceneCtx, l: TextLayout, start: number, o: WordOpts, cps = 34) {
  const { ctx, t } = c;
  const rate = cps / Math.max(0.4, M().stagger);
  let shown = Math.max(0, (t - start) * rate);
  const total = l.words.reduce((a, w) => a + w.text.length + 1, 0);
  let caret: { x: number; y: number } | null = null;
  for (const w of l.words) {
    if (shown <= 0) break;
    const n = Math.min(w.text.length, Math.floor(shown));
    shown -= w.text.length + 1;
    if (n <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= alphaOf(w, o);
    const part = w.text.slice(0, n);
    D.drawWord(ctx, l, w, colorOf(w, o), 0, 0, part);
    ctx.restore();
    D.fontFor(ctx, l, w);
    caret = { x: w.x + ctx.measureText(part).width, y: w.y };
  }
  const end = start + total / rate;
  if (caret && (t < end + 0.9 || Math.floor(t * 2) % 2 === 0) && t < end + 1.6) {
    if (t < end || Math.floor((t - end) * 2.4) % 2 === 0) {
      ctx.fillStyle = D.solid(o.color);
      ctx.fillRect(caret.x + l.size * 0.06, caret.y - l.size * 0.74, Math.max(2, l.size * 0.07), l.size * 0.86);
    }
  }
  return end;
}

/** One word entering with the look's entry style. p is its spring progress. */
function wordEntry(c: SceneCtx, l: TextLayout, w: LaidWord, p: number, o: WordOpts, entry: Entry) {
  const { ctx } = c;
  if (p <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= clamp(p * 1.5) * alphaOf(w, o);
  const col = colorOf(w, o);
  if (entry === "pop") {
    const cx = w.x + w.w / 2;
    const cy = w.y - l.size * 0.35;
    const k = 0.35 + 0.65 * p;
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
    D.drawWord(ctx, l, w, col, 0, (1 - p) * l.size * 0.25);
  } else if (entry === "blur") {
    const b = (1 - clamp(p)) * l.size * 0.16;
    if (b > 0.4) ctx.filter = `blur(${b.toFixed(1)}px)`;
    D.drawWord(ctx, l, w, col, 0, (1 - p) * l.size * 0.22);
  } else if (entry === "slide") {
    D.drawWord(ctx, l, w, col, -(1 - p) * l.size * 1.1, 0);
  } else {
    D.drawWord(ctx, l, w, col, 0, (1 - p) * l.size * 0.95);
  }
  ctx.restore();
}

/** Headline words enter in the look's style (rise from a mask, pop, blur in, slide, type). */
function riseWords(c: SceneCtx, l: TextLayout, start: number, o: WordOpts) {
  const { ctx, t } = c;
  const entry = o.entry ?? M().entry;
  if (entry === "type") return typewriter(c, l, start, o);
  const st = o.stagger ?? stag(l.words.length);
  const masked = entry === "rise" || entry === "slide";
  const bounce = entry === "pop" ? 0.28 : 0;
  for (const line of l.lines) {
    ctx.save();
    if (masked) {
      const pad = l.size * 0.3;
      ctx.beginPath();
      ctx.rect(line.x - pad, line.y - l.size * 1.02, line.width + pad * 2, l.size * 1.34);
      ctx.clip();
    }
    for (const w of line.words) wordEntry(c, l, w, sp(t - (start + w.index * st), o.settle ?? 0.75, bounce), o, entry);
    ctx.restore();
  }
  return start + l.words.length * st;
}

/** Words arrive one after another at reading pace (statements, quotes). */
function typeWords(c: SceneCtx, l: TextLayout, start: number, o: WordOpts & { per?: number }) {
  const { ctx, t } = c;
  const entry = o.entry ?? M().entry;
  if (entry === "type") return typewriter(c, l, start, o, 40);
  const per = (o.per ?? Math.min(0.06, 1.6 / Math.max(1, l.words.length))) * M().stagger;
  for (const w of l.words) {
    if (entry === "rise") {
      const p = ease.outCubic((t - start - w.index * per) / (0.45 * M().settle));
      if (p <= 0) continue;
      ctx.save();
      ctx.globalAlpha *= p * alphaOf(w, o);
      D.drawWord(ctx, l, w, colorOf(w, o), 0, (1 - p) * l.size * 0.18);
      ctx.restore();
    } else {
      wordEntry(c, l, w, sp(t - start - w.index * per, 0.55, entry === "pop" ? 0.28 : 0), o, entry === "slide" ? "slide" : entry);
    }
  }
  return start + l.words.length * per;
}

function withFade(ctx: Ctx, p: number, dy: number, fn: () => void) {
  if (p <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= clamp(p);
  ctx.translate(0, (1 - p) * dy);
  fn();
  ctx.restore();
}

function scaleAbout(ctx: Ctx, cx: number, cy: number, k: number) {
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.translate(-cx, -cy);
}

/** Headline colours: two-tone when the highlight is the text colour (TaxStreem on blue). */
function headColors(c: SceneCtx, hasHighlight: boolean) {
  const pal = c.pal;
  if (pal.highlight === pal.fg) return { color: pal.fg, hl: pal.fg, dimAlpha: hasHighlight ? 0.72 : undefined };
  return { color: pal.fg, hl: pal.highlight, dimAlpha: undefined };
}

function str(v: unknown, fallback = ""): string {
  return v === undefined || v === null ? fallback : String(v);
}
function arr<T = any>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function checkOverflow(c: SceneCtx, l: TextLayout, what: string) {
  if (l.overflow) c.warn(`Scene "${c.scene.id}": the ${what} is too long to fit; shorten it.`);
}

/** Title block (kicker + title + sub) used by several templates. Returns the bottom y. */
function headerBlock(c: SceneCtx, x: number, y: number, maxW: number, o: { kicker?: string; title?: string; sub?: string; size: number; align?: "left" | "center"; start?: number; maxLines?: number; highlight?: string[] }): { bottom: number; end: number } {
  const { ctx, s, pal } = c;
  const u = s.u;
  const start = o.start ?? 0.1;
  let cy = y;
  let end = start;
  const align = o.align ?? "left";
  if (o.kicker) {
    const ks = 26 * u;
    D.kicker(ctx, o.kicker, x, cy + ks, ks, pal.muted, pal.accent, sp(c.t - start, 0.6), align);
    cy += ks + 32 * u;
  }
  if (o.title) {
    const l = D.layoutText(ctx, o.title, x, cy, { maxWidth: maxW, size: o.size, weight: 500, maxLines: o.maxLines ?? 3, align, highlight: o.highlight, lineHeight: 1.08 });
    checkOverflow(c, l, "title");
    const col = headColors(c, !!o.highlight?.length);
    end = riseWords(c, l, start + 0.08, { color: col.color, hl: col.hl, dimAlpha: col.dimAlpha });
    cy += l.height + 22 * u;
  }
  if (o.sub) {
    const ss = Math.max(26 * u, o.size * 0.4);
    const l = D.layoutText(ctx, o.sub, x, cy, { maxWidth: maxW, size: ss, weight: 400, tracking: -0.005, lineHeight: 1.36, maxLines: 3, align });
    checkOverflow(c, l, "subtitle");
    withFade(ctx, sp(c.t - (end + 0.05), 0.7), 18 * u, () => D.drawLayout(ctx, l, pal.muted));
    cy += l.height + 10 * u;
  }
  return { bottom: cy, end };
}

// ---------------------------------------------------------------- templates

/** Browser chrome and other product-UI colours: always the light app, whatever the look. */
const UI = { bar: D.BRAND.surface1, line: D.BRAND.line, quiet: D.BRAND.ink400, muted: D.BRAND.ink500 };

const title: Template = (c) => {
  const { ctx, s, p, pal, t } = c;
  const u = s.u;
  const align: "left" | "center" = p.align === "center" ? "center" : s.landscape ? "left" : (p.align ?? "left");
  const maxW = s.landscape ? s.safe.w * 0.74 : s.safe.w;
  const x = align === "center" ? s.W / 2 : s.safe.x;
  const size = (s.portrait ? 118 : s.landscape ? 124 : 100) * u;
  const highlight = arr<string>(p.highlight);
  // measure first so the block can be centred vertically
  const kS = 26 * u;
  const head = D.layoutText(ctx, str(p.headline, "Untitled"), x, 0, { maxWidth: maxW, size, weight: 500, maxLines: s.portrait ? 6 : 4, highlight, lineHeight: 1.04 });
  checkOverflow(c, head, "headline");
  const subS = (s.portrait ? 42 : 40) * u;
  const sub = p.sub ? D.layoutText(ctx, str(p.sub), x, 0, { maxWidth: Math.min(maxW, 1100 * u), size: subS, weight: 400, tracking: -0.005, lineHeight: 1.36, maxLines: 4, align }) : null;
  const logoH = (s.portrait ? 54 : 48) * u;
  const blockH = (p.kicker ? kS + 44 * u : 0) + head.height + (sub ? 40 * u + sub.height : 0);
  const centerY = s.safe.y + s.safe.h * (s.portrait ? 0.44 : 0.5);
  let y = centerY - blockH / 2;
  if (p.logo) {
    const lw = D.logoWidth(logoH);
    const lx = align === "center" ? s.W / 2 - lw / 2 : s.safe.x;
    withFade(ctx, sp(t - 0.05, 0.8), -14 * u, () => D.logo(ctx, lx, s.safe.y, logoH, pal.logo === "dark" ? "brand" : "white"));
  }
  if (p.kicker) {
    D.kicker(ctx, str(p.kicker), x, y + kS, kS, pal.muted, pal.accent, sp(t - 0.1, 0.6), align);
    y += kS + 44 * u;
  }
  const headLaid = D.layoutText(ctx, str(p.headline, "Untitled"), x, y, { maxWidth: maxW, size: head.size, minSize: head.size, weight: 500, maxLines: 99, highlight, align, lineHeight: 1.04 });
  const col = headColors(c, highlight.length > 0);
  const end = riseWords(c, headLaid, 0.18, { color: col.color, hl: col.hl, dimAlpha: col.dimAlpha, settle: 0.8 });
  // accent underline beneath the first highlighted word (light/dark themes)
  const firstHl = headLaid.words.find((w) => w.highlight);
  if (firstHl && pal.highlight !== pal.fg && !headLaid.italicHl) {
    const up = ease.outExpo((t - end - 0.1) / 0.6);
    if (up > 0) {
      ctx.fillStyle = D.paint(ctx, pal.highlight.startsWith("grad:") ? pal.highlight : pal.accent, firstHl.x, 0, firstHl.x + firstHl.w, 0);
      ctx.globalAlpha = 0.9;
      ctx.fillRect(firstHl.x, firstHl.y + headLaid.size * 0.14, firstHl.w * up, Math.max(4, headLaid.size * 0.06));
      ctx.globalAlpha = 1;
    }
  }
  y += headLaid.height;
  if (sub) {
    y += 40 * u;
    const subLaid = D.layoutText(ctx, str(p.sub), x, y, { maxWidth: Math.min(maxW, 1100 * u), size: sub.size, minSize: sub.size, weight: 400, tracking: -0.005, lineHeight: 1.36, maxLines: 99, align });
    withFade(ctx, sp(t - (end + 0.15), 0.8), 22 * u, () => D.drawLayout(ctx, subLaid, pal.muted));
  }
};

const STOP = new Set("a an and are as at be but by can for from has have how in into is it its of on or our so that the their them then this to was we were what when which who will with without you your yours".split(" "));

const statement: Template = (c) => {
  const { ctx, s, p, pal } = c;
  const u = s.u;
  const align: "left" | "center" = p.align === "center" ? "center" : "left";
  const maxW = s.landscape ? s.safe.w * 0.7 : s.safe.w;
  const x = align === "center" ? s.W / 2 : s.safe.x;
  const size = (s.portrait ? 82 : s.landscape ? 76 : 70) * u;
  const emphasis = arr<string>(p.emphasis);
  const probe = D.layoutText(ctx, str(p.text), x, 0, { maxWidth: maxW, size, weight: 500, maxLines: s.portrait ? 11 : 7, lineHeight: 1.14, align, highlight: emphasis });
  checkOverflow(c, probe, "statement");
  const y = s.safe.y + s.safe.h * (s.portrait ? 0.42 : 0.47) - probe.height / 2 - (p.cta ? 60 * u : 0);
  const l = D.layoutText(ctx, str(p.text), x, y, { maxWidth: maxW, size: probe.size, minSize: probe.size, weight: 500, maxLines: 99, lineHeight: 1.14, align, highlight: emphasis });
  const auto = emphasis.length === 0;
  const strong = (w: LaidWord) => (auto ? !STOP.has(w.text.toLowerCase().replace(/[^a-z]/g, "")) : w.highlight);
  const end = typeWords(c, l, 0.2, { color: pal.fg, wordAlpha: (w) => (strong(w) ? 1 : pal.dimAlpha), per: Math.min(0.055, 2.2 / Math.max(1, l.words.length)) });
  if (p.cta) {
    const h = (s.portrait ? 104 : 92) * u;
    const pp = sp(c.t - (end + 0.25), 0.7);
    withFade(ctx, pp, 20 * u, () => D.pill(ctx, x, y + l.height + 64 * u, h, str(p.cta), pal.pillFill, pal.pillFg, { align, glow: true, u }));
  }
};

function drawNumber(ctx: Ctx, txt: string, finalTxt: string, x: number, y: number, size: number, weight: number, color: string, accent: string, align: "left" | "center", prefix: string, suffix: string) {
  // Digits sit in fixed-width cells so the count-up never jitters; the box is sized from the final value.
  D.setFont(ctx, weight, size, -0.035, "display");
  if (D.upperFor("display")) {
    txt = txt.toUpperCase();
    finalTxt = finalTxt.toUpperCase();
  }
  const cell = ctx.measureText("0").width;
  const width = (s: string) => [...s].reduce((a, ch) => a + (/[0-9]/.test(ch) ? cell : ctx.measureText(ch).width), 0);
  const fw = width(finalTxt);
  const left = align === "center" ? x - fw / 2 : x;
  let cx = left + fw - width(txt); // right-aligned inside the final box
  const body = D.paint(ctx, color, left, y - size * 0.7, left + fw, y);
  const affix = D.paint(ctx, accent, left, y - size * 0.7, left + fw, y);
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    const isAffix = i < prefix.length || i >= txt.length - suffix.length;
    ctx.fillStyle = isAffix ? affix : body;
    const w = /[0-9]/.test(ch) ? cell : ctx.measureText(ch).width;
    ctx.textAlign = "center";
    ctx.fillText(ch, cx + w / 2, y);
    cx += w;
  }
  ctx.textAlign = "left";
  return { left, width: fw };
}

const stat: Template = (c) => {
  const { ctx, s, p, pal, t } = c;
  const u = s.u;
  const align: "left" | "center" = p.align === "left" ? "left" : "center";
  const x = align === "center" ? s.W / 2 : s.safe.x;
  const value = Number(p.value) || 0;
  const from = Number(p.from) || 0;
  const prefix = str(p.prefix);
  const suffix = str(p.suffix);
  const decimals = Number(p.decimals) || 0;
  const compact = !!p.compact;
  // count-up in the final unit (₦0.00M → ₦1.25M), easing out like a settling dial
  let unit = 1;
  let unitLabel = "";
  if (compact) {
    const abs = Math.abs(value);
    for (const [n, l] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as [number, string][]) if (abs >= n) { unit = n; unitLabel = l; break; }
  }
  const dec = compact && unit > 1 ? (decimals || (value / unit >= 100 ? 0 : value / unit >= 10 ? 1 : 2)) : decimals;
  const fmt = (v: number) => prefix + (compact && unit > 1 ? (v / unit).toFixed(dec) + unitLabel : formatNumber(v, { decimals: dec })) + suffix;
  const k = ease.outExpo((t - 0.35) / 1.7);
  const cur = lerp(from, value, k);
  const finalTxt = fmt(value);
  let size = (s.portrait ? 230 : s.landscape ? 240 : 200) * u * D.displayScale();
  D.setFont(ctx, 600, size, -0.035, "display");
  const maxW = s.landscape ? s.safe.w * 0.62 : s.safe.w;
  const w0 = ctx.measureText(finalTxt.replace(/[0-9]/g, "0")).width;
  if (w0 > maxW) size *= maxW / w0;
  const labelS = (s.portrait ? 48 : 44) * u;
  const label = D.layoutText(ctx, str(p.label), x, 0, { maxWidth: maxW, size: labelS, weight: 500, maxLines: 3, align, lineHeight: 1.18, role: "body" });
  checkOverflow(c, label, "label");
  const sub = p.sub ? D.layoutText(ctx, str(p.sub), x, 0, { maxWidth: maxW, size: labelS * 0.68, weight: 400, maxLines: 3, align, lineHeight: 1.4 }) : null;
  const badgeH = p.badge ? 64 * u : 0;
  const barH = p.bar !== undefined ? 70 * u : 0;
  const total = (p.kicker ? 70 * u : 0) + badgeH + (badgeH ? 36 * u : 0) + size * 0.9 + 40 * u + label.height + (sub ? 24 * u + sub.height : 0) + barH;
  let y = s.safe.y + s.safe.h * (s.portrait ? 0.45 : 0.5) - total / 2;
  if (p.kicker) {
    D.kicker(ctx, str(p.kicker), x, y + 24 * u, 24 * u, pal.muted, pal.accent, sp(t - 0.05, 0.6), align);
    y += 70 * u;
  }
  if (p.badge) {
    const pb = sp(t - 1.6, 0.6, 0.15);
    withFade(ctx, pb, 0, () => {
      const trendIcon = p.trend === "down" ? "trending-down" : "trending-up";
      const bs = 28 * u;
      const tw = D.measure(ctx, str(p.badge), bs, 600);
      const bw = tw + 100 * u;
      const bx = align === "center" ? x - bw / 2 : x;
      ctx.save();
      scaleAbout(ctx, bx + bw / 2, y + badgeH / 2, 0.85 + 0.15 * pb);
      D.rrect(ctx, bx, y, bw, badgeH, badgeH / 2);
      ctx.fillStyle = pal.tint;
      ctx.fill();
      D.icon(ctx, trendIcon, bx + 26 * u, y + badgeH / 2 - 16 * u, 32 * u, pal.tintFg, 1, 2.2);
      D.text(ctx, str(p.badge), bx + 70 * u, y + badgeH / 2 + bs * 0.36, bs, 600, pal.tintFg);
      ctx.restore();
    });
    y += badgeH + 36 * u;
  }
  const numP = sp(t - 0.2, 0.8);
  withFade(ctx, numP, 40 * u, () => {
    drawNumber(ctx, fmt(cur), finalTxt, x, y + size * 0.78, size, 600, pal.highlight.startsWith("grad:") ? pal.highlight : pal.fg, pal.accent, align, prefix, suffix);
  });
  y += size * 0.9 + 40 * u;
  const lab = D.layoutText(ctx, str(p.label), x, y, { maxWidth: maxW, size: label.size, minSize: label.size, weight: 500, maxLines: 99, align, lineHeight: 1.18, role: "body" });
  const le = riseWords(c, lab, 0.55, { color: pal.fg });
  y += lab.height;
  if (sub) {
    y += 24 * u;
    const sl = D.layoutText(ctx, str(p.sub), x, y, { maxWidth: maxW, size: sub.size, minSize: sub.size, weight: 400, maxLines: 99, align, lineHeight: 1.4 });
    withFade(ctx, sp(t - le - 0.1, 0.7), 16 * u, () => D.drawLayout(ctx, sl, pal.muted));
    y += sl.height;
  }
  if (p.bar !== undefined) {
    const frac = clamp(Number(p.bar));
    const bw = Math.min(maxW, 760 * u);
    const bx = align === "center" ? x - bw / 2 : x;
    const by = y + 44 * u;
    const bh = 14 * u;
    D.rrect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = pal.subtle;
    ctx.fill();
    const fp = frac * sp(t - 0.6, 1.6);
    if (fp > 0.002) {
      D.rrect(ctx, bx, by, bw * fp, bh, bh / 2);
      ctx.fillStyle = D.paint(ctx, pal.accent, bx, 0, bx + bw, 0);
      ctx.fill();
    }
  }
};

/** Seconds into a clip for this moment of the scene: start, speed, end and loop props. */
function mediaTime(c: SceneCtx, id: string | undefined, p: Record<string, any>, t = c.t): number {
  const info = c.mediaInfo(id);
  if (!info || !info.duration) return 0;
  const start = Math.max(0, +p.start || 0);
  const speed = +p.speed > 0 ? +p.speed : 1;
  const end = +p.end > start ? Math.min(+p.end, info.duration) : info.duration;
  let at = start + Math.max(0, t) * speed;
  if (p.loop) at = start + ((at - start) % Math.max(0.1, end - start));
  return Math.min(at, end - 0.001);
}

interface MediaDraw {
  fit?: "cover" | "contain";
  r?: number;
  focus?: { x?: number; y?: number };
  /** Slow camera on stills and clips: "in", "out", "left", "right", "up", "down" or "none". */
  motion?: string;
  /** Progress of the slow camera, 0..1. */
  k?: number;
  /** Media time override (defaults to mediaTime). */
  at?: number;
  /** Explicit scale on top of the fit (1 = fitted); overrides the zoom from motion. */
  zoom?: number;
}

/** Draws an image or video frame into a box with a slow camera; a neutral placeholder if it's missing. */
function drawMedia(c: SceneCtx, ctx: Ctx, id: string | undefined, props: Record<string, any>, box: { x: number; y: number; w: number; h: number }, o: MediaDraw = {}) {
  const { s } = c;
  const u = s.u;
  const r = o.r ?? 0;
  const m = c.media(id, o.at ?? mediaTime(c, id, props));
  ctx.save();
  if (r > 0) {
    D.rrect(ctx, box.x, box.y, box.w, box.h, r);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
  }
  if (!m) {
    const info = c.mediaInfo(id);
    if (!info) c.warn(`Scene "${c.scene.id}": media "${str(id, "(none)")}" isn't uploaded yet.`);
    const g = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
    g.addColorStop(0, D.solid(c.pal.softCard));
    g.addColorStop(1, D.solid(c.pal.subtle));
    ctx.fillStyle = c.theme === "light" ? "#E9EDF5" : "#1A1D24";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    if (!info) {
      const is = Math.min(box.w, box.h) * 0.16;
      D.icon(ctx, "image", box.x + box.w / 2 - is / 2, box.y + box.h / 2 - is * 0.7, is, c.theme === "light" ? "#9AA3B2" : "#5A6070", 1, 1.6);
      D.text(ctx, "Media goes here", box.x + box.w / 2, box.y + box.h / 2 + is * 0.75, Math.max(18 * u, is * 0.28), 500, c.theme === "light" ? "#9AA3B2" : "#5A6070", "center");
    }
    ctx.restore();
    return false;
  }
  const fit = o.fit ?? "cover";
  const iw = m.width;
  const ih = m.height;
  const base = fit === "cover" ? Math.max(box.w / iw, box.h / ih) : Math.min(box.w / iw, box.h / ih);
  const k = clamp(o.k ?? 0);
  const mo = o.motion ?? "none";
  const zoom = o.zoom && o.zoom > 0 ? o.zoom : mo === "in" ? 1 + 0.12 * k : mo === "out" ? 1.12 - 0.12 * k : mo === "none" ? 1 : 1.1;
  const sc = base * zoom;
  const dw = iw * sc;
  const dh = ih * sc;
  let fx = clamp(o.focus?.x ?? 0.5);
  let fy = clamp(o.focus?.y ?? 0.5);
  if (mo === "left") fx = lerp(0.8, 0.2, k);
  if (mo === "right") fx = lerp(0.2, 0.8, k);
  if (mo === "up") fy = lerp(0.8, 0.2, k);
  if (mo === "down") fy = lerp(0.2, 0.8, k);
  const grade = GRADES[str(props.grade)];
  if (grade) ctx.filter = grade;
  ctx.drawImage(m.source, box.x + (box.w - dw) * fx, box.y + (box.h - dh) * fy, dw, dh);
  ctx.filter = "none";
  ctx.restore();
  return true;
}

/** Colour grades for footage and photos (props.grade): mono is the hype-montage look. */
const GRADES: Record<string, string> = {
  mono: "grayscale(1) contrast(1.18) brightness(0.8)",
  dark: "brightness(0.68) saturate(0.9)",
  warm: "sepia(0.22) saturate(1.12) brightness(0.96)",
  cool: "saturate(0.82) hue-rotate(-8deg) brightness(0.92)",
};

interface Focus { x: number; y: number; w: number; h: number; at: number; label?: string; spotlight?: boolean; zoom?: number }
interface CursorPt { x: number; y: number; at: number; click?: boolean }

const screenshot: Template = (c) => {
  const { ctx, s, p, pal, t } = c;
  const u = s.u;
  const mediaId = p.video ?? p.image;
  const info = c.mediaInfo(mediaId);
  const frameNow = c.media(mediaId, mediaTime(c, mediaId, p));
  const img = frameNow ? frameNow.source : null;
  const ar = info ? info.width / info.height : img ? img.width / img.height : 16 / 10;
  const frameKind: "browser" | "phone" | "none" = p.frame ?? (ar < 0.8 ? "phone" : "browser");
  const hasText = !!(p.title || p.sub || p.kicker);
  // regions: text block and the device frame
  let textBox = { x: s.safe.x, y: s.safe.y, w: s.safe.w };
  let area = { x: s.safe.x, y: s.safe.y, w: s.safe.w, h: s.safe.h };
  const titleSize = (s.portrait ? 80 : s.landscape ? 80 : 62) * u;
  if (hasText) {
    if (s.landscape) {
      textBox = { x: s.safe.x, y: s.safe.y, w: s.safe.w * 0.32 };
      area = { x: s.safe.x + s.safe.w * 0.37, y: s.safe.y - 20 * u, w: s.safe.w * 0.63, h: s.safe.h + 40 * u };
    } else {
      const probe = D.layoutText(ctx, str(p.title), 0, 0, { maxWidth: s.safe.w, size: titleSize, weight: 500, maxLines: 3 });
      const th = (p.kicker ? 54 * u : 0) + (p.title ? probe.height + 22 * u : 0) + (p.sub ? 2 * 1.36 * titleSize * 0.42 + 10 * u : 0) + 56 * u;
      area = { x: s.safe.x, y: s.safe.y + th, w: s.safe.w, h: s.safe.h - th };
    }
  }
  const chrome = frameKind === "browser" ? 0.06 : 0;
  const bez = frameKind === "phone" ? 0.035 : 0;
  // frame size from the image aspect
  const fwOverH = frameKind === "browser" ? ar / (1 + chrome * ar) : frameKind === "phone" ? ar / (1 - 2 * bez + 2 * bez * ar) : ar;
  // Wide screenshots in tall or square videos are cropped into a bigger window and the camera
  // pans across them; shrinking a whole dashboard to phone width makes it unreadable.
  const crop = !s.landscape && frameKind !== "phone" && ar > 1.2 && p.crop !== false;
  let fw = area.w;
  let fh = fw / fwOverH;
  if (crop) fh = Math.min(area.h, fw / (s.portrait ? 0.86 : 1.18));
  if (fh > area.h) {
    fh = area.h;
    fw = fh * fwOverH;
  }
  if (frameKind === "phone") {
    fw = Math.min(fw, (s.landscape ? 520 : 720) * u);
    fh = fw / fwOverH;
  }
  const fx = area.x + (area.w - fw) / 2;
  const fy = s.landscape || !hasText ? area.y + (area.h - fh) / 2 : area.y;
  // text block: in landscape centre it vertically against the frame
  if (hasText) {
    const ty = s.landscape ? s.safe.y + s.safe.h / 2 - 160 * u : textBox.y;
    headerBlock(c, textBox.x, ty, textBox.w, { kicker: p.kicker, title: p.title, sub: p.sub, size: titleSize, start: 0.1, highlight: arr(p.highlight) });
  }
  // 3D tilt for product shots (glass and neon looks lean them by default); it flattens when the camera starts to zoom
  const tiltMode = p.tilt ?? (D.activeLook().tilt ? (s.landscape ? "left" : "back") : "none");
  const firstFocus = arr<Focus>(p.focus).reduce((m, f) => Math.min(m, +f.at || 0), Infinity);
  const flat = Number.isFinite(firstFocus) ? spCalm(t - (firstFocus - 0.45), 0.9) : 0;
  const tilt = D.tiltFor(tiltMode, spCalm(t - 0.1, 1.6), t, flat);
  const device = (ctx: Ctx) => {
    // frame entry
    const ep = sp(t - 0.15, 0.95);
    const radius = (frameKind === "phone" ? fw * 0.13 : 22 * u);
    ctx.save();
    ctx.globalAlpha *= clamp(ep * 1.4);
    ctx.translate(0, (1 - ep) * 70 * u);
    scaleAbout(ctx, fx + fw / 2, fy + fh / 2, 0.94 + 0.06 * ep);
    // device body
    let screen = { x: fx, y: fy, w: fw, h: fh, r: radius };
    if (frameKind === "browser") {
      D.card(ctx, fx, fy, fw, fh, radius, "#FFFFFF", u, { border: c.theme === "light" ? pal.cardBorder : undefined, elevation: 1.2, keepRadius: true });
      const bh = fw * chrome;
      ctx.fillStyle = UI.bar;
      ctx.save();
      D.rrect(ctx, fx, fy, fw, fh, radius);
      ctx.clip();
      ctx.fillRect(fx, fy, fw, bh);
      ctx.fillStyle = UI.line;
      ctx.fillRect(fx, fy + bh - 1, fw, Math.max(1, u * 1.5));
      ctx.restore();
      const dot = bh * 0.2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(fx + bh * 0.5 + i * dot * 2.6, fy + bh / 2, dot / 2, 0, Math.PI * 2);
        ctx.fillStyle = "#DADDE4";
        ctx.fill();
      }
      const url = str(p.url, "app.taxstreem.com");
      const us = bh * 0.34;
      const uw = Math.min(fw * 0.5, D.measure(ctx, url, us, 500) + bh * 1.4);
      D.rrect(ctx, fx + fw / 2 - uw / 2, fy + bh * 0.2, uw, bh * 0.6, bh * 0.3);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      D.icon(ctx, "lock", fx + fw / 2 - uw / 2 + bh * 0.28, fy + bh / 2 - us * 0.5, us, UI.quiet, 1, 2.2);
      D.text(ctx, url, fx + fw / 2 + bh * 0.18, fy + bh / 2 + us * 0.36, us, 500, UI.muted, "center");
      screen = { x: fx, y: fy + bh, w: fw, h: fh - bh, r: 0 };
    } else if (frameKind === "phone") {
      D.card(ctx, fx, fy, fw, fh, radius, "#0A0A0A", u, { elevation: 1.3, keepRadius: true, surface: D.activeLook().surface === "sticker" ? "sticker" : "solid" });
      const b = fw * bez;
      screen = { x: fx + b, y: fy + b, w: fw - 2 * b, h: fh - 2 * b, r: radius - b };
    } else {
      D.card(ctx, fx, fy, fw, fh, radius, "#FFFFFF", u, { border: c.theme === "light" ? pal.cardBorder : undefined, elevation: 1.2, keepRadius: true });
      screen = { x: fx, y: fy, w: fw, h: fh, r: radius };
    }
    // screen content with the camera: base size covers the screen, focus regions zoom in
    const bw = crop ? Math.max(screen.w, screen.h * ar) : screen.w;
    const bh = crop ? bw / ar : screen.h;
    const focus = arr<Focus>(p.focus).map((f) => ({ ...f, x: clamp(+f.x), y: clamp(+f.y), w: clamp(+f.w || 0.3, 0.02, 1), h: clamp(+f.h || 0.2, 0.02, 1), at: +f.at || 0 }));
    const zFor = (f: Focus) => clamp(f.zoom ?? Math.min((0.8 * screen.w) / (f.w * bw), (0.8 * screen.h) / (f.h * bh)), 1, 3.2);
    const clampC = (v: number, visible: number) => (visible >= 1 ? 0.5 : clamp(v, visible / 2, 1 - visible / 2));
    const view = p.view ?? {};
    const rest = { cx: clampC(view.x ?? 0.5, screen.w / bw), cy: clampC(view.y ?? 0.5, screen.h / bh) };
    const steps = (key: "cx" | "cy" | "z") =>
      focus.map((f) => {
        const zf = zFor(f);
        const v = key === "z" ? zf : key === "cx" ? clampC(f.x + f.w / 2, screen.w / (bw * zf)) : clampC(f.y + f.h / 2, screen.h / (bh * zf));
        return { at: f.at, to: v };
      });
    // macro: open right on one detail of the screen, then pull back to the whole thing (v04, v07)
    const mac = p.macro && typeof p.macro === "object" ? { x: clamp(+p.macro.x), y: clamp(+p.macro.y), w: clamp(+p.macro.w || 0.2, 0.02, 1), h: clamp(+p.macro.h || 0.12, 0.02, 1) } : null;
    const macOut = mac ? (Number.isFinite(+p.macro.out) ? +p.macro.out : 1.1) : 0;
    const macZ = mac ? clamp(Math.min((0.9 * screen.w) / (mac.w * bw), (0.9 * screen.h) / (mac.h * bh)), 1.5, 5) : 1;
    const macStart = mac ? { cx: clampC(mac.x + mac.w / 2, screen.w / (bw * macZ)), cy: clampC(mac.y + mac.h / 2, screen.h / (bh * macZ)) } : rest;
    const withMac = (key: "cx" | "cy" | "z") => (mac ? [{ at: macOut, to: key === "z" ? 1 : rest[key] }, ...steps(key).filter((q) => q.at > macOut)] : steps(key));
    const cx = springSteps(t, macStart.cx, withMac("cx"), 1.1 * M().settle);
    const cy = springSteps(t, macStart.cy, withMac("cy"), 1.1 * M().settle);
    const z = springSteps(t, macZ, withMac("z"), 1.1 * M().settle);
    const dw = bw * z;
    const dh = bh * z;
    const dx = screen.x + screen.w / 2 - cx * dw;
    const dy = screen.y + screen.h / 2 - cy * dh;
    const map = (nx: number, ny: number) => ({ x: dx + nx * dw, y: dy + ny * dh });
    let active = -1;
    focus.forEach((f, i) => {
      if (t >= f.at) active = i;
    });
    ctx.save();
    if (screen.r > 0) D.rrect(ctx, screen.x, screen.y, screen.w, screen.h, screen.r);
    else if (frameKind === "browser") {
      // round only the bottom corners
      ctx.beginPath();
      const r = radius;
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(screen.x + screen.w, screen.y);
      ctx.lineTo(screen.x + screen.w, screen.y + screen.h - r);
      ctx.arcTo(screen.x + screen.w, screen.y + screen.h, screen.x + screen.w - r, screen.y + screen.h, r);
      ctx.lineTo(screen.x + r, screen.y + screen.h);
      ctx.arcTo(screen.x, screen.y + screen.h, screen.x, screen.y + screen.h - r, r);
      ctx.closePath();
    } else ctx.rect(screen.x, screen.y, screen.w, screen.h);
    ctx.clip();
    ctx.fillStyle = UI.bar;
    ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
    if (img) ctx.drawImage(img, dx, dy, dw, dh);
    else if (!info) {
      c.warn(`Scene "${c.scene.id}": screenshot "${str(mediaId, "(none)")}" isn't uploaded yet.`);
      D.text(ctx, "Screenshot goes here", screen.x + screen.w / 2, screen.y + screen.h / 2, 34 * u, 500, UI.quiet, "center");
    }
    // spotlight: dim around the active focus region
    if (active >= 0 && focus[active].spotlight !== false && (focus[active].spotlight || focus[active].label)) {
      const f = focus[active];
      const next = focus[active + 1]?.at ?? Infinity;
      const sp = clamp(remap(t, f.at + 0.5, f.at + 0.9, 0, 1)) * clamp(remap(t, next - 0.4, next, 1, 0));
      if (sp > 0.01) {
        const a = map(f.x, f.y);
        const b = map(f.x + f.w, f.y + f.h);
        ctx.save();
        ctx.globalAlpha = 0.5 * sp;
        ctx.fillStyle = "#0A0A0A";
        const pad = 10 * u;
        const veil = new Path2D();
        veil.rect(screen.x, screen.y, screen.w, screen.h);
        veil.addPath(D.rrectPath(a.x - pad, a.y - pad, b.x - a.x + 2 * pad, b.y - a.y + 2 * pad, 16 * u));
        ctx.fill(veil, "evenodd");
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = sp;
        D.rrect(ctx, a.x - pad, a.y - pad, b.x - a.x + 2 * pad, b.y - a.y + 2 * pad, 16 * u);
        ctx.strokeStyle = pal.callout;
        ctx.lineWidth = 4 * u;
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    if (frameKind === "phone") {
      // dynamic island
      const iw = screen.w * 0.28;
      D.rrect(ctx, screen.x + screen.w / 2 - iw / 2, screen.y + screen.w * 0.03, iw, screen.w * 0.075, screen.w * 0.04);
      ctx.fillStyle = "#0A0A0A";
      ctx.fill();
    }
    // callout labels (drawn above the frame, may overflow it)
    focus.forEach((f, i) => {
      if (!f.label) return;
      const next = focus[i + 1]?.at ?? Infinity;
      const lp = sp(t - (f.at + 0.75), 0.6) * clamp(remap(t, next - 0.35, next, 1, 0));
      if (lp <= 0.01) return;
      const b = map(f.x + f.w, f.y + f.h);
      const a = map(f.x, f.y);
      const ls = (s.portrait ? 30 : 28) * u;
      const lw = D.measure(ctx, f.label, ls, 600) + 56 * u;
      const lh = ls * 2.1;
      const lx = clamp(a.x + (b.x - a.x) / 2 - lw / 2, screen.x + 12 * u, screen.x + screen.w - lw - 12 * u);
      let ly = b.y + 22 * u;
      if (ly + lh > screen.y + screen.h - 12 * u) ly = a.y - lh - 22 * u;
      ly = clamp(ly, screen.y + 12 * u, screen.y + screen.h - lh - 12 * u);
      ctx.save();
      ctx.globalAlpha *= clamp(lp * 1.3);
      scaleAbout(ctx, lx + lw / 2, ly + lh / 2, 0.9 + 0.1 * lp);
      D.card(ctx, lx, ly, lw, lh, lh / 2, pal.callout, u, { glow: true, elevation: 0.6, keepRadius: true });
      D.text(ctx, f.label, lx + lw / 2, ly + lh / 2 + ls * 0.36, ls, 600, pal.calloutFg, "center");
      ctx.restore();
    });
    // cursor
    const pts = arr<CursorPt>(p.cursor).map((q) => ({ x: clamp(+q.x), y: clamp(+q.y), at: +q.at || 0, click: q.click !== false }));
    if (pts.length) {
      const travel = 0.85;
      const start = { x: 0.92, y: 1.08 };
      const sx = springSteps(t, start.x, pts.map((q) => ({ at: q.at - travel, to: q.x })), travel * 1.1);
      const sy = springSteps(t, start.y, pts.map((q) => ({ at: q.at - travel, to: q.y })), travel * 1.1);
      const pos = map(sx, sy);
      const appear = clamp(remap(t, pts[0].at - travel - 0.1, pts[0].at - travel + 0.25, 0, 1));
      let press = 1;
      for (const q of pts) {
        if (!q.click) continue;
        const k = t - q.at;
        if (k > -0.06 && k < 0.6) {
          press = Math.min(press, 1 - 0.14 * clamp(1 - Math.abs(k - 0.04) / 0.12));
          if (k >= 0) {
            const rp = ease.outCubic(k / 0.6);
            const qp = map(q.x, q.y);
            ctx.save();
            ctx.globalAlpha = (1 - rp) * 0.9;
            ctx.strokeStyle = pal.callout;
            ctx.lineWidth = 5 * u;
            ctx.beginPath();
            ctx.arc(qp.x, qp.y, 14 * u + rp * 48 * u, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      if (appear > 0) D.cursor(ctx, pos.x, pos.y, 46 * u * press, appear);
    }
    ctx.restore();
  };
  D.tilted(ctx, s, { x: fx, y: fy, w: fw, h: fh }, tilt, device as (g: OffscreenCanvasRenderingContext2D) => void);
};

const features: Template = (c) => {
  const { ctx, s, p, pal, t, d } = c;
  const u = s.u;
  const items = arr<{ title: string; body?: string; icon?: string }>(p.items).slice(0, 6);
  if (!items.length) c.warn(`Scene "${c.scene.id}": add at least one item.`);
  const n = items.length || 1;
  const grid = s.landscape ? (n <= 3 ? { cols: n, rows: 1 } : n === 4 ? { cols: 2, rows: 2 } : { cols: 3, rows: 2 }) : s.square && n >= 4 ? { cols: 2, rows: Math.ceil(n / 2) } : { cols: 1, rows: n };
  const titleSize = (s.portrait ? 86 : s.landscape ? 88 : 68) * u;
  const hasHead = !!(p.title || p.kicker);
  const headProbe = p.title ? D.layoutText(ctx, str(p.title), 0, 0, { maxWidth: s.safe.w * (s.landscape ? 0.8 : 1), size: titleSize, weight: 500, maxLines: 3 }) : null;
  const headH = hasHead ? (p.kicker ? 54 * u : 0) + (headProbe ? headProbe.height : 0) + 60 * u : 0;
  const gap = 24 * u;
  const listMode = grid.cols === 1;
  const cardH = listMode ? Math.min(250 * u, (s.safe.h - headH - gap * (n - 1)) / n) : Math.min(s.landscape ? 420 * u : 360 * u, (s.safe.h - headH - gap * (grid.rows - 1)) / grid.rows);
  const cardW = (s.safe.w - gap * (grid.cols - 1)) / grid.cols;
  const totalH = headH + grid.rows * cardH + (grid.rows - 1) * gap;
  let y = s.safe.y + Math.max(0, (s.safe.h - totalH) * (s.portrait ? 0.42 : 0.5));
  let end = 0.1;
  if (hasHead) {
    const r = headerBlock(c, s.safe.x, y, s.safe.w * (s.landscape ? 0.8 : 1), { kicker: p.kicker, title: p.title, size: titleSize, highlight: arr(p.highlight) });
    end = r.end;
    y += headH;
  }
  const st = Math.min(0.16, Math.max(0.08, (d * 0.45) / n));
  items.forEach((it, i) => {
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    const x = s.safe.x + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    const delay = (hasHead ? end * 0.6 : 0.25) + i * st;
    const cp = sp(t - delay, 0.75);
    if (cp <= 0.001) return;
    ctx.save();
    ctx.globalAlpha *= clamp(cp * 1.4);
    ctx.translate(0, (1 - cp) * 46 * u);
    D.card(ctx, x, cy, cardW, cardH, 24 * u, pal.card, u, { border: c.theme === "blue" && D.activeLook().surface !== "outline" && D.activeLook().surface !== "glass" ? undefined : pal.cardBorder, elevation: c.theme === "dark" ? 0 : 0.8 });
    const pad = (listMode ? 34 : 38) * u;
    const tile = (listMode ? Math.min(96, cardH / u - 2 * 34) : 88) * u;
    const tx = x + pad;
    const ty = listMode ? cy + (cardH - tile) / 2 : cy + pad;
    D.rrect(ctx, tx, ty, tile, tile, 20 * u);
    ctx.fillStyle = pal.iconTile;
    ctx.fill();
    D.icon(ctx, it.icon || "circle-check", tx + tile * 0.24, ty + tile * 0.24, tile * 0.52, pal.iconFg, ease.outCubic((t - delay - 0.2) / 0.6), 2);
    const textX = listMode ? tx + tile + 30 * u : tx;
    const textW = listMode ? cardW - (textX - x) - pad : cardW - 2 * pad;
    const ts = (listMode ? (s.portrait ? 46 : 40) : s.landscape ? 44 : 38) * u;
    const tl = D.layoutText(ctx, str(it.title), textX, 0, { maxWidth: textW, size: ts, weight: 600, tracking: -0.01, maxLines: 2, lineHeight: 1.15 });
    checkOverflow(c, tl, `item ${i + 1} title`);
    const bl = it.body ? D.layoutText(ctx, str(it.body), textX, 0, { maxWidth: textW, size: ts * 0.74, weight: 400, tracking: -0.003, maxLines: listMode ? 2 : 4, lineHeight: 1.38 }) : null;
    const blockH = tl.height + (bl ? 10 * u + bl.height : 0);
    const textY = listMode ? cy + (cardH - blockH) / 2 : ty + tile + 30 * u;
    const tl2 = D.layoutText(ctx, str(it.title), textX, textY, { maxWidth: textW, size: tl.size, minSize: tl.size, weight: 600, tracking: -0.01, maxLines: 99, lineHeight: 1.15 });
    D.drawLayout(ctx, tl2, pal.cardFg);
    if (bl) {
      const bl2 = D.layoutText(ctx, str(it.body), textX, textY + tl.height + 10 * u, { maxWidth: textW, size: bl.size, minSize: bl.size, weight: 400, tracking: -0.003, maxLines: 99, lineHeight: 1.38 });
      withFade(ctx, ease.outCubic((t - delay - 0.15) / 0.5), 8 * u, () => D.drawLayout(ctx, bl2, pal.cardMuted));
    }
    ctx.restore();
  });
};

const steps: Template = (c) => {
  const { ctx, s, p, pal, t, d } = c;
  const u = s.u;
  const list = arr<{ title: string; body?: string }>(p.steps).slice(0, 5);
  const n = Math.max(1, list.length);
  const titleSize = (s.portrait ? 86 : s.landscape ? 88 : 68) * u;
  const hasHead = !!(p.title || p.kicker);
  const headProbe = p.title ? D.layoutText(ctx, str(p.title), 0, 0, { maxWidth: s.safe.w, size: titleSize, weight: 500, maxLines: 3 }) : null;
  const headH = hasHead ? (p.kicker ? 54 * u : 0) + (headProbe ? headProbe.height : 0) + 70 * u : 0;
  const intro = hasHead ? 0.7 : 0.3;
  const span = Math.max(0.5, (d - intro - 0.8) / n);
  const actAt = (i: number) => intro + i * span;
  const dot = (s.portrait ? 88 : 80) * u;
  const horizontal = s.landscape;
  const rowH = horizontal ? 0 : Math.min(280 * u, (s.safe.h - headH) / n);
  const totalH = headH + (horizontal ? 380 * u : rowH * n);
  let y = s.safe.y + Math.max(0, (s.safe.h - totalH) * (s.portrait ? 0.42 : 0.5));
  if (hasHead) {
    headerBlock(c, s.safe.x, y, s.safe.w, { kicker: p.kicker, title: p.title, size: titleSize, highlight: arr(p.highlight) });
    y += headH;
  }
  const accent = pal.accent;
  const track = pal.track;
  const centers = list.map((_, i) => (horizontal ? { x: s.safe.x + (s.safe.w / n) * (i + 0.5), y: y + dot / 2 } : { x: s.safe.x + dot / 2, y: y + i * rowH + dot / 2 }));
  // connecting track + progress
  if (n > 1) {
    const a = centers[0];
    const b = centers[n - 1];
    ctx.save();
    ctx.strokeStyle = track;
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const prog = clamp((springSteps(t, 0, list.map((_, i) => ({ at: actAt(i), to: i })), 0.7 * M().settle)) / (n - 1));
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(lerp(a.x, b.x, prog), lerp(a.y, b.y, prog));
    ctx.stroke();
    ctx.restore();
  }
  list.forEach((st, i) => {
    const ap = sp(t - actAt(i), 0.6);
    const appear = sp(t - (intro * 0.6 + i * 0.08), 0.6);
    const ctr = centers[i];
    const done = i < n - 1 && t > actAt(i + 1) + 0.2;
    ctx.save();
    ctx.globalAlpha *= clamp(appear * 1.4);
    // dot
    ctx.beginPath();
    ctx.arc(ctr.x, ctr.y, dot / 2, 0, Math.PI * 2);
    ctx.fillStyle = pal.dot;
    ctx.fill();
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = track;
    ctx.stroke();
    if (ap > 0.01) {
      ctx.beginPath();
      ctx.arc(ctr.x, ctr.y, (dot / 2) * (0.6 + 0.4 * ap), 0, Math.PI * 2);
      ctx.fillStyle = D.paint(ctx, accent, ctr.x - dot / 2, ctr.y, ctr.x + dot / 2, ctr.y);
      ctx.globalAlpha *= clamp(ap * 1.5);
      ctx.fill();
      ctx.globalAlpha /= clamp(ap * 1.5) || 1;
    }
    const numCol = ap > 0.5 ? pal.onAccent : pal.muted;
    if (done) D.icon(ctx, "check", ctr.x - dot * 0.26, ctr.y - dot * 0.26, dot * 0.52, numCol, ease.outCubic((t - actAt(i + 1) - 0.2) / 0.4), 3);
    else D.text(ctx, String(i + 1), ctr.x, ctr.y + dot * 0.17, dot * 0.46, 600, numCol, "center", 0, "head");
    ctx.restore();
    // text
    const ts = (s.portrait ? 50 : s.landscape ? 46 : 40) * u;
    const tx = horizontal ? ctr.x : ctr.x + dot / 2 + 34 * u;
    const tw = horizontal ? (s.safe.w / n) * 0.86 : s.safe.x + s.safe.w - tx;
    const ty = horizontal ? ctr.y + dot / 2 + 36 * u : ctr.y - ts * 0.62;
    const align = horizontal ? "center" : "left";
    const tl = D.layoutText(ctx, str(st.title), tx, ty, { maxWidth: tw, size: ts, weight: 600, tracking: -0.01, maxLines: 2, lineHeight: 1.15, align });
    checkOverflow(c, tl, `step ${i + 1} title`);
    const strong = ap > 0.5;
    withFade(ctx, Math.max(appear * 0.45, ap), 14 * u, () => {
      D.drawLayout(ctx, tl, pal.fg, undefined, strong ? 1 : 0.55);
      if (st.body) {
        const bl = D.layoutText(ctx, str(st.body), tx, ty + tl.height + 10 * u, { maxWidth: tw, size: ts * 0.72, weight: 400, maxLines: 3, lineHeight: 1.38, align });
        D.drawLayout(ctx, bl, pal.muted, undefined, strong ? 1 : 0.5);
      }
    });
  });
};

const chart: Template = (c) => {
  const { ctx, s, p, pal, t } = c;
  const u = s.u;
  const data = arr<{ label: string; value: number }>(p.data).slice(0, 10).map((x) => ({ label: str(x.label), value: Number(x.value) || 0 }));
  const n = Math.max(1, data.length);
  const kind = p.kind === "line" ? "line" : "bar";
  const titleSize = (s.portrait ? 84 : s.landscape ? 84 : 66) * u;
  const hasHead = !!(p.title || p.kicker);
  const headProbe = p.title ? D.layoutText(ctx, str(p.title), 0, 0, { maxWidth: s.safe.w, size: titleSize, weight: 500, maxLines: 3 }) : null;
  const headH = hasHead ? (p.kicker ? 54 * u : 0) + (headProbe ? headProbe.height : 0) + 60 * u : 0;
  const top = s.safe.y + (s.portrait ? s.safe.h * 0.06 : 0);
  if (hasHead) headerBlock(c, s.safe.x, top, s.safe.w, { kicker: p.kicker, title: p.title, size: titleSize, highlight: arr(p.highlight) });
  const area = { x: s.safe.x, y: top + headH + 70 * u, w: s.safe.w, h: Math.min(s.safe.h - headH - 150 * u, s.portrait ? 860 * u : 9999) };
  const max = Math.max(...data.map((x) => x.value), 1) * 1.08;
  const labelS = (s.portrait ? 32 : 32) * u;
  const valS = (s.portrait ? 42 : 40) * u;
  const baseY = area.y + area.h - labelS * 2.2;
  const plotH = baseY - area.y - valS * 1.8;
  const fmt = (v: number) => formatNumber(v, { prefix: str(p.prefix), suffix: str(p.suffix), compact: !!p.compact, decimals: Number(p.decimals) || 0 });
  const hi = p.highlight === undefined ? n - 1 : Number(p.highlight);
  const base = pal.chartBase;
  const strong = D.solid(pal.accent);
  // baseline
  ctx.fillStyle = pal.track;
  ctx.fillRect(area.x, baseY, area.w * ease.outCubic((t - 0.3) / 0.8), Math.max(1, 2 * u));
  const slot = area.w / n;
  if (kind === "bar") {
    const bw = Math.min(slot * 0.58, 150 * u);
    data.forEach((dv, i) => {
      const gp = sp(t - (0.55 + i * 0.09), 1.0);
      const h = (dv.value / max) * plotH * gp;
      const x = area.x + slot * i + (slot - bw) / 2;
      const isHi = i === hi;
      if (h > 0.5) {
        ctx.save();
        D.rrect(ctx, x, baseY - h, bw, h + 12 * u, 12 * u);
        ctx.clip();
        ctx.fillStyle = isHi ? D.paint(ctx, pal.highlight.startsWith("grad:") ? pal.highlight : strong, x, baseY - h, x, baseY) : base;
        ctx.fillRect(x, baseY - h, bw, h);
        ctx.restore();
      }
      withFade(ctx, clamp(gp * 1.2), 0, () => {
        D.text(ctx, fmt(dv.value * clamp(gp)), x + bw / 2, baseY - h - valS * 0.6, valS, 600, isHi ? pal.fg : pal.muted, "center", -0.01);
      });
      withFade(ctx, sp(t - (0.4 + i * 0.05), 0.6), 0, () => D.text(ctx, dv.label, x + bw / 2, baseY + labelS * 1.5, labelS, 500, pal.muted, "center"));
    });
  } else {
    const pts = data.map((dv, i) => ({ x: area.x + slot * i + slot / 2, y: baseY - (dv.value / max) * plotH }));
    const prog = ease.inOutCubic((t - 0.5) / 1.6);
    const reach = area.x + slot / 2 + (area.w - slot) * prog;
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.x - 10 * u, area.y - 40 * u, reach - area.x + 20 * u, area.h + 80 * u);
    ctx.clip();
    // area fill
    const g = ctx.createLinearGradient(0, area.y, 0, baseY);
    g.addColorStop(0, pal.areaTop);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.moveTo(pts[0].x, baseY);
    pts.forEach((q) => ctx.lineTo(q.x, q.y));
    ctx.lineTo(pts[pts.length - 1].x, baseY);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.strokeStyle = strong;
    ctx.lineWidth = 6 * u;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
    pts.forEach((q, i) => {
      const at = 0.5 + 1.6 * ((q.x - area.x - slot / 2) / Math.max(1, area.w - slot));
      const pp = sp(t - at, 0.5, 0.2);
      if (pp > 0.01) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, (i === hi ? 13 : 9) * u * pp, 0, Math.PI * 2);
        ctx.fillStyle = pal.point;
        ctx.fill();
        ctx.lineWidth = 5 * u;
        ctx.strokeStyle = strong;
        ctx.stroke();
        if (i === hi || n <= 6) withFade(ctx, pp, 0, () => D.text(ctx, fmt(data[i].value), q.x, q.y - 30 * u, valS, 600, i === hi ? pal.fg : pal.muted, "center", -0.01));
      }
      withFade(ctx, sp(t - (0.4 + i * 0.05), 0.6), 0, () => D.text(ctx, data[i].label, q.x, baseY + labelS * 1.5, labelS, 500, pal.muted, "center"));
    });
  }
  if (p.source) withFade(ctx, sp(t - 1.5, 0.6), 0, () => D.text(ctx, `Source: ${str(p.source)}`, area.x, area.y + area.h + 30 * u, 22 * u, 400, pal.muted));
};

const compare: Template = (c) => {
  const { ctx, s, p, pal, t } = c;
  const u = s.u;
  const left = p.left ?? {};
  const right = p.right ?? {};
  const titleSize = (s.portrait ? 84 : s.landscape ? 84 : 64) * u;
  const hasHead = !!(p.title || p.kicker);
  const headProbe = p.title ? D.layoutText(ctx, str(p.title), 0, 0, { maxWidth: s.safe.w, size: titleSize, weight: 500, maxLines: 3 }) : null;
  const headH = hasHead ? (p.kicker ? 54 * u : 0) + (headProbe ? headProbe.height : 0) + 56 * u : 0;
  const stacked = s.portrait;
  const gap = 28 * u;
  const li = arr<string>(left.items).slice(0, 5);
  const ri = arr<string>(right.items).slice(0, 5);
  const rows = Math.max(li.length, ri.length, 1);
  const itemS = (s.portrait ? 40 : s.landscape ? 40 : 32) * u;
  const cardH = stacked ? Math.min((s.safe.h - headH - gap) / 2, 120 * u + rows * itemS * 2.0) : Math.min(s.safe.h - headH, 150 * u + rows * itemS * 2.3);
  const cardW = stacked ? s.safe.w : (s.safe.w - gap) / 2;
  const totalH = headH + (stacked ? cardH * 2 + gap : cardH);
  let y = s.safe.y + Math.max(0, (s.safe.h - totalH) * (s.portrait ? 0.42 : 0.5));
  if (hasHead) {
    headerBlock(c, s.safe.x, y, s.safe.w, { kicker: p.kicker, title: p.title, size: titleSize, highlight: arr(p.highlight) });
    y += headH;
  }
  const boxes = stacked
    ? [{ x: s.safe.x, y }, { x: s.safe.x, y: y + cardH + gap }]
    : [{ x: s.safe.x, y }, { x: s.safe.x + cardW + gap, y }];
  const sides = [
    { d: left, items: li, good: false, at: hasHead ? 0.5 : 0.2 },
    { d: right, items: ri, good: true, at: (hasHead ? 0.5 : 0.2) + 0.45 + li.length * 0.12 },
  ];
  sides.forEach((side, k) => {
    const b = boxes[k];
    const cp = sp(t - side.at, 0.8);
    if (cp <= 0.001) return;
    const fill = side.good ? pal.goodFill : pal.softCard;
    const fg = side.good ? pal.goodFg : pal.fg;
    const muted = side.good ? pal.goodMuted : pal.muted;
    ctx.save();
    ctx.globalAlpha *= clamp(cp * 1.4);
    ctx.translate(stacked ? 0 : (1 - cp) * 40 * u * (k ? 1 : -1), stacked ? (1 - cp) * 50 * u : 0);
    scaleAbout(ctx, b.x + cardW / 2, b.y + cardH / 2, side.good ? 0.96 + 0.04 * cp : 1);
    D.card(ctx, b.x, b.y, cardW, cardH, 28 * u, fill, u, { border: !side.good && c.theme === "light" ? pal.cardBorder : undefined, elevation: side.good ? 1.1 : 0, glow: side.good && c.theme !== "blue" });
    const pad = 40 * u;
    D.text(ctx, str(side.d.title, side.good ? "With TaxStreem" : "Without"), b.x + pad, b.y + pad + itemS * 0.95, itemS * 1.08, 600, fg, "left", -0.01, "head");
    side.items.forEach((it, i) => {
      const ip = sp(t - (side.at + 0.3 + i * 0.12), 0.6);
      const iy = b.y + pad + itemS * 2.3 + i * itemS * (stacked ? 1.75 : 2.0);
      withFade(ctx, ip, 10 * u, () => {
        D.icon(ctx, side.good ? "circle-check" : "circle-x", b.x + pad, iy - itemS * 0.86, itemS * 1.05, side.good ? pal.goodIcon : pal.quiet, ease.outCubic((ip - 0.3) / 0.7), 2);
        const tl = D.layoutText(ctx, it, b.x + pad + itemS * 1.6, iy - itemS * 0.8, { maxWidth: cardW - pad * 2 - itemS * 1.6, size: itemS, weight: side.good ? 500 : 400, maxLines: 1, tracking: -0.005, role: "body" });
        D.drawLayout(ctx, tl, side.good ? fg : muted);
      });
    });
    ctx.restore();
  });
};

const deadline: Template = (c) => {
  const { ctx, s, p, pal, t } = c;
  const u = s.u;
  const cw = (s.portrait ? 420 : s.landscape ? 400 : 340) * u;
  const ch = cw * 1.02;
  const side = s.landscape;
  const titleSize = (s.portrait ? 84 : s.landscape ? 80 : 64) * u;
  const textW = side ? s.safe.w - cw - 110 * u : s.safe.w;
  const probe = D.layoutText(ctx, str(p.title), 0, 0, { maxWidth: textW, size: titleSize, weight: 500, maxLines: 3 });
  const subH = p.sub ? 2 * 1.36 * titleSize * 0.46 + 24 * u : 0;
  const pillH = p.countdown ? 80 * u + 40 * u : 0;
  const textH = (p.kicker ? 54 * u : 0) + probe.height + 30 * u + subH + pillH;
  const total = side ? Math.max(ch, textH) : ch + 80 * u + textH;
  const top = s.safe.y + (s.safe.h - total) * (s.portrait ? 0.42 : 0.5);
  const cx = side ? s.safe.x + cw / 2 + 20 * u : s.W / 2;
  const cy = side ? top + total / 2 - ch / 2 : top;
  // pulse rings behind the card
  for (let k = 0; k < 2; k++) {
    const ph = ((t - 0.9 - k * 0.7) % 1.4 + 1.4) % 1.4 / 1.4;
    if (t < 0.9 + k * 0.7) continue;
    ctx.save();
    ctx.globalAlpha = (1 - ph) * 0.35;
    ctx.strokeStyle = D.solid(pal.accent);
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.arc(cx, cy + ch / 2, cw * (0.62 + ph * 0.35), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const ep = sp(t - 0.1, 0.9, 0.12);
  ctx.save();
  ctx.globalAlpha *= clamp(ep * 1.5);
  ctx.translate(cx, cy + ch / 2 + (1 - ep) * 80 * u);
  ctx.rotate((1 - ep) * -0.12);
  ctx.translate(-cx, -(cy + ch / 2));
  const x0 = cx - cw / 2;
  const C = D.activeColors();
  const cal = {
    head: D.brandColors() ? D.BRAND.primary : D.solid(pal.callout),
    headFg: D.brandColors() ? "#FFFFFF" : pal.calloutFg,
    ring: D.BRAND.ink900,
    ink: D.brandColors() ? D.BRAND.blackout : C.ink,
    muted: D.BRAND.ink500,
  };
  D.card(ctx, x0, cy, cw, ch, 36 * u, "#FFFFFF", u, { elevation: 1.4, border: c.theme === "light" ? pal.cardBorder : undefined });
  const hh = ch * 0.26;
  ctx.save();
  D.rrect(ctx, x0, cy, cw, ch, D.radius(36 * u));
  ctx.clip();
  ctx.fillStyle = cal.head;
  ctx.fillRect(x0, cy, cw, hh);
  ctx.restore();
  D.text(ctx, str(p.month, "MONTH").toUpperCase(), cx, cy + hh * 0.66, hh * 0.36, 600, cal.headFg, "center", 0.16);
  // binder rings
  for (const rx of [-0.28, 0.28]) {
    D.rrect(ctx, cx + rx * cw - 9 * u, cy - 22 * u, 18 * u, 44 * u, 9 * u);
    ctx.fillStyle = cal.ring;
    ctx.fill();
  }
  // day number flips in
  const fp = sp(t - 0.55, 0.7);
  ctx.save();
  const dy = cy + hh + (ch - hh) / 2;
  ctx.translate(cx, dy);
  ctx.scale(1, Math.max(0.001, fp));
  ctx.translate(-cx, -dy);
  D.text(ctx, str(p.day, "21"), cx, dy + (ch - hh) * 0.2, (ch - hh) * 0.6, 600, cal.ink, "center", -0.04, "display");
  ctx.restore();
  if (p.year) D.text(ctx, str(p.year), cx, cy + ch - 26 * u, 24 * u, 500, cal.muted, "center", 0.1);
  ctx.restore();
  // text
  const align: "left" | "center" = side ? "left" : "center";
  const tx = side ? s.safe.x + cw + 110 * u : s.W / 2;
  let ty = side ? top + total / 2 - textH / 2 : cy + ch + 80 * u;
  const r = headerBlock(c, tx, ty, textW, { kicker: p.kicker, title: p.title, sub: p.sub, size: titleSize, align, start: 0.45, highlight: arr(p.highlight) });
  ty = r.bottom + 30 * u;
  if (p.countdown) {
    const pp = sp(t - (r.end + 0.35), 0.6, 0.15);
    withFade(ctx, pp, 0, () => {
      const h = 80 * u;
      const ls = h * 0.4;
      const tw = D.measure(ctx, str(p.countdown), ls, 600);
      const w = tw + h * 1.5;
      const px = align === "center" ? tx - w / 2 : tx;
      ctx.save();
      scaleAbout(ctx, px + w / 2, ty + h / 2, 0.85 + 0.15 * pp);
      D.rrect(ctx, px, ty, w, h, h / 2);
      ctx.fillStyle = D.paint(ctx, pal.accent, px, 0, px + w, 0);
      ctx.fill();
      const fg = pal.onAccent;
      D.icon(ctx, "timer", px + h * 0.32, ty + h * 0.27, h * 0.46, fg, 1, 2.2);
      D.text(ctx, str(p.countdown), px + h * 0.95, ty + h / 2 + ls * 0.36, ls, 600, fg);
      ctx.restore();
    });
  }
};

const quote: Template = (c) => {
  const { ctx, s, p, pal, t } = c;
  const u = s.u;
  const maxW = s.landscape ? s.safe.w * 0.78 : s.safe.w;
  const x = s.landscape ? s.safe.x + s.safe.w * 0.11 : s.safe.x;
  const size = (s.portrait ? 76 : s.landscape ? 80 : 64) * u;
  const probe = D.layoutText(ctx, str(p.text), x, 0, { maxWidth: maxW, size, weight: 500, maxLines: s.portrait ? 9 : 6, lineHeight: 1.18, highlight: arr(p.highlight) });
  checkOverflow(c, probe, "quote");
  const qS = size * 2.6;
  const total = qS * 0.55 + probe.height + (p.author ? 140 * u : 0);
  let y = s.safe.y + (s.safe.h - total) * (s.portrait ? 0.42 : 0.5);
  const qp = sp(t - 0.05, 0.7);
  withFade(ctx, qp, 30 * u, () => D.text(ctx, "“", x - qS * 0.06, y + qS * 0.78, qS, 600, c.theme === "blue" ? "rgba(255,255,255,0.9)" : pal.accent, "left", 0, "display"));
  y += qS * 0.55;
  const l = D.layoutText(ctx, str(p.text), x, y, { maxWidth: maxW, size: probe.size, minSize: probe.size, weight: 500, maxLines: 99, lineHeight: 1.18, highlight: arr(p.highlight) });
  const end = typeWords(c, l, 0.3, { color: pal.fg, hl: pal.highlight === pal.fg ? undefined : pal.highlight, per: Math.min(0.05, 1.8 / Math.max(1, l.words.length)) });
  y += l.height + 60 * u;
  if (p.author) {
    const ap = sp(t - end - 0.1, 0.7);
    withFade(ctx, ap, 16 * u, () => {
      const r = 34 * u;
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.fillStyle = pal.tint;
      ctx.fill();
      const initials = str(p.author).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      D.text(ctx, initials, x + r, y + r + 10 * u, 28 * u, 600, pal.tintFg, "center", 0, "head");
      D.text(ctx, str(p.author), x + r * 2 + 24 * u, y + r - 4 * u, 34 * u, 600, pal.fg);
      if (p.role) D.text(ctx, str(p.role), x + r * 2 + 24 * u, y + r + 36 * u, 28 * u, 400, pal.muted);
    });
  }
};

const cta: Template = (c) => {
  const { ctx, s, p, pal, t, d } = c;
  const u = s.u;
  const cx = s.W / 2;
  const showLogo = p.logo !== false;
  const logoH = (s.portrait ? 74 : s.landscape ? 70 : 62) * u;
  const headS = (s.portrait ? 96 : s.landscape ? 92 : 78) * u;
  const head = p.headline ? D.layoutText(ctx, str(p.headline), cx, 0, { maxWidth: s.safe.w * (s.landscape ? 0.78 : 1), size: headS, weight: 500, maxLines: 3, align: "center", highlight: arr(p.highlight) }) : null;
  if (head) checkOverflow(c, head, "headline");
  const subS = 40 * u;
  const sub = p.sub ? D.layoutText(ctx, str(p.sub), cx, 0, { maxWidth: s.safe.w * 0.9, size: subS, weight: 400, maxLines: 3, align: "center", lineHeight: 1.36 }) : null;
  const pillH = (s.portrait ? 116 : 104) * u;
  const total = (showLogo ? logoH + 90 * u : 0) + (head ? head.height + 40 * u : 0) + (sub ? sub.height + 56 * u : 0) + pillH + (p.url !== "" ? 90 * u : 0);
  let y = s.safe.y + (s.safe.h - total) * (s.portrait ? 0.44 : 0.5);
  let at = 0.1;
  if (showLogo) {
    const lw = D.logoWidth(logoH);
    const mp = sp(t - 0.1, 0.9);
    const wp = ease.outExpo((t - 0.45) / 0.9);
    const variant = pal.logo === "dark" ? "brand" : "white";
    // mark slides together, then the wordmark wipes in from behind it
    const markW = D.markWidth(logoH);
    ctx.save();
    ctx.globalAlpha *= clamp(mp * 1.5);
    ctx.beginPath();
    ctx.rect(cx - lw / 2 - 20 * u, y - 20 * u, markW + 40 * u + (lw - markW) * wp, logoH + 40 * u);
    ctx.clip();
    D.logo(ctx, cx - lw / 2, y, logoH, variant);
    ctx.restore();
    y += logoH + 90 * u;
    at = 0.6;
  }
  let end = at;
  if (head) {
    const l = D.layoutText(ctx, str(p.headline), cx, y, { maxWidth: s.safe.w * (s.landscape ? 0.78 : 1), size: head.size, minSize: head.size, weight: 500, maxLines: 99, align: "center", highlight: arr(p.highlight) });
    const col = headColors(c, arr(p.highlight).length > 0);
    end = riseWords(c, l, at, { color: col.color, hl: col.hl, dimAlpha: col.dimAlpha });
    y += l.height + 40 * u;
  }
  if (sub) {
    const l = D.layoutText(ctx, str(p.sub), cx, y, { maxWidth: s.safe.w * 0.9, size: sub.size, minSize: sub.size, weight: 400, maxLines: 99, align: "center", lineHeight: 1.36 });
    withFade(ctx, sp(t - end - 0.05, 0.7), 16 * u, () => D.drawLayout(ctx, l, pal.muted));
    y += l.height + 56 * u;
  }
  const pp = sp(t - end - 0.25, 0.7, 0.18);
  // a cursor can fly in and press the button near the end
  const clickAt = p.click ? Math.max(end + 1.2, d - 1.1) : Infinity;
  const press = 1 - 0.06 * clamp(1 - Math.abs(t - clickAt) / 0.12);
  withFade(ctx, pp, 0, () => {
    D.pill(ctx, cx, y, pillH, str(p.cta, "Start now"), pal.pillFill, pal.pillFg, { align: "center", glow: true, u, scale: (0.86 + 0.14 * pp) * press });
  });
  if (p.click) {
    const tx = cx + 60 * u;
    const ty = y + pillH * 0.62;
    const mv = ease.inOutCubic((t - (clickAt - 0.9)) / 0.85);
    if (mv > 0) {
      const px = lerp(s.W * 0.88, tx, mv);
      const py = lerp(s.H * 0.92, ty, mv);
      if (t >= clickAt) {
        const rp = ease.outCubic((t - clickAt) / 0.6);
        ctx.save();
        ctx.globalAlpha = (1 - rp) * 0.8;
        ctx.strokeStyle = pal.ripple;
        ctx.lineWidth = 5 * u;
        ctx.beginPath();
        ctx.arc(tx, ty, 16 * u + rp * 60 * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      D.cursor(ctx, px, py, 50 * u * press, clamp(mv * 3));
    }
  }
  y += pillH;
  if (p.url !== "") {
    withFade(ctx, sp(t - end - 0.55, 0.7), 10 * u, () => D.text(ctx, str(p.url, "taxstreem.com"), cx, y + 64 * u, 32 * u, 500, pal.muted, "center", 0.01));
  }
};

const logoSting: Template = (c) => {
  const { ctx, s, p, pal, t } = c;
  const u = s.u;
  const logoH = (s.portrait ? 96 : s.landscape ? 104 : 86) * u;
  const lw = D.logoWidth(logoH);
  const markW = D.markWidth(logoH);
  const cx = s.W / 2;
  const cy = s.H / 2 - (p.tagline ? 40 * u : 0);
  const mp = sp(t - 0.1, 0.9);
  const variant = pal.logo === "dark" ? "brand" : "white";
  const color = pal.markColor;
  // phase 1: mark assembles at centre; phase 2: slides left as the wordmark wipes in
  const slide = ease.inOutQuart((t - 0.75) / 0.8);
  const markX = lerp(cx - markW / 2, cx - lw / 2, slide);
  if (slide < 1) {
    ctx.save();
    ctx.globalAlpha *= 1 - clamp((slide - 0.85) / 0.15);
    D.mark(ctx, markX, cy - logoH / 2, logoH, color, clamp(mp * 1.6), mp);
    ctx.restore();
  }
  if (slide > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - lw / 2 - 10 * u, cy - logoH, (markW + 20 * u) + (lw - markW) * slide, logoH * 2);
    ctx.clip();
    ctx.globalAlpha *= clamp(slide * 3);
    D.logo(ctx, cx - lw / 2, cy - logoH / 2, logoH, variant);
    ctx.restore();
  }
  if (p.tagline) {
    withFade(ctx, sp(t - 1.4, 0.8), 16 * u, () => D.text(ctx, str(p.tagline), cx, cy + logoH + 46 * u, (s.portrait ? 40 : 38) * u, 400, pal.muted, "center", -0.005));
  }
};

// ---------------------------------------------------------------- media templates

/** A palette for text laid over photos and video: light text on a dark scrim, or dark on light. */
function overlayPalette(c: SceneCtx, overlay: string): Palette {
  if (overlay === "light") return D.palette("light");
  const dark = D.palette("dark");
  return { ...dark, fg: "#FFFFFF", muted: "rgba(255,255,255,0.86)" };
}

function scrim(ctx: Ctx, s: Stage, overlay: string, position: string, box = { x: 0, y: 0, w: s.W, h: s.H }) {
  if (overlay === "none") return;
  const C = D.activeColors();
  if (overlay === "brand") {
    ctx.fillStyle = D.solid(D.palette("blue").bg);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;
  }
  const light = overlay === "light";
  const base = light ? "255,255,255" : "8,10,14";
  const g =
    position === "top"
      ? ctx.createLinearGradient(0, box.y, 0, box.y + box.h)
      : position === "center"
        ? null
        : ctx.createLinearGradient(0, box.y + box.h, 0, box.y);
  if (g) {
    g.addColorStop(0, `rgba(${base},${light ? 0.92 : 0.82})`);
    g.addColorStop(0.45, `rgba(${base},${light ? 0.55 : 0.4})`);
    g.addColorStop(1, `rgba(${base},0)`);
    ctx.fillStyle = g;
  } else ctx.fillStyle = `rgba(${base},${light ? 0.6 : 0.56})`;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  void C;
}

/** Full-bleed photo or video with a slow camera and optional headline over a scrim. */
const media: Template = (c) => {
  const { ctx, s, p, t, d } = c;
  const u = s.u;
  const id = p.media ?? p.video ?? p.image;
  const info = c.mediaInfo(id);
  const position: string = p.position ?? "bottom";
  const hasText = !!(p.headline || p.kicker || p.sub);
  const overlay: string = p.overlay ?? (hasText ? "dark" : "none");
  const framed = p.frame === "card";
  const ep = spCalm(t, 1.1);
  const box = framed ? { x: s.safe.x, y: s.safe.y, w: s.safe.w, h: s.safe.h * (hasText && !s.landscape ? 0.62 : 1) } : { x: 0, y: 0, w: s.W, h: s.H };
  const k = clamp(t / Math.max(1, d));
  const motion = p.motion ?? (info?.video ? "none" : "in");
  ctx.save();
  if (framed) {
    ctx.globalAlpha *= clamp(ep * 1.4);
    ctx.translate(0, (1 - ep) * 50 * u);
    D.card(ctx, box.x, box.y, box.w, box.h, 34 * u, c.pal.card, u, { elevation: 1.2 });
  } else {
    scaleAbout(ctx, s.W / 2, s.H / 2, 1.04 - 0.04 * ep);
  }
  drawMedia(c, ctx, id, p, box, { r: framed ? D.radius(34 * u) : 0, motion, k: ease.smooth(k), focus: p.focus, fit: p.fit });
  if (!framed) scrim(ctx, s, overlay, position);
  ctx.restore();
  if (!hasText) return;
  const pal = framed ? c.pal : overlayPalette(c, overlay);
  const cc: SceneCtx = { ...c, pal };
  const align: "left" | "center" = p.align ?? (position === "center" ? "center" : "left");
  const maxW = s.landscape ? s.safe.w * 0.62 : s.safe.w;
  const x = align === "center" ? s.W / 2 : s.safe.x;
  const size = (s.portrait ? 92 : s.landscape ? 96 : 76) * u;
  const probe = D.layoutText(ctx, str(p.headline), x, 0, { maxWidth: maxW, size, weight: 500, maxLines: 4, lineHeight: 1.05 });
  const blockH = (p.kicker ? 58 * u : 0) + (p.headline ? probe.height + 22 * u : 0) + (p.sub ? size * 0.44 * 1.36 * 2 + 10 * u : 0);
  const y = framed
    ? box.y + box.h + 56 * u
    : position === "top"
      ? s.safe.y
      : position === "center"
        ? s.safe.y + (s.safe.h - blockH) / 2
        : s.safe.y + s.safe.h - blockH;
  headerBlock(cc, x, y, maxW, { kicker: p.kicker, title: p.headline, sub: p.sub, size, align, start: 0.35, highlight: arr(p.highlight) });
};

/** Media on one side, text on the other (stacked in 9:16). */
const split: Template = (c) => {
  const { ctx, s, p, pal, t, d } = c;
  const u = s.u;
  const id = p.media ?? p.video ?? p.image;
  const info = c.mediaInfo(id);
  const bleed = p.frame === "bleed";
  const right = p.side === "right";
  const stacked = s.portrait;
  const gap = (s.landscape ? 90 : 60) * u;
  let mbox: { x: number; y: number; w: number; h: number };
  let tbox: { x: number; y: number; w: number; h: number };
  if (stacked) {
    const mh = s.safe.h * (p.bullets?.length ? 0.5 : 0.56);
    mbox = bleed ? { x: 0, y: 0, w: s.W, h: s.safe.y + mh } : { x: s.safe.x, y: s.safe.y, w: s.safe.w, h: mh };
    tbox = { x: s.safe.x, y: s.safe.y + mh + gap, w: s.safe.w, h: s.safe.h - mh - gap };
  } else {
    const mw = s.safe.w * (s.landscape ? 0.5 : 0.48);
    const mx = right ? s.safe.x + s.safe.w - mw : s.safe.x;
    mbox = bleed ? { x: right ? s.W / 2 : 0, y: 0, w: s.W / 2, h: s.H } : { x: mx, y: s.safe.y, w: mw, h: s.safe.h };
    const tx = bleed ? (right ? s.safe.x : s.W / 2 + gap * 0.6) : right ? s.safe.x : mx + mw + gap;
    const tw = bleed ? s.W / 2 - gap * 0.6 - s.safe.x : s.safe.w - mw - gap;
    tbox = { x: tx, y: s.safe.y, w: tw, h: s.safe.h };
  }
  // media
  const ep = sp(t - 0.05, 0.9);
  const k = clamp(t / Math.max(1, d));
  const tiltMode = p.tilt ?? (D.activeLook().tilt && !bleed ? (right ? "right" : "left") : "none");
  const tilt = D.tiltFor(stacked && tiltMode !== "none" ? "back" : tiltMode, spCalm(t - 0.05, 1.5), t);
  const r = bleed ? 0 : 32 * u;
  D.tilted(ctx, s, mbox, tilt, (g) => {
    g.save();
    g.globalAlpha *= clamp(ep * 1.4);
    const dx = stacked ? 0 : (1 - ep) * (right ? 60 : -60) * u;
    const dy = stacked ? (1 - ep) * 60 * u : 0;
    g.translate(dx, dy);
    if (!bleed) D.card(g, mbox.x, mbox.y, mbox.w, mbox.h, r, pal.card, u, { elevation: 1.2 });
    drawMedia(c, g, id, p, mbox, { r: bleed ? 0 : D.radius(r), motion: p.motion ?? (info?.video ? "none" : "in"), k: ease.smooth(k), focus: p.focus, fit: p.fit });
    g.restore();
  });
  // text
  const titleS = (s.portrait ? 76 : s.landscape ? 78 : 58) * u;
  const bullets = arr<string>(p.bullets).slice(0, 4);
  const bS = (s.portrait ? 38 : s.landscape ? 36 : 30) * u;
  const probe = D.layoutText(ctx, str(p.title), tbox.x, 0, { maxWidth: tbox.w, size: titleS, weight: 500, maxLines: 4 });
  const subH = p.sub ? titleS * 0.42 * 1.36 * 2.2 : 0;
  const blockH = (p.kicker ? 54 * u : 0) + (p.title ? probe.height + 22 * u : 0) + subH + bullets.length * bS * 1.9 + (p.cta ? 140 * u : 0);
  const y0 = stacked ? tbox.y : tbox.y + Math.max(0, (tbox.h - blockH) / 2);
  const hb = headerBlock(c, tbox.x, y0, tbox.w, { kicker: p.kicker, title: p.title, sub: p.sub, size: titleS, start: 0.35, highlight: arr(p.highlight) });
  let y = hb.bottom + 18 * u;
  bullets.forEach((b, i) => {
    const bp = sp(t - (hb.end + 0.15 + i * 0.16 * M().stagger), 0.6);
    withFade(ctx, bp, 12 * u, () => {
      D.icon(ctx, "circle-check", tbox.x, y, bS, pal.accent, ease.outCubic(bp), 2);
      const l = D.layoutText(ctx, b, tbox.x + bS * 1.5, y - bS * 0.05, { maxWidth: tbox.w - bS * 1.5, size: bS, weight: 400, maxLines: 2, lineHeight: 1.25 });
      D.drawLayout(ctx, l, pal.fg);
    });
    y += bS * 1.9;
  });
  if (p.cta) {
    const ph = 96 * u;
    withFade(ctx, sp(t - (hb.end + 0.3 + bullets.length * 0.16), 0.7), 16 * u, () => D.pill(ctx, tbox.x, y + 24 * u, ph, str(p.cta), pal.pillFill, pal.pillFg, { glow: true, u }));
  }
};

/** Up to five photos or clips in a collage that slides together, with a headline. */
const collage: Template = (c) => {
  const { ctx, s, p, pal, t, d } = c;
  const u = s.u;
  const items = arr<{ media?: string; image?: string; video?: string; caption?: string; start?: number; focus?: { x: number; y: number } }>(p.items).slice(0, 5);
  const n = Math.max(1, items.length);
  const hasHead = !!(p.headline || p.kicker);
  const headTop = p.position !== "bottom";
  const headS = (s.portrait ? 96 : s.landscape ? 100 : 76) * u;
  const headW = s.landscape ? s.safe.w * 0.36 : s.safe.w;
  const probe = hasHead ? D.layoutText(ctx, str(p.headline), 0, 0, { maxWidth: headW, size: headS, weight: 500, maxLines: s.landscape ? 5 : 3 }) : null;
  const headH = hasHead ? (p.kicker ? 58 * u : 0) + (probe?.height ?? 0) + 50 * u : 0;
  const gap = 22 * u;
  let area = { x: s.safe.x, y: s.safe.y + (headTop ? headH : 0), w: s.safe.w, h: s.safe.h - headH };
  if (s.landscape && hasHead) area = { x: s.safe.x + headW + 70 * u, y: s.safe.y - 30 * u, w: s.safe.w - headW - 70 * u, h: s.safe.h + 60 * u };
  // tile rectangles in fractions of the area
  const L: number[][] =
    n === 1 ? [[0, 0, 1, 1]]
    : n === 2 ? [[0, 0, 0.5, 1], [0.5, 0.12, 0.5, 0.88]]
    : n === 3 ? [[0, 0, 0.58, 0.62], [0.58, 0.1, 0.42, 0.52], [0.18, 0.62, 0.64, 0.38]]
    : n === 4 ? [[0, 0, 0.5, 0.55], [0.5, 0.08, 0.5, 0.5], [0, 0.55, 0.5, 0.45], [0.5, 0.58, 0.5, 0.42]]
    : [[0, 0, 0.5, 0.4], [0.5, 0.06, 0.5, 0.36], [0, 0.4, 0.5, 0.32], [0.5, 0.42, 0.5, 0.3], [0.18, 0.72, 0.64, 0.28]];
  const st = Math.min(0.22, (d * 0.35) / n) * M().stagger;
  const sticker = D.activeLook().surface === "sticker";
  items.forEach((it, i) => {
    const f = L[i];
    const b = { x: area.x + f[0] * area.w + gap / 2, y: area.y + f[1] * area.h + gap / 2, w: f[2] * area.w - gap, h: f[3] * area.h - gap };
    const at = 0.15 + i * st;
    const q = sp(t - at, 0.85, 0.12);
    if (q <= 0.001) return;
    const fromLeft = i % 2 === 0;
    const rot = (sticker ? (fromLeft ? -0.03 : 0.025) : 0) * clamp(q);
    ctx.save();
    ctx.globalAlpha *= clamp(q * 1.6);
    ctx.translate(b.x + b.w / 2 + (1 - q) * (fromLeft ? -120 : 120) * u, b.y + b.h / 2 + (1 - q) * 40 * u);
    ctx.rotate(rot + (1 - q) * (fromLeft ? -0.08 : 0.08));
    ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    const r = 30 * u;
    D.card(ctx, b.x, b.y, b.w, b.h, r, pal.card, u, { elevation: 1 });
    const id = it.media ?? it.video ?? it.image;
    drawMedia(c, ctx, id, it, b, { r: D.radius(r), motion: c.mediaInfo(id)?.video ? "none" : i % 2 ? "out" : "in", k: ease.smooth(t / Math.max(1, d)), focus: it.focus, at: mediaTime(c, id, it, t - at) });
    if (it.caption) {
      const cs = (s.portrait ? 28 : 26) * u;
      const cw = D.measure(ctx, it.caption, cs, 600) + 44 * u;
      const ch = cs * 2;
      const cp = sp(t - at - 0.35, 0.6, 0.2);
      withFade(ctx, cp, 10 * u, () => {
        D.card(ctx, b.x + 18 * u, b.y + b.h - ch - 18 * u, cw, ch, ch / 2, pal.pillFill, u, { elevation: 0.4, keepRadius: true });
        D.text(ctx, it.caption!, b.x + 18 * u + cw / 2, b.y + b.h - 18 * u - ch / 2 + cs * 0.36, cs, 600, pal.pillFg, "center");
      });
    }
    ctx.restore();
  });
  if (hasHead) {
    const hy = s.landscape ? s.safe.y + (s.safe.h - headH) / 2 : headTop ? s.safe.y : s.safe.y + s.safe.h - headH + 40 * u;
    headerBlock(c, s.safe.x, hy, headW, { kicker: p.kicker, title: p.headline, size: headS, start: 0.25 + n * st * 0.5, highlight: arr(p.highlight), maxLines: s.landscape ? 5 : 3 });
  }
};

/** Icon tiles (or logos) that pop in as a row, grid or slow orbit. */
const icons: Template = (c) => {
  const { ctx, s, p, pal, t, d } = c;
  const u = s.u;
  const items = arr<{ icon?: string; image?: string; label?: string; highlight?: boolean }>(p.items).slice(0, 8);
  const n = Math.max(1, items.length);
  const layout: string = p.layout ?? (n <= 4 ? "row" : "grid");
  const hasHead = !!(p.title || p.kicker);
  const titleS = (s.portrait ? 82 : s.landscape ? 84 : 64) * u;
  const st = Math.min(0.12, (d * 0.3) / n) * M().stagger;
  const look = D.activeLook();
  const drawTile = (it: (typeof items)[number], i: number, cx: number, cy: number, size: number, q: number) => {
    if (q <= 0.001) return;
    const float = Math.sin(t * 1.1 + i * 1.7) * 6 * u * clamp(t - 1.2);
    ctx.save();
    ctx.globalAlpha *= clamp(q * 1.5);
    scaleAbout(ctx, cx, cy, 0.4 + 0.6 * q);
    ctx.translate(0, float);
    const hi = !!it.highlight;
    const fill = hi ? D.solid(pal.accent) : look.surface === "glass" ? pal.card : pal.card;
    D.card(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.26, fill, u, { elevation: 0.9, border: pal.cardBorder, glow: hi });
    const img = it.image ? c.media(it.image) : null;
    if (img) D.image(ctx, img.source, cx - size * 0.36, cy - size * 0.36, size * 0.72, size * 0.72, "contain", 0);
    else D.icon(ctx, it.icon ?? "sparkles", cx - size * 0.27, cy - size * 0.27, size * 0.54, hi ? pal.onAccent : pal.iconFg, ease.outCubic(q), 1.8);
    if (it.label) {
      const ls = Math.max(22 * u, size * 0.17);
      D.text(ctx, it.label, cx, cy + size / 2 + ls * 1.6, ls, 500, pal.fg, "center");
    }
    ctx.restore();
  };
  if (layout === "orbit") {
    const cx = s.W / 2;
    const cy = s.safe.y + s.safe.h * (s.portrait ? 0.45 : 0.5);
    const R = Math.min(s.safe.w, s.safe.h) * (s.portrait ? 0.4 : 0.38);
    const size = Math.min(170 * u, R * 0.62);
    // centre: the TaxStreem mark, or the title
    const cp = sp(t - 0.1, 0.9);
    if (p.title) {
      const l = D.layoutText(ctx, str(p.title), cx, 0, { maxWidth: R * 1.25, size: titleS * 0.8, weight: 500, maxLines: 3, align: "center", highlight: arr(p.highlight) });
      const l2 = D.layoutText(ctx, str(p.title), cx, cy - l.height / 2, { maxWidth: R * 1.25, size: l.size, minSize: l.size, weight: 500, maxLines: 99, align: "center", highlight: arr(p.highlight) });
      const col = headColors(c, arr(p.highlight).length > 0);
      riseWords(c, l2, 0.2, { color: col.color, hl: col.hl, dimAlpha: col.dimAlpha });
    } else {
      const mh = R * 0.42;
      D.mark(ctx, cx - D.markWidth(mh) / 2, cy - mh / 2, mh, pal.markColor, clamp(cp * 1.5), cp);
    }
    // faint ring
    ctx.save();
    ctx.globalAlpha = 0.5 * clamp(cp);
    ctx.strokeStyle = pal.track;
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const spin = t * 0.12;
    items.forEach((it, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + spin;
      drawTile(it, i, cx + Math.cos(a) * R, cy + Math.sin(a) * R, size, sp(t - (0.35 + i * st), 0.7, 0.25));
    });
    return;
  }
  const cols = layout === "row" ? Math.min(n, s.portrait ? 4 : 6) : s.portrait ? Math.min(3, n) : Math.min(4, n);
  const rows = Math.ceil(n / cols);
  const labelH = items.some((x) => x.label) ? 70 * u : 0;
  const size = Math.min((s.safe.w - (cols - 1) * 36 * u) / cols, (s.portrait ? 230 : 210) * u);
  const gridW = cols * size + (cols - 1) * 36 * u;
  const gridH = rows * (size + labelH) + (rows - 1) * 40 * u;
  const headProbe = p.title ? D.layoutText(ctx, str(p.title), 0, 0, { maxWidth: s.safe.w, size: titleS, weight: 500, maxLines: 3, align: "center" }) : null;
  const headH = hasHead ? (p.kicker ? 54 * u : 0) + (headProbe?.height ?? 0) + 80 * u : 0;
  const top = s.safe.y + (s.safe.h - headH - gridH) * (s.portrait ? 0.42 : 0.5);
  let end = 0.1;
  if (hasHead) end = headerBlock(c, s.W / 2, top, s.safe.w, { kicker: p.kicker, title: p.title, size: titleS, align: "center", highlight: arr(p.highlight) }).end;
  const gy = top + headH;
  items.forEach((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, n - row * cols);
    const rowW = inRow * size + (inRow - 1) * 36 * u;
    const x0 = s.W / 2 - rowW / 2;
    const cx = x0 + col * (size + 36 * u) + size / 2;
    const cy = gy + row * (size + labelH + 40 * u) + size / 2;
    drawTile(it, i, cx, cy, size, sp(t - ((hasHead ? end * 0.7 : 0.2) + i * st), 0.7, 0.25));
  });
  void gridW;
};

interface Beat { text: string; at?: number; highlight?: boolean | string[] }

/** Big kinetic type: phrases replace each other (or stack) on the beat. */
const kinetic: Template = (c) => {
  const { ctx, s, p, pal, t, d } = c;
  const u = s.u;
  const raw = Array.isArray(p.lines) ? p.lines : str(p.text).split(/\s*\/\s*|\n+/).filter(Boolean);
  const lines: Beat[] = raw.slice(0, 10).map((x: any) => (typeof x === "string" ? { text: x } : { text: str(x?.text), at: x?.at, highlight: x?.highlight }));
  const n = Math.max(1, lines.length);
  const stack = p.mode === "stack";
  const span = Math.max(0.4, (d - 0.35) / n);
  const ats = lines.map((l, i) => (Number.isFinite(+l.at!) && l.at !== undefined ? +l.at! : 0.12 + i * span));
  const align: "left" | "center" = p.align ?? "center";
  const x = align === "center" ? s.W / 2 : s.safe.x;
  const big = p.size === "l" ? 0.72 : 1;
  const size = (s.portrait ? 190 : s.landscape ? 200 : 160) * u * big;
  // optional video or photo behind the words
  if (p.media) {
    drawMedia(c, ctx, p.media, p, { x: 0, y: 0, w: s.W, h: s.H }, { motion: "in", k: ease.smooth(t / Math.max(1, d)) });
    scrim(ctx, s, p.overlay ?? "dark", "center");
  }
  const palT = p.media ? overlayPalette(c, p.overlay ?? "dark") : pal;
  const cc: SceneCtx = { ...c, pal: palT };
  const lay = (l: Beat, y: number, sz = size, exact = false) =>
    D.layoutText(ctx, l.text, x, y, { maxWidth: s.safe.w, size: sz, minSize: exact ? sz : undefined, weight: 500, maxLines: 3, lineHeight: 1.0, align, highlight: l.highlight === true ? l.text.split(/\s+/) : Array.isArray(l.highlight) ? l.highlight : [] });
  if (!stack) {
    let i = 0;
    for (let k = 0; k < n; k++) if (t >= ats[k] - 0.02) i = k;
    const l = lines[i];
    const probe = lay(l, 0);
    const laid = lay(l, s.safe.y + s.safe.h * (s.portrait ? 0.45 : 0.5) - probe.height / 2, probe.size, true);
    const next = i + 1 < n ? ats[i + 1] : Infinity;
    const out = clamp((t - (next - 0.22)) / 0.22);
    const col = headColors(cc, laid.words.some((w) => w.highlight));
    ctx.save();
    if (out > 0) {
      ctx.globalAlpha *= 1 - out;
      ctx.translate(0, -out * size * 0.25);
      if (M().entry === "blur") ctx.filter = `blur(${(out * size * 0.12).toFixed(1)}px)`;
    }
    riseWords(cc, laid, ats[i], { color: col.color, hl: col.hl === col.color ? undefined : col.hl, dimAlpha: col.dimAlpha, stagger: Math.min(0.06, 0.4 / Math.max(1, laid.words.length)) });
    ctx.restore();
    return;
  }
  // stack: each phrase lands under the last; the block scrolls up to keep the newest in view
  const probes = lines.map((l) => lay(l, 0, size * 0.62));
  const lh = probes.map((q) => q.height + 18 * u);
  const tops: number[] = [];
  let acc = 0;
  lh.forEach((h) => {
    tops.push(acc);
    acc += h;
  });
  const view = s.safe.h * (s.portrait ? 0.7 : 0.8);
  const steps = lines.map((_, i) => ({ at: ats[i], to: Math.max(0, tops[i] + lh[i] - view) }));
  const scroll = springSteps(t, 0, steps, 0.8 * M().settle);
  const y0 = s.safe.y + Math.max(0, (s.safe.h - Math.min(acc, view)) / 2) - scroll;
  lines.forEach((l, i) => {
    if (t < ats[i] - 0.05) return;
    const laid = lay(l, y0 + tops[i], probes[i].size, true);
    const later = i < n - 1 && t > ats[i + 1] ? 0.38 : 1;
    const col = headColors(cc, laid.words.some((w) => w.highlight));
    ctx.save();
    ctx.globalAlpha *= lerp(1, later, clamp((t - (ats[i + 1] ?? Infinity)) / 0.3));
    riseWords(cc, laid, ats[i], { color: col.color, hl: col.hl === col.color ? undefined : col.hl, dimAlpha: col.dimAlpha });
    ctx.restore();
  });
};

// ---------------------------------------------------------------- native UI components

/** Product UI pieces drawn natively (no screenshot needed): buttons, prompts, notifications and more. */
const ui: Template = (c) => {
  const { s, p } = c;
  const kind: string = p.kind ?? "button";
  const fn = UI_KINDS[kind];
  if (!fn) {
    c.warn(`Scene "${c.scene.id}": ui kind "${kind}" doesn't exist. Use ${Object.keys(UI_KINDS).join(", ")}.`);
    return;
  }
  const u = s.u;
  const hasHead = !!(p.title || p.kicker);
  const titleS = (s.portrait ? 78 : s.landscape ? 80 : 62) * u;
  const cw = Math.min(s.safe.w, (s.landscape ? 1000 : s.square ? 860 : 980) * u);
  const probe = p.title ? D.layoutText(c.ctx, str(p.title), 0, 0, { maxWidth: s.safe.w, size: titleS, weight: 500, maxLines: 3, align: "center" }) : null;
  const headH = hasHead ? (p.kicker ? 54 * u : 0) + (probe?.height ?? 0) + (p.sub ? titleS * 0.42 * 1.36 * 2 + 10 * u : 0) + 70 * u : 0;
  let end = 0.1;
  let top = s.safe.y;
  const est = fn.height(c, cw);
  top = s.safe.y + Math.max(0, (s.safe.h - headH - est) * (s.portrait ? 0.42 : 0.5));
  if (hasHead) end = headerBlock(c, s.W / 2, top, s.safe.w, { kicker: p.kicker, title: p.title, sub: p.sub, size: titleS, align: "center", highlight: arr(p.highlight) }).end;
  const box = { x: s.W / 2 - cw / 2, y: top + headH, w: cw, h: est };
  const start = hasHead ? Math.max(0.3, end * 0.7) : 0.15;
  const tiltMode = p.tilt ?? "none";
  D.tilted(c.ctx, s, box, D.tiltFor(tiltMode, spCalm(c.t - start, 1.4), c.t), (g) => fn.draw({ ...c, ctx: g }, box, start), 1);
};

interface UIKind {
  height(c: SceneCtx, w: number): number;
  draw(c: SceneCtx, box: { x: number; y: number; w: number; h: number }, start: number): void;
}

const glassy = () => D.activeLook().surface === "glass";

const UI_KINDS: Record<string, UIKind> = {
  status: {
    // rows land one by one, each spinner resolves into a tick (iBanPay approvers, Numtera terminal)
    height: (c) => (Math.min(6, Math.max(1, arr(c.p.items).length)) * (c.s.portrait ? 120 : c.s.landscape ? 128 : 112) + (c.p.heading ? 90 : 30)) * c.s.u,
    draw(c, box, start) {
      const { ctx, s, p, pal, t } = c;
      const u = s.u;
      const items = arr<any>(p.items).slice(0, 6).map((x) => (typeof x === "string" ? { text: x } : { text: str(x?.text), sub: x?.sub, icon: x?.icon }));
      const term = p.style === "terminal";
      const rh = (s.portrait ? 120 : s.landscape ? 128 : 112) * u;
      const head = p.heading ? 90 * u : 30 * u;
      const q = sp(t - start, 0.8);
      if (q <= 0.001) return;
      const every = Number.isFinite(+p.every) ? +p.every : 0.55;
      const accent = D.solid(pal.accent);
      const ok = "#22C55E";
      ctx.save();
      ctx.globalAlpha *= clamp(q * 1.4);
      ctx.translate(0, (1 - q) * 40 * u);
      D.card(ctx, box.x, box.y, box.w, box.h, 30 * u, term ? "#0B1220" : pal.card, u, { elevation: 1.1, border: term ? "rgba(255,255,255,0.08)" : pal.cardBorder });
      const fg = term ? "#E6EDF7" : pal.cardFg;
      const muted = term ? "#7C8BA5" : pal.cardMuted;
      if (p.heading) {
        D.text(ctx, str(p.heading), box.x + 40 * u, box.y + 58 * u, 30 * u, 600, muted, "left", 0.02, "head");
        if (p.right) D.text(ctx, str(p.right), box.x + box.w - 40 * u, box.y + 58 * u, 30 * u, 600, muted, "right", 0.02, "head");
      }
      items.forEach((it, i) => {
        const at = start + 0.45 + i * every;
        const rq = sp(t - at, 0.5);
        if (rq <= 0.001) return;
        const done = clamp((t - at - Math.max(0.45, every * 0.8)) / 0.25);
        const y = box.y + head + i * rh;
        ctx.save();
        ctx.globalAlpha *= clamp(rq * 1.5);
        ctx.translate(0, (1 - rq) * 24 * u);
        if (i > 0 || p.heading) {
          ctx.fillStyle = term ? "rgba(255,255,255,0.06)" : pal.faint;
          ctx.fillRect(box.x + 36 * u, y, box.w - 72 * u, Math.max(1, 1.5 * u));
        }
        const ts = (term ? 28 : s.landscape ? 38 : 33) * u;
        let x = box.x + 40 * u;
        if (it.icon && !term) {
          D.icon(ctx, D.hasIcon(it.icon) ? it.icon : "file-text", x, y + rh / 2 - ts * 0.6, ts * 1.2, accent, 1, 2);
          x += ts * 1.8;
        }
        if (term) D.text(ctx, `${done >= 1 ? "✓" : ">"} ${it.text}`, x, y + rh / 2 + ts * 0.36, ts, 500, done >= 1 ? fg : muted, "left", 0, "mono");
        else {
          D.text(ctx, it.text, x, y + rh / 2 + (it.sub ? -ts * 0.15 : ts * 0.36), ts, 600, fg, "left", -0.01, "head");
          if (it.sub) D.text(ctx, str(it.sub), x, y + rh / 2 + ts * 1.05, ts * 0.78, 400, muted);
        }
        // spinner → tick
        const r = rh * 0.17;
        const cx = box.x + box.w - 40 * u - r;
        const cyy = y + rh / 2;
        ctx.lineWidth = Math.max(2, 4 * u);
        ctx.lineCap = "round";
        if (done < 1) {
          ctx.save();
          ctx.globalAlpha *= 1 - done;
          ctx.strokeStyle = term ? "#7C8BA5" : accent;
          ctx.beginPath();
          ctx.arc(cx, cyy, r, t * 7, t * 7 + Math.PI * 1.4);
          ctx.stroke();
          ctx.restore();
        }
        if (done > 0) {
          ctx.save();
          ctx.globalAlpha *= done;
          ctx.fillStyle = ok;
          ctx.beginPath();
          ctx.arc(cx, cyy, r * (0.8 + 0.2 * done), 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FFFFFF";
          ctx.beginPath();
          ctx.moveTo(cx - r * 0.45, cyy + r * 0.02);
          ctx.lineTo(cx - r * 0.1, cyy + r * 0.38);
          ctx.lineTo(cx + r * 0.5, cyy - r * 0.35);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      });
      ctx.restore();
    },
  },
  success: {
    // a button is pressed, turns into a pill, shrinks into a ring that fills, and a tick draws (iBanPay)
    height: (c) => (c.s.portrait ? 640 : 440) * c.s.u,
    draw(c, box, start) {
      const { ctx, s, p, pal, t } = c;
      const u = s.u;
      const label = str(p.label, "File return");
      const doneText = str(p.done, "Return filed");
      const busyText = str(p.busy, "Filing…");
      const accent = D.solid(pal.accent);
      const ok = "#22C55E";
      const bh = (s.portrait ? 168 : s.landscape ? 150 : 130) * u;
      const ts = bh * 0.32;
      const bw0 = D.measure(ctx, label, ts, 600, -0.01, "head") + bh * 1.4;
      const bw1 = Math.max(bw0, D.measure(ctx, busyText, ts, 600, -0.01, "head") + bh * 1.4);
      const cx = box.x + box.w / 2;
      const cy = box.y + bh * 1.2;
      const enter = sp(t - start, 0.6);
      if (enter <= 0.001) return;
      const clickAt = start + (Number.isFinite(+p.at) ? +p.at : 0.9);
      const press = t > clickAt && t < clickAt + 0.25 ? Math.sin(((t - clickAt) / 0.25) * Math.PI) : 0;
      const toBusy = ease.inOutCubic(clamp((t - clickAt - 0.15) / 0.35));
      const toRing = ease.inOutCubic(clamp((t - clickAt - 0.95) / 0.45));
      const fill = ease.inOutCubic(clamp((t - clickAt - 1.3) / 0.9));
      const tick = ease.outCubic(clamp((t - clickAt - 2.15) / 0.4));
      const w = lerp(lerp(bw0, bw1, toBusy), bh, toRing);
      const h = bh;
      ctx.save();
      ctx.globalAlpha *= clamp(enter * 1.5);
      const sc = (0.85 + 0.15 * enter) * (1 - press * 0.06);
      ctx.translate(cx, cy);
      ctx.scale(sc, sc);
      ctx.translate(-cx, -cy);
      // glow
      ctx.save();
      ctx.shadowColor = toRing > 0 ? (tick > 0 ? ok : accent) : accent;
      ctx.shadowBlur = (30 + 30 * toBusy) * u;
      D.rrect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
      ctx.fillStyle = D.paint(ctx, pal.accent, cx - w / 2, cy, cx + w / 2, cy);
      ctx.globalAlpha *= 1 - toRing;
      ctx.fill();
      ctx.restore();
      if (toRing < 0.6) {
        ctx.save();
        ctx.globalAlpha *= 1 - clamp(toRing / 0.4);
        const txt = toBusy > 0.5 ? busyText : label;
        const a = toBusy > 0.5 ? (toBusy - 0.5) * 2 : 1 - toBusy * 2;
        ctx.globalAlpha *= clamp(a);
        D.text(ctx, txt, cx, cy + ts * 0.36, ts, 600, pal.onAccent, "center", -0.01, "head");
        // shimmer while busy
        if (toBusy > 0.5) {
          const sx = cx - w / 2 + ((t * 1.6) % 1) * w;
          const g = ctx.createLinearGradient(sx - 60 * u, 0, sx + 60 * u, 0);
          g.addColorStop(0, "rgba(255,255,255,0)");
          g.addColorStop(0.5, "rgba(255,255,255,0.35)");
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          D.rrect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (toRing > 0) {
        const r = h / 2;
        ctx.lineWidth = Math.max(3, 9 * u);
        ctx.lineCap = "round";
        ctx.strokeStyle = pal.subtle;
        ctx.globalAlpha *= clamp(toRing * 1.5);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = fill >= 1 ? ok : accent;
        ctx.beginPath();
        const a0 = -Math.PI / 2 + (fill < 1 ? t * 2 : 0);
        ctx.arc(cx, cy, r, a0, a0 + Math.max(0.3, fill * Math.PI * 2));
        ctx.stroke();
        if (tick > 0) {
          ctx.strokeStyle = ok;
          ctx.beginPath();
          const pts: [number, number][] = [[cx - r * 0.38, cy + r * 0.02], [cx - r * 0.08, cy + r * 0.32], [cx + r * 0.42, cy - r * 0.3]];
          const len1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
          const len2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
          const L = (len1 + len2) * tick;
          ctx.moveTo(pts[0][0], pts[0][1]);
          if (L <= len1) ctx.lineTo(lerp(pts[0][0], pts[1][0], L / len1), lerp(pts[0][1], pts[1][1], L / len1));
          else {
            ctx.lineTo(pts[1][0], pts[1][1]);
            ctx.lineTo(lerp(pts[1][0], pts[2][0], (L - len1) / len2), lerp(pts[1][1], pts[2][1], (L - len1) / len2));
          }
          ctx.stroke();
        }
      }
      ctx.restore();
      // cursor clicks the button
      if (t < clickAt + 0.5) {
        const cq = ease.inOutCubic(clamp((t - (clickAt - 0.85)) / 0.85));
        D.cursor(ctx, lerp(cx + bw0 * 0.9, cx + bw0 * 0.18, cq), lerp(cy + bh * 1.6, cy + bh * 0.15, cq), 64 * u, clamp((t - (clickAt - 0.9)) * 4) * (1 - clamp((t - clickAt - 0.25) * 4)), "hand");
      }
      // result line and a small pill under it
      const rq = sp(t - clickAt - 2.35, 0.55);
      if (rq > 0.01) {
        ctx.save();
        ctx.globalAlpha *= clamp(rq * 1.5);
        const ry = cy + bh * 0.95 + (1 - rq) * 24 * u;
        D.text(ctx, doneText, cx, ry + ts * 1.2, ts * 1.15, 600, pal.fg, "center", -0.02, "head");
        if (p.sub) D.pill(ctx, cx, ry + ts * 2.1, 50 * u, str(p.sub), pal.pillFill, pal.pillFg, { align: "center", chevron: false, u });
        ctx.restore();
      }
    },
  },
  button: {
    height: (c) => (c.s.portrait ? 170 : 150) * c.s.u,
    draw(c, box, start) {
      const { ctx, s, p, pal, t, d } = c;
      const u = s.u;
      const h = box.h;
      const label = str(p.label, "Get started");
      const after = p.after ? str(p.after) : "";
      const clickAt = Number.isFinite(+p.at) && p.at !== undefined ? +p.at : Math.max(start + 1.3, d * 0.5);
      const iconName = p.icon ?? (label.toLowerCase().includes("play") ? "play" : "");
      const widthAt = (sz: number) => Math.max(D.measure(ctx, label, sz, 600, -0.01, "head"), after ? D.measure(ctx, after, sz, 600, -0.01, "head") + sz * 1.3 : 0) + h * 1.1 + (iconName ? sz * 1.5 : 0);
      let size = h * 0.36;
      // long labels shrink to keep the button inside the safe area
      for (let k = 0; k < 12 && widthAt(size) > s.safe.w; k++) size *= 0.92;
      const w = widthAt(size);
      const x = s.W / 2 - w / 2;
      const y = box.y;
      const q = sp(t - start, 0.8, 0.15);
      const press = 1 - 0.07 * clamp(1 - Math.abs(t - clickAt) / 0.14);
      const done = after ? spCalm(t - clickAt - 0.1, 0.5) : 0;
      if (q <= 0.001) return;
      ctx.save();
      ctx.globalAlpha *= clamp(q * 1.5);
      scaleAbout(ctx, s.W / 2, y + h / 2, (0.8 + 0.2 * q) * press);
      const fill = glassy() ? "rgba(255,255,255,0.6)" : pal.pillFill;
      const fg = glassy() ? D.solid(pal.accent) : pal.pillFg;
      D.card(ctx, x, y, w, h, (h / 2) * clamp(D.activeLook().radius * 1.6, 0.3, 1), fill, u, { elevation: 1.2, glow: true, keepRadius: true, border: glassy() ? "rgba(255,255,255,0.9)" : undefined });
      if (done > 0) {
        ctx.save();
        ctx.globalAlpha *= done;
        D.rrect(ctx, x, y, w, h, (h / 2) * clamp(D.activeLook().radius * 1.6, 0.3, 1));
        ctx.fillStyle = D.paint(ctx, pal.accent, x, y, x + w, y);
        ctx.fill();
        ctx.restore();
      }
      const draw = (txt: string, ic: string, col: string, a: number, dy: number) => {
        if (a <= 0.01) return;
        ctx.save();
        ctx.globalAlpha *= a;
        const iw = ic ? size * 1.5 : 0;
        const total = iw + D.measure(ctx, txt, size, 600, -0.01, "head");
        const x0 = s.W / 2 - total / 2;
        if (ic) D.icon(ctx, ic, x0, y + h / 2 - size * 0.55 + dy, size * 1.1, col, 1, 2.2);
        D.text(ctx, txt, x0 + iw, y + h / 2 + size * 0.36 + dy, size, 600, col, "left", -0.01, "head");
        ctx.restore();
      };
      draw(label, iconName, fg, 1 - done, -done * h * 0.3);
      if (after) draw(after, "check", pal.onAccent, done, (1 - done) * h * 0.3);
      ctx.restore();
      // ripple and cursor
      if (t >= clickAt) {
        const rp = ease.outCubic((t - clickAt) / 0.7);
        ctx.save();
        ctx.globalAlpha = (1 - rp) * 0.5;
        ctx.strokeStyle = D.solid(pal.accent);
        ctx.lineWidth = 4 * u;
        D.rrect(ctx, x - rp * 40 * u, y - rp * 40 * u, w + rp * 80 * u, h + rp * 80 * u, h / 2 + rp * 40 * u);
        ctx.stroke();
        ctx.restore();
      }
      const mv = ease.inOutCubic((t - (clickAt - 0.95)) / 0.9);
      if (mv > 0) {
        const tx = s.W / 2 + w * 0.22;
        const ty = y + h * 0.62;
        D.cursor(ctx, lerp(s.W * 0.86, tx, mv), lerp(Math.min(s.H * 0.9, y + h + 420 * u), ty, mv), 64 * u * press, clamp(mv * 3), p.cursor === "arrow" ? "arrow" : "hand");
      }
    },
  },
  prompt: {
    height: (c) => {
      const u = c.s.u;
      return (c.s.portrait ? 150 : 130) * u + (arr(c.p.chips).length ? 130 * u : 0);
    },
    draw(c, box, start) {
      const { ctx, s, p, pal, t } = c;
      const u = s.u;
      const h = (s.portrait ? 150 : 130) * u;
      const q = sp(t - start, 0.85);
      if (q <= 0.001) return;
      const r = (h / 2) * clamp(D.activeLook().radius * 1.4, 0.35, 1);
      ctx.save();
      ctx.globalAlpha *= clamp(q * 1.4);
      ctx.translate(0, (1 - q) * 40 * u);
      D.card(ctx, box.x, box.y, box.w, h, r, pal.card, u, { elevation: 1.2, border: pal.cardBorder, keepRadius: true });
      const is = h * 0.34;
      D.icon(ctx, p.icon ?? "sparkles", box.x + h * 0.36, box.y + h / 2 - is / 2, is, D.solid(pal.accent), 1, 2);
      const tx = box.x + h * 0.36 + is + 24 * u;
      const maxW = box.w - (tx - box.x) - h * 1.1;
      const full = str(p.text);
      const ts0 = h * 0.27;
      const ts = clamp(ts0 * (maxW / Math.max(1, D.measure(ctx, full, ts0, 400))), ts0 * 0.6, ts0);
      const typeAt = start + 0.6;
      const cps = 24 / Math.max(0.5, M().stagger);
      const nChars = Math.max(0, Math.floor((t - typeAt) * cps));
      const shown = full.slice(0, nChars);
      const doneAt = typeAt + full.length / cps;
      ctx.save();
      ctx.beginPath();
      ctx.rect(tx, box.y, maxW, h);
      ctx.clip();
      if (!shown) D.text(ctx, str(p.placeholder, "Ask anything"), tx, box.y + h / 2 + ts * 0.36, ts, 400, pal.cardMuted);
      else {
        const w = D.measure(ctx, shown, ts, 400);
        const off = Math.max(0, w - maxW + 20 * u);
        D.text(ctx, shown, tx - off, box.y + h / 2 + ts * 0.36, ts, 400, pal.cardFg);
        if (t < doneAt + 1.2 && Math.floor(t * 2.4) % 2 === 0) {
          ctx.fillStyle = D.solid(pal.accent);
          ctx.fillRect(tx - off + w + 4 * u, box.y + h / 2 - ts * 0.6, 3 * u, ts * 1.2);
        }
      }
      ctx.restore();
      // send button
      const bs = h * 0.62;
      const bx = box.x + box.w - h * 0.19 - bs;
      const by = box.y + (h - bs) / 2;
      const ready = clamp((t - doneAt) / 0.3);
      const press = 1 - 0.12 * clamp(1 - Math.abs(t - (doneAt + 0.45)) / 0.12);
      ctx.save();
      scaleAbout(ctx, bx + bs / 2, by + bs / 2, press);
      ctx.beginPath();
      ctx.arc(bx + bs / 2, by + bs / 2, bs / 2, 0, Math.PI * 2);
      ctx.fillStyle = ready > 0.5 ? D.paint(ctx, pal.accent, bx, by, bx + bs, by + bs) : pal.subtle;
      ctx.fill();
      D.icon(ctx, "arrow-up", bx + bs * 0.25, by + bs * 0.25, bs * 0.5, ready > 0.5 ? pal.onAccent : pal.cardMuted, 1, 2.4);
      ctx.restore();
      ctx.restore();
      // suggestion chips
      const chips = arr<string>(p.chips).slice(0, 4);
      let cx = box.x;
      const cy = box.y + h + 40 * u;
      const chS = (s.portrait ? 30 : 28) * u;
      chips.forEach((ch, i) => {
        const cwid = D.measure(ctx, ch, chS, 500) + 56 * u;
        if (cx + cwid > box.x + box.w) return;
        const cq = sp(t - (start + 0.35 + i * 0.12 * M().stagger), 0.6, 0.15);
        withFade(ctx, cq, 16 * u, () => {
          D.card(ctx, cx, cy, cwid, chS * 2.3, chS * 1.15, pal.card, u, { elevation: 0.4, border: pal.cardBorder, keepRadius: true });
          D.text(ctx, ch, cx + cwid / 2, cy + chS * 1.15 + chS * 0.36, chS, 500, pal.cardFg, "center");
        });
        cx += cwid + 16 * u;
      });
    },
  },
  notifications: {
    height: (c) => {
      const n = Math.min(4, Math.max(1, arr(c.p.items).length));
      return n * (c.s.portrait ? 190 : 160) * c.s.u + (n - 1) * 20 * c.s.u;
    },
    draw(c, box, start) {
      const { ctx, s, p, pal, t, d } = c;
      const u = s.u;
      const items = arr<{ icon?: string; title?: string; body?: string; time?: string }>(p.items).slice(0, 4);
      const n = Math.max(1, items.length);
      const ch = (s.portrait ? 190 : 160) * u;
      const gap = 20 * u;
      const every = Math.min(1.0, Math.max(0.45, (d - start - 0.8) / n));
      const ats = items.map((_, i) => start + i * every);
      items.forEach((it, i) => {
        const q = sp(t - ats[i], 0.7, 0.12);
        if (q <= 0.001) return;
        // newest on top: each later arrival pushes this one down a slot
        const slot = springSteps(t, 0, ats.slice(i + 1).map((a, k) => ({ at: a, to: k + 1 })), 0.6 * M().settle);
        const y = box.y + slot * (ch + gap);
        const k = Math.pow(0.97, slot);
        ctx.save();
        ctx.globalAlpha *= clamp(q * 1.5) * (1 - 0.12 * slot);
        ctx.translate(0, (1 - q) * -ch * 0.8);
        scaleAbout(ctx, box.x + box.w / 2, y + ch / 2, k);
        D.card(ctx, box.x, y, box.w, ch, 34 * u, pal.card, u, { elevation: 1, border: pal.cardBorder });
        const tile = ch * 0.5;
        const tx = box.x + ch * 0.25;
        const ty = y + (ch - tile) / 2;
        D.rrect(ctx, tx, ty, tile, tile, tile * 0.26);
        ctx.fillStyle = D.paint(ctx, pal.accent, tx, ty, tx + tile, ty + tile);
        ctx.fill();
        if (!it.icon || it.icon === "taxstreem") D.mark(ctx, tx + tile * 0.2, ty + tile * 0.24, tile * 0.52, pal.onAccent);
        else D.icon(ctx, it.icon, tx + tile * 0.2, ty + tile * 0.2, tile * 0.6, pal.onAccent, 1, 2);
        const x2 = tx + tile + 28 * u;
        const ts = (s.portrait ? 36 : 32) * u;
        const w2 = box.x + box.w - x2 - 30 * u;
        D.text(ctx, str(it.time, "now"), box.x + box.w - 30 * u, y + ch * 0.36, ts * 0.78, 400, pal.cardMuted, "right");
        const tl = D.layoutText(ctx, str(it.title), x2, y + ch * 0.2, { maxWidth: w2 - 90 * u, size: ts, weight: 600, maxLines: 1 });
        D.drawLayout(ctx, tl, pal.cardFg);
        if (it.body) {
          const bl = D.layoutText(ctx, str(it.body), x2, y + ch * 0.2 + ts * 1.25, { maxWidth: w2, size: ts * 0.86, weight: 400, maxLines: 2, lineHeight: 1.3 });
          D.drawLayout(ctx, bl, pal.cardMuted);
        }
        ctx.restore();
      });
    },
  },
  picker: {
    height: (c) => {
      const n = Math.min(7, Math.max(2, arr(c.p.items).length));
      return n * (c.s.portrait ? 116 : 96) * c.s.u + 40 * c.s.u + (c.p.result && !c.s.landscape ? 200 * c.s.u : 0);
    },
    draw(c, box, start) {
      const { ctx, s, p, pal, t, d } = c;
      const u = s.u;
      const items = arr<{ label?: string; icon?: string } | string>(p.items).slice(0, 7).map((x) => (typeof x === "string" ? { label: x } : x));
      const n = Math.max(1, items.length);
      const rh = (s.portrait ? 116 : 96) * u;
      const side = s.landscape && !!p.result;
      const pw = side ? box.w * 0.52 : box.w;
      const ph = n * rh + 40 * u;
      const sel = clamp(Math.round(+p.selected || 0), 0, n - 1);
      const q = sp(t - start, 0.8);
      if (q <= 0.001) return;
      ctx.save();
      ctx.globalAlpha *= clamp(q * 1.4);
      ctx.translate(0, (1 - q) * 40 * u);
      D.card(ctx, box.x, box.y, pw, ph, 36 * u, pal.card, u, { elevation: 1.1, border: pal.cardBorder });
      // the highlight walks down the list and lands on the selection
      const landAt = Math.min(start + 0.5 + sel * 0.28, d * 0.6);
      const hop = sel > 0 ? (landAt - start - 0.5) / sel : 0;
      const pos = springSteps(t, 0, Array.from({ length: sel }, (_, i) => ({ at: start + 0.5 + i * hop, to: i + 1 })), 0.35 * M().settle);
      const hy = box.y + 20 * u + pos * rh;
      const landed = clamp((t - landAt - 0.15) / 0.3);
      D.rrect(ctx, box.x + 14 * u, hy + 6 * u, pw - 28 * u, rh - 12 * u, 24 * u * D.activeLook().radius);
      ctx.fillStyle = landed > 0.5 ? D.paint(ctx, pal.accent, box.x, 0, box.x + pw, 0) : pal.tint;
      ctx.fill();
      const ts = (s.portrait ? 36 : 32) * u;
      items.forEach((it, i) => {
        const y = box.y + 20 * u + i * rh;
        const isSel = i === sel && landed > 0.5;
        const col = isSel ? pal.onAccent : Math.abs(pos - i) < 0.5 ? pal.cardFg : pal.cardMuted;
        let x = box.x + 44 * u;
        if (it.icon) {
          D.icon(ctx, it.icon, x, y + rh / 2 - ts * 0.55, ts * 1.1, col, 1, 2);
          x += ts * 1.7;
        }
        D.text(ctx, str(it.label), x, y + rh / 2 + ts * 0.36, ts, isSel ? 600 : 500, col);
        if (isSel) D.icon(ctx, "check", box.x + pw - 44 * u - ts, y + rh / 2 - ts * 0.5, ts, pal.onAccent, landed, 2.6);
      });
      ctx.restore();
      if (p.result) {
        const rp = sp(t - landAt - 0.3, 0.8, 0.15);
        const rs = (s.portrait ? 84 : 80) * u;
        const rx = side ? box.x + pw + 80 * u : s.W / 2;
        const ry = side ? box.y + ph / 2 : box.y + ph + 110 * u;
        withFade(ctx, rp, 24 * u, () => {
          const l = D.layoutText(ctx, str(p.result), rx, ry - rs * 0.6, { maxWidth: side ? box.w - pw - 80 * u : box.w, size: rs, weight: 500, maxLines: 2, align: side ? "left" : "center" });
          D.drawLayout(ctx, l, pal.fg);
        });
      }
    },
  },
  toggles: {
    height: (c) => Math.min(6, Math.max(1, arr(c.p.items).length)) * (c.s.portrait ? 150 : 124) * c.s.u + 30 * c.s.u,
    draw(c, box, start) {
      const { ctx, s, p, pal, t } = c;
      const u = s.u;
      const items = arr<{ label?: string; sub?: string; on?: boolean; icon?: string } | string>(p.items).slice(0, 6).map((x) => (typeof x === "string" ? { label: x } : x));
      const rh = (s.portrait ? 150 : 124) * u;
      const q = sp(t - start, 0.8);
      if (q <= 0.001) return;
      ctx.save();
      ctx.globalAlpha *= clamp(q * 1.4);
      ctx.translate(0, (1 - q) * 40 * u);
      D.card(ctx, box.x, box.y, box.w, box.h, 36 * u, pal.card, u, { elevation: 1.1, border: pal.cardBorder });
      const ts = (s.portrait ? 36 : 32) * u;
      items.forEach((it, i) => {
        const y = box.y + 15 * u + i * rh;
        if (i > 0) {
          ctx.fillStyle = pal.faint;
          ctx.fillRect(box.x + 40 * u, y, box.w - 80 * u, Math.max(1, 1.5 * u));
        }
        let x = box.x + 44 * u;
        if (it.icon) {
          D.icon(ctx, it.icon, x, y + rh / 2 - ts * 0.55, ts * 1.1, D.solid(pal.accent), 1, 2);
          x += ts * 1.8;
        }
        D.text(ctx, str(it.label), x, y + rh / 2 + (it.sub ? -ts * 0.2 : ts * 0.36), ts, 600, pal.cardFg, "left", -0.01, "head");
        if (it.sub) D.text(ctx, str(it.sub), x, y + rh / 2 + ts * 1.05, ts * 0.78, 400, pal.cardMuted);
        // switch
        const sh = rh * 0.36;
        const sw = sh * 1.75;
        const sx = box.x + box.w - 44 * u - sw;
        const sy = y + (rh - sh) / 2;
        const on = it.on === false ? 0 : sp(t - (start + 0.6 + i * 0.45 * M().stagger), 0.45, 0.1);
        D.rrect(ctx, sx, sy, sw, sh, sh / 2);
        ctx.fillStyle = pal.subtle;
        ctx.fill();
        if (on > 0.01) {
          ctx.save();
          ctx.globalAlpha *= clamp(on);
          D.rrect(ctx, sx, sy, sw, sh, sh / 2);
          ctx.fillStyle = D.paint(ctx, pal.accent, sx, sy, sx + sw, sy);
          ctx.fill();
          ctx.restore();
        }
        const kx = sx + sh / 2 + (sw - sh) * clamp(on, 0, 1.08);
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.18)";
        ctx.shadowBlur = 6 * u;
        ctx.shadowOffsetY = 2 * u;
        ctx.beginPath();
        ctx.arc(kx, sy + sh / 2, sh * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.restore();
      });
      ctx.restore();
    },
  },
  payment: {
    height: (c) => (c.s.portrait ? 300 : 260) * c.s.u + Math.min(5, arr(c.p.rows).length) * (c.s.portrait ? 78 : 64) * c.s.u + (c.p.status ? 140 * c.s.u : 40 * c.s.u),
    draw(c, box, start) {
      const { ctx, s, p, pal, t } = c;
      const u = s.u;
      const rows = arr<{ label?: string; value?: string }>(p.rows).slice(0, 5);
      const q = sp(t - start, 0.85);
      if (q <= 0.001) return;
      ctx.save();
      ctx.globalAlpha *= clamp(q * 1.4);
      ctx.translate(0, (1 - q) * 50 * u);
      D.card(ctx, box.x, box.y, box.w, box.h, 40 * u, pal.card, u, { elevation: 1.3, border: pal.cardBorder });
      const cx = box.x + box.w / 2;
      const cr = (s.portrait ? 58 : 50) * u;
      const cy = box.y + 50 * u + cr;
      const cp = ease.outCubic((t - start - 0.25) / 0.6);
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fillStyle = pal.tint;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, cr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cp);
      ctx.strokeStyle = D.solid(pal.accent);
      ctx.lineWidth = 6 * u;
      ctx.stroke();
      D.icon(ctx, p.icon ?? "check", cx - cr * 0.55, cy - cr * 0.55, cr * 1.1, D.solid(pal.accent), ease.outCubic((t - start - 0.6) / 0.4), 2.6);
      let y = cy + cr + 56 * u;
      const ts = (s.portrait ? 36 : 32) * u;
      D.text(ctx, str(p.title, "Payment successful"), cx, y, ts, 500, pal.cardMuted, "center");
      y += 24 * u;
      if (p.amount !== undefined) {
        const as = (s.portrait ? 96 : 84) * u;
        const k = ease.outExpo((t - start - 0.4) / 1.4);
        const v = (Number(p.amount) || 0) * k;
        const txt = formatNumber(v, { prefix: str(p.prefix), suffix: str(p.suffix), decimals: Number(p.decimals) || 0 });
        D.text(ctx, txt, cx, y + as * 0.92, as, 600, pal.cardFg, "center", -0.03, "display");
        y += as * 1.25;
      }
      rows.forEach((r, i) => {
        const rp = sp(t - (start + 0.9 + i * 0.12 * M().stagger), 0.6);
        const rh = (s.portrait ? 78 : 64) * u;
        withFade(ctx, rp, 10 * u, () => {
          ctx.fillStyle = pal.faint;
          ctx.fillRect(box.x + 50 * u, y, box.w - 100 * u, Math.max(1, 1.5 * u));
          D.text(ctx, str(r.label), box.x + 50 * u, y + rh * 0.62, ts * 0.86, 400, pal.cardMuted);
          D.text(ctx, str(r.value), box.x + box.w - 50 * u, y + rh * 0.62, ts * 0.86, 600, pal.cardFg, "right");
        });
        y += rh;
      });
      if (p.status) {
        const pp = sp(t - (start + 1.2 + rows.length * 0.12), 0.6, 0.2);
        const ph = 72 * u;
        withFade(ctx, pp, 0, () => {
          ctx.save();
          const pw = D.measure(ctx, str(p.status), ph * 0.4, 600) + ph * 1.5;
          scaleAbout(ctx, cx, y + 40 * u + ph / 2, 0.85 + 0.15 * pp);
          D.rrect(ctx, cx - pw / 2, y + 40 * u, pw, ph, ph / 2);
          ctx.fillStyle = D.paint(ctx, pal.accent, cx - pw / 2, 0, cx + pw / 2, 0);
          ctx.fill();
          D.icon(ctx, "badge-check", cx - pw / 2 + ph * 0.3, y + 40 * u + ph * 0.25, ph * 0.5, pal.onAccent, 1, 2.2);
          D.text(ctx, str(p.status), cx - pw / 2 + ph * 0.95, y + 40 * u + ph / 2 + ph * 0.14, ph * 0.4, 600, pal.onAccent);
          ctx.restore();
        });
      }
      ctx.restore();
    },
  },
  chat: {
    height: (c) => c.s.safe.h * (c.p.title ? 0.62 : 0.8),
    draw(c, box, start) {
      const { ctx, s, p, pal, t, d } = c;
      const u = s.u;
      const msgs = arr<{ from?: string; text?: string }>(p.messages).slice(0, 6);
      const n = Math.max(1, msgs.length);
      const ts = (s.portrait ? 44 : s.landscape ? 36 : 38) * u;
      const maxW = box.w * 0.8;
      const every = Math.max(0.7, (d - start - 0.8) / n);
      const ats: number[] = [];
      let at = start;
      msgs.forEach((m) => {
        if (m.from !== "user") at += 0.55; // typing dots first
        ats.push(at);
        at += every * 0.8;
      });
      const lays = msgs.map((m) => D.layoutText(ctx, str(m.text), 0, 0, { maxWidth: maxW - 56 * u, size: ts, weight: 400, maxLines: 6, lineHeight: 1.32 }));
      const hs = lays.map((l) => l.height + 44 * u);
      const tops: number[] = [];
      let acc = 0;
      hs.forEach((h) => {
        tops.push(acc);
        acc += h + 20 * u;
      });
      // short conversations sit in the middle of the space; long ones scroll up as messages arrive
      const lead = Math.max(0, (box.h - acc) / 2);
      const scroll = springSteps(t, -lead, msgs.map((_, i) => ({ at: ats[i], to: Math.max(-lead, tops[i] + hs[i] - box.h) })), 0.6 * M().settle);
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x - 40 * u, box.y - 10 * u, box.w + 80 * u, box.h + 20 * u);
      ctx.clip();
      msgs.forEach((m, i) => {
        const user = m.from === "user";
        const y = box.y + tops[i] - scroll;
        // typing indicator before the bot replies
        if (!user && t >= ats[i] - 0.55 && t < ats[i]) {
          const bw = 140 * u;
          D.card(ctx, box.x, y, bw, 80 * u, 40 * u, pal.card, u, { elevation: 0.5, border: pal.cardBorder, keepRadius: true });
          for (let k = 0; k < 3; k++) {
            const bounce = Math.max(0, Math.sin((t * 8 - k * 0.8) % (Math.PI * 2)));
            ctx.beginPath();
            ctx.arc(box.x + 40 * u + k * 30 * u, y + 40 * u - bounce * 7 * u, 8 * u, 0, Math.PI * 2);
            ctx.fillStyle = pal.cardMuted;
            ctx.fill();
          }
          return;
        }
        const q = sp(t - ats[i], 0.6, 0.18);
        if (q <= 0.001) return;
        const l = lays[i];
        const bw = l.width + 56 * u;
        const bx = user ? box.x + box.w - bw : box.x;
        ctx.save();
        ctx.globalAlpha *= clamp(q * 1.5);
        scaleAbout(ctx, user ? bx + bw : bx, y + hs[i], 0.7 + 0.3 * q);
        const fill = user ? D.solid(pal.accent) : pal.card;
        D.card(ctx, bx, y, bw, hs[i], Math.min(36 * u, hs[i] / 2), fill, u, { elevation: user ? 0.6 : 0.5, border: user ? undefined : pal.cardBorder, keepRadius: true });
        const l2 = D.layoutText(ctx, str(m.text), bx + 28 * u, y + 22 * u, { maxWidth: maxW - 56 * u, size: l.size, minSize: l.size, weight: 400, maxLines: 99, lineHeight: 1.32 });
        D.drawLayout(ctx, l2, user ? pal.onAccent : pal.cardFg);
        ctx.restore();
      });
      ctx.restore();
    },
  },
};

const custom: Template = (c) => {
  const code = str(c.p.code);
  if (!code) {
    c.warn(`Scene "${c.scene.id}": custom scene has no code.`);
    return;
  }
  let fn = customCache.get(code);
  if (!fn) {
    try {
      fn = new Function("api", `"use strict";\n${code}`) as (api: unknown) => void;
    } catch (e) {
      c.warn(`Scene "${c.scene.id}": custom code doesn't compile (${(e as Error).message}).`);
      customCache.set(code, () => {});
      return;
    }
    customCache.set(code, fn);
  }
  const { ctx, s, t, d, pal, theme, p } = c;
  ctx.save();
  try {
    const drawMediaBox = (id: string, x: number, y: number, w: number, h: number, o: { fit?: "cover" | "contain"; at?: number; zoom?: number; focusX?: number; focusY?: number; radius?: number; motion?: string; k?: number } = {}) =>
      drawMedia(c, ctx, id, {}, { x, y, w, h }, { fit: o.fit, at: o.at, r: o.radius, focus: { x: o.focusX, y: o.focusY }, motion: o.motion ?? "none", k: o.k, zoom: o.zoom });
    fn({ ctx: forgiving(ctx), t, d, W: s.W, H: s.H, u: s.u, stage: s, palette: pal, theme, props: p, brand: D.BRAND, colors: D.activeColors(), look: D.activeLook(), lib: { clamp, lerp, ease, spring, sp, springSteps, tween, remap, formatNumber }, draw: D, image: c.image, media: c.media, mediaInfo: c.mediaInfo, drawMedia: drawMediaBox });
  } catch (e) {
    c.warn(`Scene "${c.scene.id}": custom code failed at ${t.toFixed(2)}s (${(e as Error).message}).`);
  }
  ctx.restore();
};
const customCache = new Map<string, (api: unknown) => void>();

/** Custom code gets a context whose drawImage accepts a media frame object and skips pictures that haven't loaded. */
const forgivingCache = new WeakMap<Ctx, Ctx>();
function forgiving(ctx: Ctx): Ctx {
  let f = forgivingCache.get(ctx);
  if (!f) {
    f = new Proxy(ctx, {
      get(target, prop) {
        if (prop === "drawImage") {
          return (img: any, ...rest: number[]) => {
            const src = img && typeof img === "object" && "source" in img ? img.source : img;
            if (!src) return;
            (target.drawImage as (...a: unknown[]) => void).call(target, src, ...rest);
          };
        }
        const v = (target as any)[prop];
        return typeof v === "function" ? v.bind(target) : v;
      },
      set(target, prop, value) {
        (target as any)[prop] = value;
        return true;
      },
    });
    forgivingCache.set(ctx, f);
  }
  return f;
}


// ---------------------------------------------------------------- the 2026 sample study: sentences, verbs, documents, walls, heroes
// Moves taken from the reference launch videos (Modus, Google Vids, iBanPay, Numtera, Gemini Canvas,
// Apple Creator Studio, LemFi, ConversBank, LangEase, Lovio, Hyperliquid): type is the main actor,
// the camera lives on details, states change in place, and beats grow out of each other.

interface Tok {
  kind: "word" | "icon" | "chip" | "image" | "logo";
  text: string;
  accent: boolean;
}

/** "Meet your {chip:+ New} *designer*." → tokens. *words* are the accent; {icon:name}, {chip:Label}, {image:assetId}, {logo}. */
function toks(src: string, highlight: string[] = []): Tok[] {
  const out: Tok[] = [];
  const hl = new Set(highlight.map((h) => h.toLowerCase().replace(/[^\p{L}\p{N}₦%]+/gu, "")));
  const re = /\{(icon|chip|image|logo)(?::([^}]*))?\}|\*([^*]+)\*|(\S+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1]) out.push({ kind: m[1] as Tok["kind"], text: (m[2] ?? "").trim(), accent: false });
    else if (m[3]) for (const w of m[3].split(/\s+/).filter(Boolean)) out.push({ kind: "word", text: w, accent: true });
    else {
      const w = m[4];
      const prev = out[out.length - 1];
      // punctuation after an accent or an object sticks to it
      if (/^[.,!?;:…)]+$/u.test(w) && prev && prev.kind === "word") prev.text += w;
      else out.push({ kind: "word", text: w, accent: hl.has(w.toLowerCase().replace(/[^\p{L}\p{N}₦%]+/gu, "")) });
    }
  }
  return out;
}

interface Placed extends Tok {
  x: number;
  w: number;
  line: number;
  i: number;
}

interface Block {
  items: Placed[];
  lines: { y: number; width: number; from: number; to: number }[];
  size: number;
  height: number;
  role: D.Role;
  weight: number;
}

const ROLE: D.Role = "display";

function tokWidth(c: SceneCtx, t: Tok, size: number, weight: number): number {
  const { ctx } = c;
  if (t.kind === "word") return D.measure(ctx, t.text, size, weight, -0.02, ROLE);
  if (t.kind === "icon") return size * 0.95;
  if (t.kind === "logo") return D.markWidth(size * 0.82);
  if (t.kind === "image") return size * 1.75;
  const h = size * 0.82;
  return h * 1.45 + D.measure(ctx, t.text || "New", h * 0.46, 500, -0.01, D.activeLook().type.upper ? "head" : "body");
}

/** Lays tokens out in centred (or left) lines, shrinking until they fit. Positions are relative to each line's left edge. */
function layBlock(c: SceneCtx, tk: Tok[], size: number, maxW: number, maxLines: number, weight = 500): Block {
  let sz = size;
  for (let tries = 0; tries < 14; tries++) {
    const gap = sz * 0.26;
    const items: Placed[] = [];
    const lines: Block["lines"] = [];
    let line = 0;
    let x = 0;
    let from = 0;
    tk.forEach((t, i) => {
      const w = tokWidth(c, t, sz, weight);
      if (x > 0 && x + w > maxW) {
        lines.push({ y: 0, width: x - gap, from, to: i });
        line++;
        x = 0;
        from = i;
      }
      items.push({ ...t, x, w, line, i });
      x += w + gap;
    });
    lines.push({ y: 0, width: Math.max(0, x - gap), from, to: tk.length });
    const widest = Math.max(...lines.map((l) => l.width));
    if ((lines.length <= maxLines && widest <= maxW) || tries === 13) {
      const lh = sz * 1.12;
      lines.forEach((l, k) => (l.y = k * lh + sz * 0.8));
      return { items, lines, size: sz, height: lines.length * lh, role: ROLE, weight };
    }
    sz *= 0.9;
  }
  throw new Error("unreachable");
}

/** Draws one token at (x, baseline y). */
function drawTok(c: SceneCtx, t: Tok, x: number, y: number, size: number, color: string, weight = 500) {
  const { ctx, pal, s } = c;
  const u = s.u;
  if (t.kind === "word") {
    D.text(ctx, t.text, x, y, size, weight, color, "left", -0.02, ROLE);
  } else if (t.kind === "icon") {
    D.icon(ctx, D.hasIcon(t.text) ? t.text : "sparkles", x, y - size * 0.78, size * 0.9, D.solid(pal.highlight === pal.fg ? pal.accent : pal.highlight), 1, 2);
  } else if (t.kind === "logo") {
    const h = size * 0.82;
    D.mark(ctx, x, y - h * 0.86, h, D.brandColors() ? D.BRAND.primary : D.solid(pal.accent));
  } else if (t.kind === "image") {
    const w = size * 1.75;
    const h = size * 0.98;
    const box = { x, y: y - size * 0.82, w, h };
    ctx.save();
    ctx.shadowColor = "rgba(10,20,40,0.28)";
    ctx.shadowBlur = 30 * u;
    ctx.shadowOffsetY = 10 * u;
    D.rrect(ctx, box.x, box.y, box.w, box.h, D.radius(size * 0.18));
    ctx.fillStyle = pal.card;
    ctx.fill();
    ctx.restore();
    drawMedia(c, ctx, t.text, {}, box, { r: D.radius(size * 0.18), motion: "in", k: 0.5 });
  } else {
    const h = size * 0.82;
    const w = tokWidth(c, t, size, weight);
    const yTop = y - size * 0.8;
    ctx.save();
    ctx.shadowColor = "rgba(10,20,40,0.18)";
    ctx.shadowBlur = 24 * u;
    ctx.shadowOffsetY = 6 * u;
    D.rrect(ctx, x, yTop, w, h, (h / 2) * clamp(D.activeLook().radius * 1.6, 0.3, 1));
    ctx.fillStyle = pal.card;
    ctx.fill();
    ctx.restore();
    D.rrect(ctx, x, yTop, w, h, (h / 2) * clamp(D.activeLook().radius * 1.6, 0.3, 1));
    ctx.strokeStyle = pal.cardBorder;
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.stroke();
    D.text(ctx, t.text || "New", x + h * 0.72, yTop + h / 2 + h * 0.16, h * 0.46, 500, pal.cardFg, "left", -0.01, D.activeLook().type.upper ? "head" : "body");
  }
}

/** Small four-point sparkle (the launch-video asterisk). */
function sparkle(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.22, Math.sin(a + Math.PI / 4) * r * 0.22);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function bracketGlyph(ctx: Ctx, x: number, yTop: number, h: number, dir: 1 | -1, color: string, lw: number) {
  const arm = h * 0.18;
  ctx.beginPath();
  ctx.moveTo(x + dir * arm, yTop);
  ctx.lineTo(x, yTop);
  ctx.lineTo(x, yTop + h);
  ctx.lineTo(x + dir * arm, yTop + h);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = "miter";
  ctx.stroke();
}

type SentenceMode = "build" | "type" | "scroll" | "dolly" | "assemble" | "brackets" | "select" | "rotate" | "stack";

/**
 * Kinetic sentences: the type-led beats of modern launch videos. One phrase per beat, landing word
 * by word, with inline chips, icons, pictures and the logo living inside the line.
 */
const sentence: Template = (c) => {
  const { ctx, s, p, t, d } = c;
  const u = s.u;
  const raw = Array.isArray(p.lines) ? p.lines : str(p.text).split(/\s*\/\s*|\n+/).filter(Boolean);
  const beats: Beat[] = raw.slice(0, 10).map((x: any) => (typeof x === "string" ? { text: x } : { text: str(x?.text), at: x?.at, highlight: x?.highlight }));
  if (!beats.length) return c.warn(`Scene "${c.scene.id}": sentence needs props.lines.`);
  const mode: SentenceMode = (["build", "type", "scroll", "dolly", "assemble", "brackets", "select", "rotate", "stack"] as const).includes(p.mode) ? p.mode : "build";
  const n = beats.length;
  const span = Math.max(0.5, (d - 0.3) / n);
  const ats = beats.map((b, i) => (b.at !== undefined && Number.isFinite(+b.at) ? +b.at : 0.15 + i * span));
  const big = p.size === "m" ? 0.52 : p.size === "l" ? 0.74 : 1;
  const size0 = (s.portrait ? 150 : s.landscape ? 150 : 128) * u * big * (mode === "dolly" ? 1.08 : 1);
  const align: "left" | "center" = p.align === "left" ? "left" : "center";
  if (p.media) {
    drawMedia(c, ctx, p.media, p, { x: 0, y: 0, w: s.W, h: s.H }, { motion: "in", k: ease.smooth(t / Math.max(1, d)) });
    scrim(ctx, s, p.overlay ?? "dark", "center");
  }
  const palT = p.media ? overlayPalette(c, p.overlay ?? "dark") : c.pal;
  const cc: SceneCtx = { ...c, pal: palT };
  const anyAccent = beats.some((b) => /\*[^*]+\*/.test(b.text) || b.highlight);
  const col = headColors(cc, anyAccent);
  const fg = col.color;
  const acc = col.hl === col.color ? D.solid(palT.accent) : col.hl;
  const tokFor = (b: Beat) => toks(b.text, b.highlight === true ? b.text.split(/\s+/) : Array.isArray(b.highlight) ? b.highlight : []);
  const cy = s.safe.y + s.safe.h * (s.portrait ? 0.46 : 0.5);
  const maxLines = mode === "scroll" ? 1 : s.portrait ? 4 : 3;
  const seed = hashNum(c.scene.id);

  // scroll: every phrase continues one line that slides left as words arrive (v05)
  if (mode === "scroll") {
    const all: Tok[] = beats.flatMap((b) => tokFor(b));
    const idxBeat: number[] = [];
    beats.forEach((b, bi) => tokFor(b).forEach(() => idxBeat.push(bi)));
    const blk = layBlock(cc, all, size0 * (s.landscape ? 0.82 : 0.6), Infinity, 1);
    const gap = blk.size * 0.26;
    const local = idxBeat.map((bi, k) => k - idxBeat.indexOf(bi));
    const q = blk.items.map((it, k) => sp(t - ats[idxBeat[k]] - local[k] * 0.11, 0.55));
    const vis = blk.items.reduce((a, it, k) => a + (it.w + gap) * clamp(q[k] * 1.3), 0) - gap;
    const right = Math.min(s.W / 2 + vis / 2, s.safe.x + s.safe.w * 0.94);
    const x0 = right - vis;
    const y = cy - blk.height / 2 + blk.size * 0.8;
    let x = x0;
    blk.items.forEach((it, k) => {
      const qq = q[k];
      if (qq <= 0.001) return;
      const fadeL = clamp((x + it.w - s.safe.x * 0.4) / (s.safe.w * 0.22));
      ctx.save();
      ctx.globalAlpha *= clamp(qq * 1.5) * fadeL;
      const b = (1 - clamp(qq)) * blk.size * 0.14;
      if (b > 0.5) ctx.filter = `blur(${b.toFixed(1)}px)`;
      drawTok(cc, it, x + (1 - qq) * blk.size * 0.6, y, blk.size, it.accent ? acc : fg);
      ctx.restore();
      x += (it.w + gap) * clamp(qq * 1.3);
    });
    return;
  }

  // stack: phrases land under each other and the block scrolls; older lines dim (lists, manifestos)
  if (mode === "stack") {
    const blocks = beats.map((b) => layBlock(cc, tokFor(b), size0 * (n > 4 ? 0.62 : 0.9), s.safe.w, 2));
    const lh = blocks.map((b) => b.height + 16 * u);
    const tops: number[] = [];
    let acc2 = 0;
    lh.forEach((h) => {
      tops.push(acc2);
      acc2 += h;
    });
    const view = s.safe.h * 0.86;
    const scroll = springSteps(t, 0, blocks.map((_, i) => ({ at: ats[i], to: Math.max(0, tops[i] + lh[i] - view) })), 0.8 * M().settle);
    const y0 = s.safe.y + Math.max(0, (s.safe.h - Math.min(acc2, view)) / 2) - scroll;
    blocks.forEach((blk, i) => {
      if (t < ats[i] - 0.05) return;
      const dim = i < n - 1 && t > ats[i + 1] ? lerp(1, 0.5, clamp((t - ats[i + 1]) / 0.3)) : 1;
      ctx.save();
      ctx.globalAlpha *= dim;
      wordsIn(cc, blk, align, y0 + tops[i], ats[i], fg, acc, 0.09);
      ctx.restore();
    });
    return;
  }

  let i = 0;
  for (let k = 0; k < n; k++) if (t >= ats[k] - 0.02) i = k;
  const b = beats[i];
  const tk = tokFor(b);
  const next = i + 1 < n ? ats[i + 1] : Infinity;
  const tau = t - ats[i];
  const life = Math.max(0.4, (Number.isFinite(next) ? next : d) - ats[i]);
  const squeezes = mode === "brackets" && (toks(b.text).some((x) => x.accent) || i === n - 1);
  const outDur = squeezes ? 0.55 : 0.26;
  const out = Number.isFinite(next) ? clamp((t - (next - outDur)) / outDur) : squeezes && p.squeeze ? clamp((t - (d - outDur)) / outDur) : 0;
  const blk = layBlock(cc, tk, size0, s.safe.w, maxLines);
  const top = cy - blk.height / 2;
  const bracketed = mode === "brackets" && (tk.some((x) => x.accent) || i === n - 1);

  ctx.save();
  if (mode === "dolly") {
    // the phrase lands big and keeps easing away from the camera (v02)
    const k = lerp(1.16, 0.82, ease.smooth(clamp(tau / (life + 0.2))));
    ctx.translate(s.W / 2, cy);
    ctx.scale(k, k);
    ctx.translate(-s.W / 2, -cy);
  }
  if (out > 0 && !squeezes && mode !== "assemble") {
    ctx.globalAlpha *= 1 - out;
    ctx.translate(mode === "dolly" ? 0 : 0, -out * blk.size * 0.3);
    if (out > 0.05) ctx.filter = `blur(${(out * blk.size * 0.12).toFixed(1)}px)`;
  }

  if (mode === "type") {
    // typewriter with a tall caret; objects pop in when the caret reaches them (v04, v05, v07)
    const rate = 20 / Math.max(0.5, M().stagger);
    let shown = Math.max(0, tau * rate);
    let caret: { x: number; y: number } | null = null;
    const lineX = (ln: number) => (align === "center" ? s.W / 2 - blk.lines[ln].width / 2 : s.safe.x);
    for (const it of blk.items) {
      if (shown <= 0) break;
      const L = blk.lines[it.line];
      const x = lineX(it.line) + it.x;
      const y = top + L.y;
      if (it.kind === "word") {
        const nch = Math.min(it.text.length, Math.floor(shown));
        if (nch > 0) {
          D.text(ctx, it.text.slice(0, nch), x, y, blk.size, blk.weight, it.accent ? acc : fg, "left", -0.02, ROLE);
          caret = { x: x + D.measure(ctx, it.text.slice(0, nch), blk.size, blk.weight, -0.02, ROLE), y };
        }
        shown -= it.text.length + 1;
      } else {
        const q = sp(shown / rate, 0.45, 0.15);
        ctx.save();
        ctx.translate(x + it.w / 2, y - blk.size * 0.35);
        ctx.scale(0.5 + 0.5 * q, 0.5 + 0.5 * q);
        ctx.translate(-(x + it.w / 2), -(y - blk.size * 0.35));
        ctx.globalAlpha *= clamp(q * 1.5);
        drawTok(cc, it, x, y, blk.size, fg);
        ctx.restore();
        caret = { x: x + it.w, y };
        shown -= 2;
      }
    }
    const total = tk.reduce((a, x) => a + (x.kind === "word" ? x.text.length + 1 : 2), 0) / rate;
    if (caret && (tau < total || Math.floor((tau - total) * 2.2) % 2 === 0)) {
      ctx.fillStyle = D.solid(acc);
      ctx.fillRect(caret.x + blk.size * 0.06, caret.y - blk.size * 0.8, Math.max(2, blk.size * 0.06), blk.size * 0.98);
    }
    ctx.restore();
    return;
  }

  if (mode === "assemble") {
    // fragments fly in from scattered spots and click together; on exit they scatter again (v08)
    const R = rng(seed + i * 977);
    const frags: { t: Tok; x: number; y: number; w: number; sx: number; sy: number; ss: number; ex: number; ey: number; delay: number }[] = [];
    for (const it of blk.items) {
      const L = blk.lines[it.line];
      const lx = (align === "center" ? s.W / 2 - L.width / 2 : s.safe.x) + it.x;
      const y = top + L.y;
      const parts = it.kind === "word" && it.text.length > 4 ? [it.text.slice(0, Math.ceil(it.text.length / 2)), it.text.slice(Math.ceil(it.text.length / 2))] : [it.text];
      let px = lx;
      for (const part of parts) {
        const w = it.kind === "word" ? D.measure(ctx, part, blk.size, blk.weight, -0.02, ROLE) : it.w;
        const a = R() * Math.PI * 2;
        const r = (0.18 + R() * 0.3) * Math.min(s.W, s.H);
        const a2 = R() * Math.PI * 2;
        const r2 = (0.2 + R() * 0.32) * Math.min(s.W, s.H);
        frags.push({ t: { ...it, text: part }, x: px, y, w, sx: Math.cos(a) * r, sy: Math.sin(a) * r, ss: 0.45 + R() * 1.0, ex: Math.cos(a2) * r2, ey: Math.sin(a2) * r2, delay: R() * 0.25 });
        px += w;
      }
    }
    for (const f of frags) {
      const q = sp(tau - f.delay, 0.85);
      const o = ease.inCubic(clamp((out - f.delay * 0.5) / 0.8));
      if (q <= 0.001) continue;
      const dx = f.sx * (1 - q) + f.ex * o;
      const dy = f.sy * (1 - q) + f.ey * o;
      const sc = lerp(f.ss, 1, q) * (1 - 0.4 * o);
      ctx.save();
      ctx.globalAlpha *= clamp(q * 1.6) * (1 - o);
      ctx.translate(f.x + f.w / 2 + dx, f.y - blk.size * 0.35 + dy);
      ctx.scale(sc, sc);
      drawTok(cc, f.t, -f.w / 2, blk.size * 0.35, blk.size, f.t.accent ? acc : fg);
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // build / dolly / select / brackets / rotate: words land one at a time and the line re-centres
  const st = Math.min(0.16, 0.95 / Math.max(1, tk.length)) * M().stagger * (mode === "dolly" ? 0.7 : 1);
  const rotWords: string[] = mode === "rotate" ? arr(p.words).map(String).slice(0, 8) : [];
  const lastWord = tk.length - 1;
  // rotating last word: which word shows and the swap progress
  let rot: { from: string; to: string; k: number } | null = null;
  if (rotWords.length && tk[lastWord]?.kind === "word") {
    const seq = [tk[lastWord].text, ...rotWords];
    const t0 = 0.55 + tk.length * st;
    const t1 = Math.max(t0 + 0.4, (Number.isFinite(next) ? next : d) - ats[i] - 0.25);
    const each = (t1 - t0) / Math.max(1, seq.length - 1);
    const j = clamp(Math.floor((tau - t0) / each), -1, seq.length - 2);
    const k = j < 0 ? 0 : sp(tau - t0 - j * each, 0.42);
    rot = j < 0 ? { from: seq[0], to: seq[0], k: 1 } : { from: seq[j], to: seq[j + 1], k };
  }
  const wOf = (it: Placed) => {
    if (rot && it.i === lastWord) {
      const wa = D.measure(ctx, rot.from, blk.size, blk.weight, -0.02, ROLE);
      const wb = D.measure(ctx, rot.to, blk.size, blk.weight, -0.02, ROLE);
      return lerp(wa, wb, rot.k);
    }
    return it.w;
  };
  const gap = blk.size * 0.26;
  const qOf = blk.items.map((it) => sp(tau - it.i * st, 0.55));
  const lineW = blk.lines.map((L) => blk.items.slice(L.from, L.to).reduce((a, it) => a + (wOf(it) + gap) * clamp(qOf[it.i] * 1.35), 0) - gap);
  // selection sweep over the accent words (v07 "Different", v06 "Select it.")
  const selStart = 0.45 + tk.length * st;
  const accIdx = blk.items.filter((it) => it.accent).map((it) => it.i);
  const pos: { x: number; y: number }[] = [];
  blk.lines.forEach((L, ln) => {
    let x = align === "center" ? s.W / 2 - lineW[ln] / 2 : s.safe.x;
    for (const it of blk.items.slice(L.from, L.to)) {
      pos[it.i] = { x, y: top + L.y };
      x += (wOf(it) + gap) * clamp(qOf[it.i] * 1.35);
    }
  });
  // brackets frame the phrase, then squeeze it to nothing (v07)
  let clipL = -Infinity;
  let clipR = Infinity;
  if (bracketed) {
    const widest = Math.max(...lineW);
    const bq = sp(tau - 0.2, 0.6);
    const sq = ease.inOutCubic(out);
    const half = lerp(widest / 2 + blk.size * 1.4, widest / 2 + blk.size * 0.5, bq) * (1 - sq) + blk.size * 0.12 * sq;
    clipL = s.W / 2 - half + blk.size * 0.12;
    clipR = s.W / 2 + half - blk.size * 0.12;
    const bh = blk.height + blk.size * 0.5;
    const by = top - blk.size * 0.12;
    ctx.save();
    ctx.globalAlpha *= clamp(bq * 1.5) * (1 - clamp((out - 0.85) / 0.15));
    bracketGlyph(ctx, s.W / 2 - half, by, bh, 1, D.solid(acc), Math.max(2, blk.size * 0.06));
    bracketGlyph(ctx, s.W / 2 + half, by, bh, -1, D.solid(acc), Math.max(2, blk.size * 0.06));
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipL, 0, Math.max(0, clipR - clipL), s.H);
    ctx.clip();
  }
  for (const it of blk.items) {
    const q = qOf[it.i];
    if (q <= 0.001) continue;
    const { x, y } = pos[it.i];
    let color = it.accent ? acc : fg;
    ctx.save();
    ctx.globalAlpha *= clamp(q * 1.5) * (it.accent || !col.dimAlpha ? 1 : col.dimAlpha);
    const bl = (1 - clamp(q)) * blk.size * 0.16;
    if (bl > 0.5) ctx.filter = `blur(${bl.toFixed(1)}px)`;
    const dy = (1 - q) * blk.size * 0.32;
    if (mode === "select" && it.accent) {
      const k = accIdx.indexOf(it.i);
      const sw = ease.outCubic(clamp((tau - selStart - k * 0.28) / 0.3));
      color = sw > 0.5 ? palT.onAccent : fg;
      if (sw > 0) {
        const pad = blk.size * 0.08;
        ctx.fillStyle = D.solid(acc);
        ctx.fillRect(x - pad, y - blk.size * 0.86 + dy, (it.w + pad * 2) * sw, blk.size * 1.08);
      }
    }
    if (rot && it.i === lastWord) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - blk.size * 0.2, y - blk.size * 1.05, wOf(it) + blk.size * 0.6, blk.size * 1.4);
      ctx.clip();
      if (rot.k < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - rot.k;
        D.text(ctx, rot.from, x, y - rot.k * blk.size * 0.7, blk.size, blk.weight, acc, "left", -0.02, ROLE);
        ctx.restore();
      }
      ctx.globalAlpha *= clamp(rot.k * 1.4);
      D.text(ctx, rot.to, x, y + (1 - rot.k) * blk.size * 0.7 + dy, blk.size, blk.weight, acc, "left", -0.02, ROLE);
      ctx.restore();
    } else {
      const sc = 0.92 + 0.08 * clamp(q);
      ctx.translate(x + it.w / 2, y - blk.size * 0.3);
      ctx.scale(sc, sc);
      ctx.translate(-(x + it.w / 2), -(y - blk.size * 0.3));
      drawTok(cc, it, x, y + dy, blk.size, color);
    }
    ctx.restore();
  }
  if (bracketed) ctx.restore();
  // sparkles twinkle by the accent words (v02)
  if (p.sparkles) {
    blk.items
      .filter((it) => it.accent)
      .slice(0, 2)
      .forEach((it, k) => {
        const q = sp(tau - it.i * st - 0.15, 0.6);
        if (q <= 0.01) return;
        const { x, y } = pos[it.i];
        const tw = 0.75 + 0.25 * Math.sin(t * 5 + k * 2);
        ctx.save();
        ctx.globalAlpha *= clamp(q) * (1 - out);
        sparkle(ctx, x + it.w + blk.size * 0.12, y - blk.size * 0.95 - (1 - q) * 20 * u, blk.size * 0.13 * tw, D.solid(acc));
        sparkle(ctx, x - blk.size * 0.08, y + blk.size * 0.22, blk.size * 0.08 * (1.5 - tw), D.solid(acc));
        ctx.restore();
      });
  }
  ctx.restore();
};

/** Words of a block landing one by one (used by stack mode). */
function wordsIn(c: SceneCtx, blk: Block, align: "left" | "center", top: number, start: number, fg: string, acc: string, st: number) {
  const { ctx, s, t } = c;
  const gap = blk.size * 0.26;
  blk.lines.forEach((L) => {
    let x = align === "center" ? s.W / 2 - L.width / 2 : s.safe.x;
    for (const it of blk.items.slice(L.from, L.to)) {
      const q = sp(t - start - it.i * st, 0.55);
      if (q > 0.001) {
        ctx.save();
        ctx.globalAlpha *= clamp(q * 1.5);
        const bl = (1 - clamp(q)) * blk.size * 0.14;
        if (bl > 0.5) ctx.filter = `blur(${bl.toFixed(1)}px)`;
        drawTok(c, it, x, top + L.y + (1 - q) * blk.size * 0.3, blk.size, it.accent ? acc : fg);
        ctx.restore();
      }
      x += it.w + gap;
    }
  });
}

const hashNum = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

type VerbEffect = "bounce" | "select" | "write" | "drop" | "scan" | "glow" | "glitch" | "stamp" | "strike" | "dissolve" | "type" | "count" | "slide";

/**
 * Type that acts out its verb (Apple Creator Studio): one short phrase per beat, each animated the
 * way it means. "File it." stamps, "Track it." scans, "Relax." glows, "Scrap it." drops away.
 */
const verbs: Template = (c) => {
  const { ctx, s, p, t, d, pal } = c;
  const u = s.u;
  const items = arr<any>(p.items)
    .slice(0, 10)
    .map((x) => (typeof x === "string" ? { text: x } : { text: str(x?.text), effect: x?.effect, at: x?.at, accent: x?.accent }));
  if (!items.length) return c.warn(`Scene "${c.scene.id}": verbs needs props.items.`);
  const n = items.length;
  const span = Math.max(0.45, (d - 0.2) / n);
  const ats = items.map((it, i) => (it.at !== undefined && Number.isFinite(+it.at) ? +it.at : 0.1 + i * span));
  let i = 0;
  for (let k = 0; k < n; k++) if (t >= ats[k] - 0.02) i = k;
  const it = items[i];
  const eff: VerbEffect = it.effect ?? (["stamp", "scan", "glow", "bounce", "select", "write"] as VerbEffect[])[i % 6];
  const next = i + 1 < n ? ats[i + 1] : d + 1;
  const tau = t - ats[i];
  const life = Math.max(0.3, next - ats[i]);
  const outK = next <= d ? clamp((t - (next - 0.16)) / 0.16) : 0;
  const size0 = (s.portrait ? 150 : s.landscape ? 160 : 130) * u * (p.size === "l" ? 0.75 : 1);
  const weight = 600;
  const role: D.Role = "head";
  const txt = D.upperFor(role) ? it.text.toUpperCase() : it.text;
  let size = size0;
  while (D.measure(ctx, txt, size, weight, -0.02, role) > s.safe.w && size > size0 * 0.45) size *= 0.92;
  const width = D.measure(ctx, txt, size, weight, -0.02, role);
  const x0 = s.W / 2 - width / 2;
  const y = s.safe.y + s.safe.h * (s.portrait ? 0.48 : 0.52) + size * 0.32;
  const accent = D.solid(pal.highlight === pal.fg ? pal.accent : pal.highlight);
  const color = it.accent ? accent : pal.fg;
  D.setFont(ctx, weight, size, -0.02, role);
  const chars = [...txt];
  const xs: number[] = [];
  let acc = "";
  for (const ch of chars) {
    xs.push(x0 + ctx.measureText(acc).width);
    acc += ch;
  }
  const R = rng(hashNum(c.scene.id) + i * 131);
  const letter = (k: number, dx: number, dy: number, alpha: number, col: string, sc = 1, rot = 0) => {
    if (alpha <= 0.002) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    D.setFont(ctx, weight, size, -0.02, role);
    ctx.fillStyle = D.paint(ctx, col, xs[k], y - size, xs[k] + size, y);
    ctx.textBaseline = "alphabetic";
    const cw = ctx.measureText(chars[k]).width;
    ctx.translate(xs[k] + cw / 2 + dx, y - size * 0.35 + dy);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.fillText(chars[k], -cw / 2, size * 0.35);
    ctx.restore();
  };
  ctx.save();
  if (outK > 0 && eff !== "dissolve" && eff !== "drop") {
    ctx.globalAlpha *= 1 - outK;
    if (outK > 0.1) ctx.filter = `blur(${(outK * size * 0.1).toFixed(1)}px)`;
  }
  switch (eff) {
    case "bounce": {
      // letters hop in on the beat
      chars.forEach((_, k) => {
        const q = spring(tau - k * 0.045, 0.5, 0.35);
        letter(k, 0, -(1 - q) * size * 0.9 + Math.sin(clamp(tau - k * 0.045) * Math.PI) * -size * 0.12, clamp(q * 2), color);
      });
      break;
    }
    case "select": {
      // a marquee is dragged across the word, which takes the accent
      const q = ease.outCubic(clamp((tau - 0.15) / 0.45));
      const pad = size * 0.14;
      chars.forEach((_, k) => letter(k, 0, 0, 1, q > 0.98 ? accent : pal.fg));
      if (tau > 0.1) {
        ctx.save();
        ctx.setLineDash([size * 0.08, size * 0.06]);
        ctx.lineDashOffset = -t * size * 0.5;
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(2, size * 0.025);
        ctx.strokeRect(x0 - pad, y - size * 0.95, (width + pad * 2) * q, size * 1.25);
        ctx.globalAlpha *= 0.14;
        ctx.fillStyle = accent;
        ctx.fillRect(x0 - pad, y - size * 0.95, (width + pad * 2) * q, size * 1.25);
        ctx.restore();
        D.cursor(ctx, x0 - pad + (width + pad * 2) * q, y + size * 0.3, size * 0.28, clamp(tau * 4) * (1 - clamp((tau - 0.9) * 3)), "arrow");
      }
      break;
    }
    case "write": {
      // written left to right behind a moving pen point
      const q = ease.inOutCubic(clamp(tau / Math.min(0.9, life * 0.7)));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - size * 0.2, y - size * 1.3, (width + size * 0.4) * q, size * 1.8);
      ctx.clip();
      chars.forEach((_, k) => letter(k, 0, 0, 1, color));
      ctx.restore();
      if (q < 1) {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(x0 + width * q, y - size * 0.3 + Math.sin(q * 30) * size * 0.08, size * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "drop": {
      // letters land from above, then fall away on exit
      chars.forEach((_, k) => {
        const q = spring(tau - k * 0.035, 0.45, 0.25);
        const fall = ease.inCubic(clamp((t - (next - 0.3) - k * 0.02) / 0.3));
        letter(k, 0, -(1 - q) * size * 1.4 + fall * size * 2.2, clamp(q * 2) * (1 - fall), color, 1, fall * (R() - 0.5) * 0.8);
      });
      break;
    }
    case "scan": {
      // a scan line passes and leaves the word sharp and bright
      const q = ease.inOutCubic(clamp((tau - 0.1) / 0.6));
      const sx = x0 - size * 0.2 + (width + size * 0.4) * q;
      ctx.save();
      ctx.filter = `blur(${(size * 0.06).toFixed(1)}px)`;
      ctx.beginPath();
      ctx.rect(sx, 0, s.W, s.H);
      ctx.clip();
      chars.forEach((_, k) => letter(k, 0, 0, 0.35, pal.fg));
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, sx, s.H);
      ctx.clip();
      chars.forEach((_, k) => letter(k, 0, 0, 1, color));
      ctx.restore();
      if (q < 1) {
        const g = ctx.createLinearGradient(sx - size * 0.3, 0, sx, 0);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, accent);
        ctx.fillStyle = g;
        ctx.globalAlpha *= 0.5;
        ctx.fillRect(sx - size * 0.3, y - size * 1.05, size * 0.3, size * 1.4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = accent;
        ctx.fillRect(sx, y - size * 1.1, Math.max(2, size * 0.02), size * 1.5);
      }
      break;
    }
    case "glow": {
      const q = sp(tau, 0.7);
      ctx.save();
      ctx.shadowColor = accent;
      ctx.shadowBlur = size * (0.15 + 0.35 * q) * (0.85 + 0.15 * Math.sin(t * 4));
      chars.forEach((_, k) => letter(k, 0, (1 - q) * size * 0.15, clamp(q * 1.4), color, 0.94 + 0.06 * q));
      ctx.restore();
      break;
    }
    case "glitch": {
      // letters flicker through other glyphs and colours before they settle
      const pool = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789₦%#";
      chars.forEach((ch, k) => {
        const settle = 0.25 + k * 0.05 + R() * 0.2;
        if (tau >= settle || ch === " ") return letter(k, 0, 0, 1, color);
        const step = Math.floor(t * 18);
        const RR = rng(hashNum(c.scene.id) + k * 7 + step * 13);
        const g2 = pool[Math.floor(RR() * pool.length)];
        ctx.save();
        D.setFont(ctx, weight, size, -0.02, role);
        ctx.fillStyle = RR() > 0.5 ? accent : pal.fg;
        ctx.globalAlpha *= clamp(tau * 6);
        ctx.fillText(g2, xs[k], y + (RR() - 0.5) * size * 0.1);
        ctx.restore();
      });
      break;
    }
    case "stamp": {
      // slams down from big and settles, with a ring and a nudge (Filed. Paid. Done.)
      const q = clamp(tau / 0.18);
      const k = q < 1 ? lerp(2.4, 1, ease.inCubic(q)) : 1;
      const shake = tau > 0.18 && tau < 0.42 ? Math.sin((tau - 0.18) * 70) * size * 0.03 * (1 - (tau - 0.18) / 0.24) : 0;
      ctx.save();
      ctx.translate(s.W / 2 + shake, y - size * 0.35);
      ctx.scale(k, k);
      ctx.translate(-s.W / 2, -(y - size * 0.35));
      chars.forEach((_, j) => letter(j, 0, 0, clamp(q * 2), color));
      ctx.restore();
      if (tau > 0.17 && tau < 0.75) {
        const r = ease.outCubic(clamp((tau - 0.17) / 0.55));
        ctx.save();
        ctx.globalAlpha *= (1 - r) * 0.6;
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(2, size * 0.04 * (1 - r));
        D.rrect(ctx, x0 - size * 0.3 - r * size * 0.6, y - size * 1.05 - r * size * 0.4, width + size * 0.6 + r * size * 1.2, size * 1.45 + r * size * 0.8, size * 0.3);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case "strike": {
      chars.forEach((_, k) => letter(k, 0, 0, clamp(tau * 5), pal.fg));
      const q = ease.inOutCubic(clamp((tau - 0.3) / 0.35));
      if (q > 0) {
        ctx.fillStyle = accent;
        ctx.fillRect(x0 - size * 0.08, y - size * 0.4, (width + size * 0.16) * q, Math.max(3, size * 0.07));
      }
      break;
    }
    case "dissolve": {
      // lands, then breaks into drifting specks
      const q = sp(tau, 0.5);
      const o = ease.inCubic(clamp((t - (next - 0.45)) / 0.45));
      chars.forEach((_, k) => {
        const RR = rng(hashNum(c.scene.id) + k * 53 + i);
        letter(k, (RR() - 0.5) * size * 0.8 * o, -RR() * size * 1.4 * o, clamp(q * 1.5) * (1 - o), color, 1 - 0.5 * o);
        if (o > 0) {
          for (let j = 0; j < 5; j++) {
            ctx.save();
            ctx.globalAlpha *= o * (1 - o) * 2.2;
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.arc(xs[k] + RR() * size * 0.6 + (RR() - 0.5) * size * 2 * o, y - RR() * size - size * 2 * o * RR(), size * 0.025 * (1 + RR()), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      });
      break;
    }
    case "count": {
      // the number in the phrase rolls up (₦0 → ₦4,812)
      const m = it.text.match(/([₦$£€]?)([\d,]+(?:\.\d+)?)(.*)$/);
      if (m) {
        const before = it.text.slice(0, it.text.indexOf(m[0]));
        const target = Number(m[2].replace(/,/g, ""));
        const dec = (m[2].split(".")[1] ?? "").length;
        const v = target * ease.outCubic(clamp(tau / Math.min(0.9, life * 0.6)));
        const shown = `${before}${m[1]}${formatNumber(v, { decimals: dec })}${m[3]}`;
        const w2 = D.measure(ctx, shown, size, weight, -0.02, role);
        D.text(ctx, shown, s.W / 2 - w2 / 2, y, size, weight, color, "left", -0.02, role);
      } else chars.forEach((_, k) => letter(k, 0, 0, clamp(tau * 4), color));
      break;
    }
    case "type": {
      const nch = Math.floor(tau * 22);
      chars.forEach((_, k) => letter(k, 0, 0, k < nch ? 1 : 0, color));
      if (Math.floor(t * 2.2) % 2 === 0 || nch < chars.length) {
        const cx = nch >= chars.length ? x0 + width : xs[Math.max(0, nch)] ?? x0;
        ctx.fillStyle = accent;
        ctx.fillRect(cx + size * 0.04, y - size * 0.82, Math.max(2, size * 0.06), size * 1);
      }
      break;
    }
    default: {
      // slide: the phrase arrives from the side with a smear
      const q = sp(tau, 0.45);
      chars.forEach((_, k) => letter(k, (1 - q) * size * 2, 0, clamp(q * 2), color));
    }
  }
  ctx.restore();
  void u;
};

/**
 * Document scan (iBanPay): a receipt, invoice or statement spins in between two halves of a
 * sentence, straightens, gets scan brackets, and its key fields light up one by one.
 */
const doc: Template = (c) => {
  const { ctx, s, p, t, pal } = c;
  const u = s.u;
  const id = str(p.image) || undefined;
  const info = c.mediaInfo(id);
  const ar = info ? info.width / info.height : 0.72;
  const hasSides = !!(p.before || p.after);
  // stage 1: small, spinning, between the words; stage 2: big and flat for the scan
  const grow = ease.inOutCubic(clamp((t - 1.25) / 0.7));
  const spin = sp(t - 0.15, 1.1);
  const maxH = s.safe.h * (s.portrait ? 0.62 : 0.78);
  const maxW = s.safe.w * (s.landscape ? 0.42 : s.square ? 0.5 : 0.82);
  const bigH = Math.min(maxH, maxW / ar);
  const smallH = bigH * (s.portrait ? 0.42 : 0.5);
  const h = lerp(smallH, bigH, grow);
  const w = h * ar;
  const chipsSide = !s.portrait;
  const values = arr<any>(p.values).slice(0, 4);
  const docCx = chipsSide && values.length ? lerp(s.W / 2, s.safe.x + s.safe.w * (s.square ? 0.27 : 0.34), grow) : s.W / 2;
  const docCy = s.safe.y + s.safe.h * (s.portrait ? 0.42 : 0.5) - (s.portrait && values.length ? grow * s.safe.h * 0.06 : 0);
  const box = { x: docCx - w / 2, y: docCy - h / 2, w, h };
  // sentence halves either side (they fade as the document takes over)
  if (hasSides) {
    const ts = (s.portrait ? 74 : 70) * u;
    const fade = 1 - clamp((t - 1.15) / 0.35);
    const qa = sp(t - 0.05, 0.6);
    const qb = sp(t - 0.35, 0.6);
    const gapX = smallH * ar * 0.5 + ts * 0.6;
    const col = headColors(c, false);
    ctx.save();
    ctx.globalAlpha *= fade;
    if (s.portrait) {
      if (p.before) {
        ctx.save();
        ctx.globalAlpha *= clamp(qa * 1.5);
        D.text(ctx, str(p.before), s.W / 2, docCy - smallH / 2 - ts * 0.9 + (1 - qa) * 30 * u, ts, 500, col.color, "center", -0.02, "display");
        ctx.restore();
      }
      if (p.after) {
        ctx.save();
        ctx.globalAlpha *= clamp(qb * 1.5);
        D.text(ctx, str(p.after), s.W / 2, docCy + smallH / 2 + ts * 1.5 + (1 - qb) * 30 * u, ts, 500, col.hl, "center", -0.02, "display");
        ctx.restore();
      }
    } else {
      if (p.before) {
        ctx.save();
        ctx.globalAlpha *= clamp(qa * 1.5);
        D.text(ctx, str(p.before), s.W / 2 - gapX - (1 - qa) * 40 * u, docCy + ts * 0.3, ts, 500, col.color, "right", -0.02, "display");
        ctx.restore();
      }
      if (p.after) {
        ctx.save();
        ctx.globalAlpha *= clamp(qb * 1.5);
        D.text(ctx, str(p.after), s.W / 2 + gapX + (1 - qb) * 40 * u, docCy + ts * 0.3, ts, 500, col.hl, "left", -0.02, "display");
        ctx.restore();
      }
    }
    ctx.restore();
  } else if (p.title) {
    headerBlock(c, s.W / 2, s.safe.y, s.safe.w, { title: p.title, kicker: p.kicker, size: (s.portrait ? 70 : 60) * u, align: "center", start: 0.1 });
  }
  // the page, spinning in on its vertical axis, then flat
  const tilt: D.Tilt = { rx: (1 - spin) * 0.5 * (1 - grow) + 0.08 * (1 - grow), ry: ((1 - spin) * 2.6 + 0.32) * (1 - grow), rz: (1 - spin) * -0.3 * (1 - grow) };
  const enter = clamp(spin * 2);
  if (enter <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= enter;
  D.tilted(ctx, s, box, tilt, (g) => {
    g.save();
    g.shadowColor = "rgba(8,16,40,0.35)";
    g.shadowBlur = 50 * u;
    g.shadowOffsetY = 18 * u;
    D.rrect(g as any, box.x, box.y, box.w, box.h, 10 * u);
    g.fillStyle = "#FFFFFF";
    g.fill();
    g.restore();
    if (id && info) drawMedia({ ...c, ctx: g as any }, g as any, id, {}, box, { r: 10 * u, fit: "cover" });
    else paperInvoice(g as any, box, u, p, pal);
  }, 2);
  ctx.restore();
  // scan brackets snap in, a scan line passes, the fields light up
  const bq = sp(t - 1.85, 0.5, 0.15);
  if (bq > 0.01) {
    const accent = D.solid(pal.highlight === pal.fg ? pal.accent : pal.highlight);
    const off = (1 - bq) * 70 * u + 16 * u;
    const arm = Math.min(w, h) * 0.12;
    ctx.save();
    ctx.globalAlpha *= clamp(bq * 1.5);
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(3, 6 * u);
    ctx.lineCap = "round";
    const corners: [number, number, number, number][] = [
      [box.x - off, box.y - off, 1, 1],
      [box.x + w + off, box.y - off, -1, 1],
      [box.x - off, box.y + h + off, 1, -1],
      [box.x + w + off, box.y + h + off, -1, -1],
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
      ctx.stroke();
    }
    ctx.restore();
    const sl = ease.inOutCubic(clamp((t - 2.05) / 0.9));
    if (sl > 0 && sl < 1) {
      const yy = box.y + h * sl;
      const g = ctx.createLinearGradient(0, yy - 60 * u, 0, yy);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, accent);
      ctx.save();
      ctx.globalAlpha *= 0.35;
      ctx.fillStyle = g;
      ctx.fillRect(box.x, yy - 60 * u, w, 60 * u);
      ctx.restore();
      ctx.fillStyle = accent;
      ctx.fillRect(box.x - 10 * u, yy - 1.5 * u, w + 20 * u, Math.max(2, 3 * u));
    }
    const fields = arr<any>(p.fields).slice(0, 6);
    // without an image the drawn invoice's vendor, VAT and total lines light up
    const fieldsUse = fields.length ? fields : id ? [] : [{ x: 0.05, y: 0.095, w: 0.52, h: 0.055 }, { x: 0.47, y: 0.785, w: 0.49, h: 0.055 }, { x: 0.47, y: 0.85, w: 0.49, h: 0.065 }];
    fieldsUse.forEach((f, k) => {
      const q = sp(t - (2.35 + k * 0.4), 0.45, 0.1);
      if (q <= 0.01) return;
      const fx = box.x + clamp(+f.x) * w;
      const fy = box.y + clamp(+f.y) * h;
      const fw = clamp(+f.w || 0.3, 0.02, 1) * w;
      const fh = clamp(+f.h || 0.08, 0.02, 1) * h;
      ctx.save();
      ctx.globalAlpha *= clamp(q * 1.4);
      const grow2 = (1 - q) * 10 * u;
      D.rrect(ctx, fx - 6 * u - grow2, fy - 6 * u - grow2, fw + 12 * u + grow2 * 2, fh + 12 * u + grow2 * 2, 8 * u);
      ctx.fillStyle = accent;
      ctx.globalAlpha *= 0.14;
      ctx.fill();
      ctx.globalAlpha /= 0.14;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, 3 * u);
      ctx.stroke();
      if (f.label) D.pill(ctx, fx + fw + 12 * u, fy + fh / 2 - 22 * u, 44 * u, str(f.label), accent, "#FFFFFF", { chevron: false, u });
      ctx.restore();
    });
    // extracted values pop out beside (16:9) or under (9:16, 1:1) the page
    const vh = (s.portrait ? 96 : 84) * u;
    values.forEach((v, k) => {
      const q = sp(t - (2.5 + k * 0.35), 0.55, 0.1);
      if (q <= 0.01) return;
      const label = str(v?.label ?? v);
      const value = str(v?.value ?? "");
      const cw = chipsSide ? s.safe.w * (s.square ? 0.44 : 0.4) : Math.min(s.safe.w, 760 * u);
      const cx = chipsSide ? s.safe.x + s.safe.w * (s.square ? 0.56 : 0.6) : s.W / 2 - cw / 2;
      const cyy = chipsSide ? s.H / 2 - (values.length * (vh + 18 * u)) / 2 + k * (vh + 18 * u) : box.y + h + 70 * u + k * (vh + 14 * u);
      if (!chipsSide && cyy + vh > s.safe.y + s.safe.h) return;
      ctx.save();
      ctx.globalAlpha *= clamp(q * 1.5);
      ctx.translate((1 - q) * (chipsSide ? 60 : 0) * u, (1 - q) * (chipsSide ? 0 : 30) * u);
      D.card(ctx, cx, cyy, cw, vh, 22 * u, pal.card, u, { elevation: 0.8, border: pal.cardBorder });
      D.icon(ctx, "circle-check", cx + 26 * u, cyy + vh / 2 - 17 * u, 34 * u, accent, clamp((q - 0.4) * 2), 2.2);
      D.text(ctx, label, cx + 76 * u, cyy + vh / 2 + 11 * u, 30 * u, 500, pal.cardMuted);
      if (value) D.text(ctx, value, cx + cw - 26 * u, cyy + vh / 2 + 12 * u, 34 * u, 600, pal.cardFg, "right", -0.01, "head");
      ctx.restore();
    });
  }
};

/** A plain invoice drawn natively when no document image is given. */
function paperInvoice(g: Ctx, box: { x: number; y: number; w: number; h: number }, u: number, p: Record<string, any>, pal: Palette) {
  const { x, y, w, h } = box;
  const k = w / 600;
  const ink = "#0B1F44";
  const soft = "#E7ECF5";
  D.text(g, str(p.docTitle, "INVOICE"), x + 40 * k, y + 70 * k, 34 * k, 700, ink, "left", 0.04, "head");
  D.text(g, str(p.docFrom, "Adaeze Pharmacy Ltd"), x + 40 * k, y + 110 * k, 20 * k, 400, "#5B6B8C");
  g.fillStyle = D.brandColors() ? D.BRAND.primary : pal.accent;
  g.fillRect(x + w - 120 * k, y + 44 * k, 80 * k, 30 * k);
  const rows = arr<any>(p.rows).slice(0, 6);
  const lines = rows.length ? rows : [{ label: "Paracetamol 500mg x 40", value: "₦48,000" }, { label: "Vitamin C syrup x 25", value: "₦31,250" }, { label: "Amoxicillin 250mg x 20", value: "₦22,500" }, { label: "Hand sanitiser x 12", value: "₦8,750" }, { label: "Delivery", value: "₦5,000" }];
  lines.forEach((r, i) => {
    const yy = y + (200 + i * 62) * k;
    g.fillStyle = soft;
    g.fillRect(x + 40 * k, yy + 22 * k, w - 80 * k, 2 * k);
    D.text(g, str(r?.label ?? r), x + 40 * k, yy, 21 * k, 400, ink);
    D.text(g, str(r?.value ?? ""), x + w - 40 * k, yy, 21 * k, 600, ink, "right");
  });
  const ty = y + h - 150 * k;
  D.text(g, "VAT (7.5%)", x + w * 0.5, ty, 21 * k, 400, "#5B6B8C");
  D.text(g, str(p.vat, "₦8,662.50"), x + w - 40 * k, ty, 21 * k, 600, ink, "right");
  D.text(g, "Total", x + w * 0.5, ty + 56 * k, 26 * k, 700, ink);
  D.text(g, str(p.total, "₦124,162.50"), x + w - 40 * k, ty + 56 * k, 26 * k, 700, ink, "right");
  void u;
}

/**
 * Showcase of screens: a tilted wall that drifts (ConversBank), a filmstrip that steps from card to
 * card under a swapping label (Lovio, Gemini), or a mosaic where one card lifts out and fills the frame.
 */
const wall: Template = (c) => {
  const { ctx, s, p, t, d, pal } = c;
  const u = s.u;
  const ids = arr<any>(p.items)
    .map((x) => (typeof x === "string" ? { media: x } : { media: str(x?.media ?? x?.image), label: x?.label }))
    .filter((x) => x.media)
    .slice(0, 12);
  const layout = p.layout === "carousel" || p.layout === "mosaic" ? p.layout : "wall";
  const card = (g: Ctx, x: number, y: number, w: number, h: number, id: string | undefined, alpha = 1, glow = false) => {
    if (alpha <= 0.002) return;
    g.save();
    g.globalAlpha *= alpha;
    g.shadowColor = glow ? D.solid(pal.accent) : "rgba(8,16,40,0.3)";
    g.shadowBlur = (glow ? 50 : 30) * u;
    g.shadowOffsetY = glow ? 0 : 12 * u;
    D.rrect(g, x, y, w, h, D.radius(26 * u));
    g.fillStyle = pal.card;
    g.fill();
    g.restore();
    g.save();
    g.globalAlpha *= alpha;
    if (id) drawMedia({ ...c, ctx: g }, g, id, {}, { x, y, w, h }, { r: D.radius(26 * u), fit: "cover" });
    else {
      g.fillStyle = pal.softCard;
      D.rrect(g, x + w * 0.08, y + h * 0.1, w * 0.5, h * 0.08, 6 * u);
      g.fill();
      g.fillStyle = pal.subtle;
      D.rrect(g, x + w * 0.08, y + h * 0.26, w * 0.84, h * 0.5, 10 * u);
      g.fill();
    }
    g.restore();
  };
  if (!ids.length) c.warn(`Scene "${c.scene.id}": wall needs props.items with screenshots or photos; drawing placeholders.`);
  const pick = (k: number) => (ids.length ? ids[((k % ids.length) + ids.length) % ids.length] : { media: undefined as string | undefined, label: undefined as string | undefined });
  if (layout === "wall") {
    // a tilted, endless grid of screens drifting diagonally
    const cw = (s.landscape ? 420 : 380) * u;
    const ch = cw * (p.portraitCards ? 2 : 0.66);
    const gx = cw + 40 * u;
    const gy = ch + 40 * u;
    const drift = t * 60 * u;
    const box = { x: -s.W * 0.25, y: -s.H * 0.25, w: s.W * 1.5, h: s.H * 1.5 };
    const tq = sp(t, 1.4);
    D.tilted(ctx, s, { x: 0, y: 0, w: s.W, h: s.H }, { rx: 0.5 * (0.8 + 0.2 * tq), ry: 0, rz: -0.35 }, (g) => {
      for (let row = -1; row < Math.ceil(box.h / gy) + 1; row++) {
        for (let col = -1; col < Math.ceil(box.w / gx) + 1; col++) {
          const off = (row % 2) * gx * 0.5;
          const x = box.x + col * gx + off + (drift % gx);
          const y = box.y + row * gy - ((drift * 0.6) % gy);
          const it = pick(row * 7 + col * 3);
          const q = sp(t - 0.05 * ((row + col + 4) % 6), 0.8);
          card(g as any, x, y + (1 - q) * 80 * u, cw, ch, it.media, clamp(q * 1.4));
        }
      }
    }, 3);
    // vignette and the title over it
    const vg = ctx.createRadialGradient(s.W / 2, s.H / 2, Math.min(s.W, s.H) * 0.2, s.W / 2, s.H / 2, Math.max(s.W, s.H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, c.theme === "light" ? "rgba(255,255,255,0.75)" : "rgba(5,10,25,0.8)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, s.W, s.H);
    if (p.title) {
      const bandY = s.safe.y + s.safe.h * 0.38;
      const bq = sp(t - 0.35, 0.8);
      const band = ctx.createLinearGradient(0, bandY - 220 * u, 0, bandY + 420 * u);
      const dark = c.theme !== "light";
      band.addColorStop(0, dark ? "rgba(5,10,25,0)" : "rgba(255,255,255,0)");
      band.addColorStop(0.4, dark ? "rgba(5,10,25,0.86)" : "rgba(255,255,255,0.9)");
      band.addColorStop(0.6, dark ? "rgba(5,10,25,0.86)" : "rgba(255,255,255,0.9)");
      band.addColorStop(1, dark ? "rgba(5,10,25,0)" : "rgba(255,255,255,0)");
      ctx.save();
      ctx.globalAlpha *= clamp(bq * 1.4);
      ctx.fillStyle = band;
      ctx.fillRect(0, bandY - 220 * u, s.W, 640 * u);
      ctx.restore();
      headerBlock(c, s.W / 2, bandY, s.safe.w, { title: p.title, kicker: p.kicker, size: (s.portrait ? 96 : 92) * u, align: "center", start: 0.5, highlight: arr(p.highlight) });
    }
    return;
  }
  if (layout === "carousel") {
    // a filmstrip steps card to card; brackets hold the centre; the label above swaps
    const n = Math.max(1, ids.length || 4);
    const every = Math.max(0.6, (d - 0.6) / n);
    const step = springSteps(t, 0, Array.from({ length: n - 1 }, (_, k) => ({ at: 0.6 + (k + 1) * every, to: k + 1 })), 0.55 * M().settle);
    const cw = Math.min(s.safe.w * (s.portrait ? 0.8 : 0.5), (s.portrait ? 820 : 900) * u);
    const ch = cw * (p.portraitCards ? 1.8 : 0.62);
    const cy = s.safe.y + s.safe.h * (s.portrait ? 0.55 : 0.58) - ch / 2;
    const gapX = cw * 1.08;
    for (let k = -2; k < n + 2; k++) {
      const off = k - step;
      if (Math.abs(off) > 2.2) continue;
      const sc = lerp(1, 0.78, clamp(Math.abs(off)));
      const w = cw * sc;
      const h = ch * sc;
      const x = s.W / 2 + off * gapX - w / 2;
      const y = cy + (ch - h) / 2;
      const q = sp(t - 0.05 - Math.abs(k) * 0.06, 0.7);
      card(ctx, x, y + (1 - q) * 60 * u, w, h, pick(k).media, clamp(q * 1.5) * lerp(1, 0.45, clamp(Math.abs(off))), Math.abs(off) < 0.2 && c.theme !== "light");
    }
    const bq = sp(t - 0.5, 0.5);
    const accent = D.solid(pal.highlight === pal.fg ? pal.accent : pal.highlight);
    ctx.save();
    ctx.globalAlpha *= clamp(bq * 1.5);
    const half = cw / 2 + 40 * u + (1 - bq) * 60 * u;
    bracketGlyph(ctx, s.W / 2 - half, cy - 26 * u, ch + 52 * u, 1, accent, Math.max(3, 6 * u));
    bracketGlyph(ctx, s.W / 2 + half, cy - 26 * u, ch + 52 * u, -1, accent, Math.max(3, 6 * u));
    ctx.restore();
    // label above, swapping with the card
    const labels = ids.length ? ids.map((x) => x.label).filter(Boolean) : [];
    const ls = (s.portrait ? 86 : 80) * u;
    if (labels.length || p.title) {
      const k = Math.round(step);
      const label = str(labels.length ? ids[clamp(k, 0, ids.length - 1)].label ?? p.title : p.title);
      const swap = step - Math.floor(step);
      const near = Math.min(swap, 1 - swap);
      ctx.save();
      ctx.globalAlpha *= clamp(1 - near * 2.4) * clamp(t * 3);
      D.text(ctx, label, s.W / 2, cy - 70 * u - near * 30 * u, ls, 500, pal.fg, "center", -0.02, "display");
      ctx.restore();
    }
    return;
  }
  // mosaic: rows slide in from alternating sides, then one card lifts out and fills the frame
  const cols = s.landscape ? 4 : 3;
  const rows = s.portrait ? 5 : 3;
  const gap = 22 * u;
  const cw = (s.W * 1.1 - gap * (cols + 1)) / cols;
  const ch = cw * 0.66;
  const total = rows * (ch + gap);
  const y0 = s.H / 2 - total / 2;
  const focus = clamp(Math.round(Number(p.focus ?? Math.floor((cols * rows) / 2))), 0, cols * rows - 1);
  const liftAt = Number.isFinite(+p.liftAt) ? +p.liftAt : Math.max(1.4, d - 1.4);
  const lift = ease.inOutCubic(clamp((t - liftAt) / 1.0));
  for (let r = 0; r < rows; r++) {
    const dir = r % 2 ? 1 : -1;
    const q = sp(t - r * 0.1, 0.9);
    for (let k = 0; k < cols; k++) {
      const idx = r * cols + k;
      if (idx === focus) continue;
      const x = -s.W * 0.05 + gap + k * (cw + gap) + dir * (1 - q) * s.W * 0.5;
      card(ctx, x, y0 + r * (ch + gap), cw, ch, pick(idx).media, clamp(q * 1.5) * (1 - lift * 0.7));
    }
  }
  const fr = Math.floor(focus / cols);
  const fc = focus % cols;
  const fq = sp(t - fr * 0.1, 0.9);
  const fx = -s.W * 0.05 + gap + fc * (cw + gap) + (fr % 2 ? 1 : -1) * (1 - fq) * s.W * 0.5;
  const fy = y0 + fr * (ch + gap);
  const tw = s.W;
  const th = s.H;
  card(ctx, lerp(fx, 0, lift), lerp(fy, 0, lift), lerp(cw, tw, lift), lerp(ch, th, lift), pick(focus).media, clamp(fq * 1.5), lift > 0 && lift < 1);
};

/**
 * Device hero (ConversBank, LangEase): the product on a phone, laptop or browser, with small UI
 * pieces floating around it at different depths and a headline beside it.
 */
const hero: Template = (c) => {
  const { ctx, s, p, t, pal } = c;
  const u = s.u;
  const device: "phone" | "laptop" | "browser" = p.device === "laptop" || p.device === "browser" ? p.device : "phone";
  const id = str(p.image ?? p.media) || undefined;
  const hasText = !!(p.title || p.kicker || p.sub);
  // layout: text left and device right on 16:9; text on top, device under it otherwise
  const side = s.landscape && hasText;
  const devArea = side ? { x: s.safe.x + s.safe.w * 0.5, y: s.safe.y, w: s.safe.w * 0.5, h: s.safe.h } : { x: s.safe.x, y: s.safe.y + (hasText ? s.safe.h * (s.portrait ? 0.3 : 0.36) : 0), w: s.safe.w, h: s.safe.h * (hasText ? (s.portrait ? 0.7 : 0.64) : 1) };
  const ar = device === "phone" ? 0.49 : device === "laptop" ? 1.6 : 1.45;
  let dh = devArea.h * (device === "phone" ? 0.94 : 0.78);
  let dw = dh * ar;
  if (dw > devArea.w * (device === "phone" ? 0.6 : 0.95)) {
    dw = devArea.w * (device === "phone" ? 0.6 : 0.95);
    dh = dw / ar;
  }
  const dx = devArea.x + devArea.w / 2 - dw / 2;
  const dy = devArea.y + devArea.h / 2 - dh / 2;
  if (hasText) {
    const ts = (s.portrait ? 84 : s.landscape ? 100 : 70) * u;
    if (side) headerBlock(c, s.safe.x, s.safe.y + s.safe.h * 0.32, s.safe.w * 0.45, { kicker: p.kicker, title: p.title, sub: p.sub, size: ts, align: "left", start: 0.25, highlight: arr(p.highlight) });
    else headerBlock(c, s.W / 2, s.safe.y + (s.portrait ? s.safe.h * 0.02 : 0), s.safe.w, { kicker: p.kicker, title: p.title, sub: p.sub, size: ts, align: "center", start: 0.25, highlight: arr(p.highlight) });
  }
  const q = sp(t - 0.05, 1.0);
  const box = { x: dx, y: dy + (1 - q) * 160 * u, w: dw, h: dh };
  const tiltMode = p.tilt ?? (side ? "right" : "none");
  ctx.save();
  ctx.globalAlpha *= clamp(q * 1.6);
  D.tilted(ctx, s, box, D.tiltFor(tiltMode, spCalm(t - 0.1, 1.4), t), (g) => drawDevice({ ...c, ctx: g as any }, device, box, id), 4);
  ctx.restore();
  // floating UI pieces around the device, bobbing at different depths
  const chips = arr<any>(p.chips).slice(0, 6).map((x) => (typeof x === "string" ? { text: x } : { text: str(x?.text), icon: x?.icon, sub: x?.sub }));
  const spots = [
    [-0.42, 0.18], [0.52, 0.3], [-0.5, 0.62], [0.46, 0.72], [-0.3, 0.9], [0.4, 0.08],
  ];
  chips.forEach((ch, k) => {
    const [ox, oy] = spots[k];
    const cq = sp(t - (0.7 + k * 0.28), 0.6, 0.12);
    if (cq <= 0.01) return;
    const depth = 0.85 + (k % 3) * 0.12;
    const fs = 30 * u * depth * (s.portrait ? 1.05 : 1);
    const iconW = ch.icon ? fs * 1.6 : 0;
    const tw = D.measure(ctx, ch.text, fs, 600, -0.01, "head");
    const sw = ch.sub ? D.measure(ctx, ch.sub, fs * 0.8, 400) : 0;
    const w = Math.max(tw, sw) + iconW + fs * 1.6;
    const h = fs * (ch.sub ? 2.9 : 2.0);
    let x = box.x + box.w / 2 + ox * Math.max(box.w * 1.5, 520 * u) - w / 2;
    x = clamp(x, s.safe.x * 0.5, s.W - s.safe.x * 0.5 - w);
    const y = box.y + oy * box.h - h / 2 + Math.sin(t * 1.4 + k * 1.7) * 8 * u * depth;
    ctx.save();
    ctx.globalAlpha *= clamp(cq * 1.5);
    const sc = 0.7 + 0.3 * cq;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(sc * depth, sc * depth);
    ctx.translate(-(x + w / 2), -(y + h / 2));
    D.card(ctx, x, y, w, h, Math.min(h / 2, 24 * u), pal.card, u, { elevation: 1.2, border: pal.cardBorder });
    if (ch.icon) D.icon(ctx, D.hasIcon(ch.icon) ? ch.icon : "circle-check", x + fs * 0.75, y + h / 2 - fs * 0.6, fs * 1.2, D.solid(pal.accent), 1, 2);
    D.text(ctx, ch.text, x + fs * 0.8 + iconW, y + (ch.sub ? h * 0.42 : h / 2 + fs * 0.36), fs, 600, pal.cardFg, "left", -0.01, "head");
    if (ch.sub) D.text(ctx, ch.sub, x + fs * 0.8 + iconW, y + h * 0.42 + fs * 1.15, fs * 0.8, 400, pal.cardMuted);
    ctx.restore();
  });
};

function drawDevice(c: SceneCtx, kind: "phone" | "laptop" | "browser", box: { x: number; y: number; w: number; h: number }, id?: string) {
  const { ctx, s, pal } = c;
  const u = s.u;
  const { x, y, w, h } = box;
  ctx.save();
  ctx.shadowColor = "rgba(8,16,40,0.35)";
  ctx.shadowBlur = 60 * u;
  ctx.shadowOffsetY = 24 * u;
  if (kind === "phone") {
    D.rrect(ctx, x, y, w, h, w * 0.14);
    ctx.fillStyle = "#0B0F17";
    ctx.fill();
    ctx.restore();
    const b = w * 0.035;
    const scr = { x: x + b, y: y + b, w: w - b * 2, h: h - b * 2 };
    if (id) drawMedia(c, ctx, id, {}, scr, { r: w * 0.11, fit: "cover", focus: { x: 0.5, y: 0 } });
    else {
      D.rrect(ctx, scr.x, scr.y, scr.w, scr.h, w * 0.11);
      ctx.fillStyle = pal.card;
      ctx.fill();
    }
    D.rrect(ctx, x + w / 2 - w * 0.15, y + b + w * 0.03, w * 0.3, w * 0.075, w * 0.04);
    ctx.fillStyle = "#0B0F17";
    ctx.fill();
    return;
  }
  if (kind === "laptop") {
    const sh = h * 0.9;
    D.rrect(ctx, x + w * 0.06, y, w * 0.88, sh, 18 * u);
    ctx.fillStyle = "#11151F";
    ctx.fill();
    ctx.restore();
    const b = 14 * u;
    const scr = { x: x + w * 0.06 + b, y: y + b, w: w * 0.88 - b * 2, h: sh - b * 2 };
    if (id) drawMedia(c, ctx, id, {}, scr, { r: 6 * u, fit: "cover", focus: { x: 0.5, y: 0 } });
    else {
      ctx.fillStyle = pal.card;
      ctx.fillRect(scr.x, scr.y, scr.w, scr.h);
    }
    D.rrect(ctx, x, y + sh, w, h - sh, 10 * u);
    ctx.fillStyle = "#C9CED8";
    ctx.fill();
    return;
  }
  const bar = Math.max(30 * u, h * 0.07);
  D.rrect(ctx, x, y, w, h, 18 * u);
  ctx.fillStyle = pal.card;
  ctx.fill();
  ctx.restore();
  ctx.save();
  D.rrect(ctx, x, y, w, h, 18 * u);
  ctx.clip();
  ctx.fillStyle = pal.softCard;
  ctx.fillRect(x, y, w, bar);
  ["#FF6159", "#FFBD2E", "#28C941"].forEach((col, k) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x + bar * 0.6 + k * bar * 0.5, y + bar / 2, bar * 0.14, 0, Math.PI * 2);
    ctx.fill();
  });
  if (id) drawMedia(c, ctx, id, {}, { x, y: y + bar, w, h: h - bar }, { fit: "cover", focus: { x: 0.5, y: 0 } });
  ctx.restore();
}

export const TEMPLATES: Record<string, Template> = {
  sentence,
  verbs,
  doc,
  wall,
  hero,
  title,
  statement,
  stat,
  screenshot,
  features,
  steps,
  chart,
  compare,
  deadline,
  quote,
  cta,
  logo: logoSting,
  media,
  split,
  collage,
  icons,
  kinetic,
  ui,
  custom,
};
