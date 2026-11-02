// Scene templates. Each one draws a single frame of its scene from local time t, so any
// frame can be rendered on its own. The active look decides the feel (fonts, surfaces, entry
// style, spring timing), so one template serves every style. One idea per scene.

import * as D from "./draw";
import { type Ctx, type LaidWord, type Palette, type Stage, type TextLayout } from "./draw";
import { clamp, ease, formatNumber, lerp, remap, spring, springSteps, tween } from "./lib";
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
  /** Duration of a video asset in seconds (0 for images or unknown). */
  mediaDuration(id: string | undefined): number;
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

interface Focus { x: number; y: number; w: number; h: number; at: number; label?: string; spotlight?: boolean; zoom?: number }
interface CursorPt { x: number; y: number; at: number; click?: boolean }

const screenshot: Template = (c) => {
  const { ctx, s, p, pal, t } = c;
  const u = s.u;
  const img = c.image(p.image);
  const ar = img ? img.width / img.height : 16 / 10;
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
  const cx = springSteps(t, rest.cx, steps("cx"), 1.1 * M().settle);
  const cy = springSteps(t, rest.cy, steps("cy"), 1.1 * M().settle);
  const z = springSteps(t, 1, steps("z"), 1.1 * M().settle);
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
  else {
    c.warn(`Scene "${c.scene.id}": screenshot "${str(p.image, "(none)")}" isn't uploaded yet.`);
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
    fn({ ctx, t, d, W: s.W, H: s.H, u: s.u, stage: s, palette: pal, theme, props: p, brand: D.BRAND, colors: D.activeColors(), look: D.activeLook(), lib: { clamp, lerp, ease, spring, sp, springSteps, tween, remap, formatNumber }, draw: D, image: c.image, media: c.media });
  } catch (e) {
    c.warn(`Scene "${c.scene.id}": custom code failed at ${t.toFixed(2)}s (${(e as Error).message}).`);
  }
  ctx.restore();
};
const customCache = new Map<string, (api: unknown) => void>();

export const TEMPLATES: Record<string, Template> = {
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
  custom,
};
