// The TaxStreem drawing kit: theme colours, type, layout, brand marks, icons, cards, pills and
// backgrounds. Scene templates build only from these pieces, which keeps every video on-brand.

import { ICONS, LOGO, MARK } from "./generated";
import { clamp, rng } from "./lib";
import type { Format, Theme } from "./types";

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const FONT = 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';

export const BRAND = {
  white: "#FFFFFF",
  blackout: "#0A0A0A",
  lightBlue: "#3E88FF",
  primary: "#0072F5",
  blue50: "#F0F7FF",
  blue100: "#DCEAFF",
  blue200: "#B9D4FF",
  blue300: "#8CBAFF",
  blue700: "#0056BE",
  blue900: "#0E2E5C",
  blue950: "#0A2444",
  ink900: "#111827",
  ink700: "#242527",
  ink500: "#6B7280",
  ink400: "#828282",
  line: "#E6E6E6",
  surface1: "#FAFAFA",
  surface2: "#EFF2FA",
  success: "#12B76A",
  danger: "#E5484D",
};

export interface Palette {
  name: Theme;
  fg: string;
  muted: string;
  faint: string;
  accent: string;
  /** Colour for highlighted words in headlines. On blue the brand uses two-tone white instead. */
  highlight: string;
  /** Opacity of non-highlighted words in a two-tone statement. */
  dimAlpha: number;
  card: string;
  cardFg: string;
  cardMuted: string;
  cardBorder: string;
  iconTile: string;
  iconFg: string;
  logo: "dark" | "white";
  pillFill: string;
  pillFg: string;
}

export const PALETTES: Record<Theme, Palette> = {
  light: {
    name: "light",
    fg: BRAND.blackout,
    muted: BRAND.ink500,
    faint: BRAND.line,
    accent: BRAND.primary,
    highlight: BRAND.primary,
    dimAlpha: 0.38,
    card: BRAND.white,
    cardFg: BRAND.blackout,
    cardMuted: BRAND.ink500,
    cardBorder: BRAND.line,
    iconTile: BRAND.blue50,
    iconFg: BRAND.primary,
    logo: "dark",
    pillFill: BRAND.primary,
    pillFg: BRAND.white,
  },
  dark: {
    name: "dark",
    fg: "#FAFAFA",
    muted: "#9CA3AF",
    faint: "#26282C",
    accent: BRAND.lightBlue,
    highlight: BRAND.lightBlue,
    dimAlpha: 0.42,
    card: "#141518",
    cardFg: "#FAFAFA",
    cardMuted: "#9CA3AF",
    cardBorder: "#26282C",
    iconTile: "rgba(62,136,255,0.14)",
    iconFg: BRAND.lightBlue,
    logo: "white",
    pillFill: BRAND.primary,
    pillFg: BRAND.white,
  },
  blue: {
    name: "blue",
    fg: BRAND.white,
    muted: "rgba(255,255,255,0.82)",
    faint: "rgba(255,255,255,0.18)",
    accent: BRAND.white,
    highlight: BRAND.white,
    dimAlpha: 0.55,
    card: "rgba(255,255,255,0.97)",
    cardFg: BRAND.blackout,
    cardMuted: BRAND.ink500,
    cardBorder: "rgba(255,255,255,0.6)",
    iconTile: BRAND.blue50,
    iconFg: BRAND.primary,
    logo: "white",
    pillFill: BRAND.white,
    pillFg: BRAND.blackout,
  },
};

// ---------------------------------------------------------------- stage

export interface Stage {
  W: number;
  H: number;
  /** One "unit": 1px at 1080 on the short side. Size everything in units. */
  u: number;
  format: Format;
  portrait: boolean;
  landscape: boolean;
  square: boolean;
  /** Area kept clear of platform UI (captions, buttons, profile bars). */
  safe: { x: number; y: number; w: number; h: number };
}

export const SIZES: Record<Format, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

export function makeStage(format: Format, scale = 1): Stage {
  const { w, h } = SIZES[format];
  const W = Math.round(w * scale);
  const H = Math.round(h * scale);
  const u = Math.min(W, H) / 1080;
  const portrait = format === "9:16";
  const landscape = format === "16:9";
  // Reels/TikTok cover the top ~11% and bottom ~20% with UI; feeds crop squares lightly.
  const m = portrait ? { l: 84, r: 84, t: 220, b: 360 } : landscape ? { l: 140, r: 140, t: 96, b: 96 } : { l: 96, r: 96, t: 96, b: 110 };
  const safe = { x: m.l * u, y: m.t * u, w: W - (m.l + m.r) * u, h: H - (m.t + m.b) * u };
  return { W, H, u, format, portrait, landscape, square: format === "1:1", safe };
}

// ---------------------------------------------------------------- type

export function setFont(ctx: Ctx, weight: number, size: number, trackingEm = 0) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  (ctx as any).letterSpacing = `${(trackingEm * size).toFixed(2)}px`;
}

export interface LaidWord {
  text: string;
  x: number;
  /** Baseline. */
  y: number;
  w: number;
  line: number;
  index: number;
  highlight: boolean;
}
export interface LaidLine {
  y: number;
  x: number;
  width: number;
  words: LaidWord[];
}
export interface TextLayout {
  size: number;
  weight: number;
  tracking: number;
  lineHeight: number;
  lines: LaidLine[];
  words: LaidWord[];
  width: number;
  height: number;
  /** True when the text could not fit at the minimum size. */
  overflow: boolean;
}

export interface TextOpts {
  maxWidth: number;
  size: number;
  minSize?: number;
  weight?: number;
  tracking?: number;
  lineHeight?: number;
  maxLines?: number;
  maxHeight?: number;
  align?: "left" | "center" | "right";
  highlight?: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}₦%$£€]+/gu, "");

/** Wraps text to a width, shrinking the size until it fits the line and height limits. */
export function layoutText(ctx: Ctx, text: string, x: number, y: number, o: TextOpts): TextLayout {
  const weight = o.weight ?? 500;
  const tracking = o.tracking ?? -0.02;
  const lh = o.lineHeight ?? 1.08;
  const maxLines = o.maxLines ?? 99;
  const minSize = o.minSize ?? Math.round(o.size * 0.55);
  const hl = new Set((o.highlight ?? []).flatMap((h) => h.split(/\s+/)).map(norm).filter(Boolean));
  const tokens = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  let size = o.size;
  let lines: { words: { text: string; w: number }[]; width: number }[] = [];
  let overflow = false;
  for (let guard = 0; guard < 40; guard++) {
    setFont(ctx, weight, size, tracking);
    const space = ctx.measureText(" ").width;
    lines = [];
    let cur: { text: string; w: number }[] = [];
    let width = 0;
    let tooWide = false;
    for (const tok of tokens) {
      const w = ctx.measureText(tok).width;
      if (w > o.maxWidth) tooWide = true;
      const next = cur.length ? width + space + w : w;
      if (cur.length && next > o.maxWidth) {
        lines.push({ words: cur, width });
        cur = [{ text: tok, w }];
        width = w;
      } else {
        cur.push({ text: tok, w });
        width = next;
      }
    }
    if (cur.length) lines.push({ words: cur, width });
    const height = lines.length * size * lh;
    const fits = !tooWide && lines.length <= maxLines && (!o.maxHeight || height <= o.maxHeight);
    if (fits) break;
    if (size <= minSize) {
      overflow = true;
      break;
    }
    size = Math.max(minSize, Math.floor(size * 0.94));
  }
  setFont(ctx, weight, size, tracking);
  const space = ctx.measureText(" ").width;
  const out: LaidLine[] = [];
  const words: LaidWord[] = [];
  let maxW = 0;
  lines.forEach((ln, li) => {
    const lx = o.align === "center" ? x - ln.width / 2 : o.align === "right" ? x - ln.width : x;
    const by = y + size * 0.82 + li * size * lh; // y is the top of the text block
    let cx = lx;
    const lw: LaidWord[] = [];
    for (const w of ln.words) {
      const lwd: LaidWord = { text: w.text, x: cx, y: by, w: w.w, line: li, index: words.length, highlight: hl.has(norm(w.text)) };
      lw.push(lwd);
      words.push(lwd);
      cx += w.w + space;
    }
    maxW = Math.max(maxW, ln.width);
    out.push({ y: by, x: lx, width: ln.width, words: lw });
  });
  return { size, weight, tracking, lineHeight: lh, lines: out, words, width: maxW, height: lines.length * size * lh, overflow };
}

export function drawWord(ctx: Ctx, l: TextLayout, w: LaidWord, color: string, dx = 0, dy = 0) {
  setFont(ctx, l.weight, l.size, l.tracking);
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(w.text, w.x + dx, w.y + dy);
}

/** Draws a laid-out block in one go (no per-word animation). */
export function drawLayout(ctx: Ctx, l: TextLayout, color: string, highlightColor?: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (const w of l.words) drawWord(ctx, l, w, w.highlight && highlightColor ? highlightColor : color);
  ctx.restore();
}

/** Single-line text with tracking; returns its width. */
export function text(ctx: Ctx, s: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = "left", trackingEm = 0): number {
  setFont(ctx, weight, size, trackingEm);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.textAlign = "left";
  return w;
}
export function measure(ctx: Ctx, s: string, size: number, weight: number, trackingEm = 0): number {
  setFont(ctx, weight, size, trackingEm);
  return ctx.measureText(s).width;
}

/** Micro label: ALL CAPS, tracked, with a short accent rule before it (brand spec-label style). */
export function kicker(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, rule: string, p = 1, align: "left" | "center" = "left") {
  const label = s.toUpperCase();
  const w = measure(ctx, label, size, 600, 0.14);
  const ruleW = size * 2.2 * clamp(p * 1.4);
  const gap = size * 0.8;
  const total = size * 2.2 + gap + w;
  const x0 = align === "center" ? x - total / 2 : x;
  ctx.save();
  ctx.fillStyle = rule;
  ctx.fillRect(x0, y - size * 0.42, ruleW, Math.max(2, size * 0.14));
  ctx.globalAlpha *= clamp((p - 0.2) / 0.8);
  text(ctx, label, x0 + size * 2.2 + gap, y, size, 600, color, "left", 0.14);
  ctx.restore();
}

// ---------------------------------------------------------------- shapes

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Rounded rectangle as a reusable path (for even-odd holes and clipping). */
export function rrectPath(x: number, y: number, w: number, h: number, r: number): Path2D {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const p = new Path2D();
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}

/** Soft, cool, layered shadow (the brand's --shadow-lg) under a rounded rectangle, then fills it. */
export function card(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, u: number, opts: { border?: string; elevation?: number; glow?: boolean } = {}) {
  const e = opts.elevation ?? 1;
  ctx.save();
  if (e > 0) {
    ctx.shadowColor = opts.glow ? "rgba(0,114,245,0.30)" : "rgba(14,63,126,0.12)";
    ctx.shadowBlur = 48 * u * e;
    ctx.shadowOffsetY = 18 * u * e;
    rrect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "rgba(42,51,70,0.07)";
    ctx.shadowBlur = 12 * u * e;
    ctx.shadowOffsetY = 4 * u * e;
  }
  rrect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
  if (opts.border) {
    ctx.save();
    rrect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.stroke();
    ctx.restore();
  }
}

/** Lucide icon, stroked. `p` (0..1) draws the strokes on progressively. */
const pathCache = new Map<string, Path2D[]>();
export function icon(ctx: Ctx, name: string, x: number, y: number, size: number, color: string, p = 1, weight = 2) {
  const parts = ICONS[name] ?? ICONS["sparkles"];
  let paths = pathCache.get(name);
  if (!paths) {
    paths = parts.map((d) => new Path2D(d));
    pathCache.set(name, paths);
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (p < 1) {
    ctx.setLineDash([60, 60]);
    ctx.lineDashOffset = 60 * (1 - clamp(p));
  }
  for (const path of paths) ctx.stroke(path);
  ctx.restore();
}

let logoPaths: Path2D[] | null = null;
let markPaths: Path2D[] | null = null;
/** TaxStreem wordmark lockup. Height in px; returns drawn width. Variant follows the logo rule. */
export function logo(ctx: Ctx, x: number, y: number, h: number, variant: "dark" | "white" | "brand", alpha = 1): number {
  logoPaths ??= LOGO.d.map((d) => new Path2D(d));
  const s = h / LOGO.h;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(s, s);
  logoPaths.forEach((p, i) => {
    ctx.fillStyle = variant === "white" ? "#FFFFFF" : variant === "brand" && i < 2 ? BRAND.primary : BRAND.blackout;
    ctx.fill(p);
  });
  ctx.restore();
  return LOGO.w * s;
}
export const logoWidth = (h: number) => (LOGO.w * h) / LOGO.h;

/** The icon mark. `split` (0..1) slides its two shapes together from apart, for reveals. */
export function mark(ctx: Ctx, x: number, y: number, h: number, color: string, alpha = 1, split = 1) {
  markPaths ??= (MARK.parts as string[]).map((d) => new Path2D(d));
  const s = h / MARK.h;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  const off = (1 - clamp(split)) * 30;
  ctx.save();
  ctx.translate(-off, -off * 0.6);
  ctx.fill(markPaths[0]);
  ctx.restore();
  ctx.save();
  ctx.translate(off, off * 0.6);
  ctx.fill(markPaths[1]);
  ctx.restore();
  ctx.restore();
}
export const markWidth = (h: number) => (MARK.w * h) / MARK.h;

/** Pill button ("Start now ›"). Returns its width. */
export function pill(ctx: Ctx, x: number, y: number, h: number, label: string, fill: string, fg: string, opts: { chevron?: boolean; align?: "left" | "center"; glow?: boolean; u?: number; outline?: boolean; scale?: number } = {}): number {
  const size = h * 0.4;
  const tw = measure(ctx, label, size, 500, -0.01);
  const chev = opts.chevron === false ? 0 : size * 1.1;
  const w = h * 0.9 + tw + chev + h * 0.55;
  const x0 = opts.align === "center" ? x - w / 2 : x;
  ctx.save();
  if (opts.scale && opts.scale !== 1) {
    ctx.translate(x0 + w / 2, y + h / 2);
    ctx.scale(opts.scale, opts.scale);
    ctx.translate(-(x0 + w / 2), -(y + h / 2));
  }
  if (opts.outline) {
    rrect(ctx, x0, y, w, h, h / 2);
    ctx.strokeStyle = fg;
    ctx.lineWidth = Math.max(2, h * 0.04);
    ctx.stroke();
  } else {
    if (opts.glow) {
      ctx.shadowColor = fill === "#FFFFFF" ? "rgba(10,36,68,0.25)" : "rgba(0,114,245,0.35)";
      ctx.shadowBlur = h * 0.5;
      ctx.shadowOffsetY = h * 0.18;
    }
    rrect(ctx, x0, y, w, h, h / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
  }
  text(ctx, label, x0 + h * 0.6, y + h / 2 + size * 0.36, size, 500, fg, "left", -0.01);
  if (chev) icon(ctx, "chevron-right", x0 + h * 0.6 + tw + size * 0.35, y + h / 2 - size * 0.55, size * 1.1, fg, 1, 2.4);
  ctx.restore();
  return w;
}

// ---------------------------------------------------------------- backgrounds

type Cache = Map<string, OffscreenCanvas>;
const caches: Cache = new Map();

function offscreen(w: number, h: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** Film grain tile, generated once from a fixed seed. */
function grainTile(): OffscreenCanvas {
  const key = "grain";
  const hit = caches.get(key);
  if (hit) return hit;
  const c = offscreen(256, 256);
  const g = c.getContext("2d")!;
  const img = g.createImageData(256, 256);
  const r = rng(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(r() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  caches.set(key, c);
  return c;
}

/** The icon-mark watermark band that sits along the foot of brand surfaces. */
function patternBand(W: number, bandH: number, color: string): OffscreenCanvas {
  const key = `band:${W}:${Math.round(bandH)}:${color}`;
  const hit = caches.get(key);
  if (hit) return hit;
  const c = offscreen(W * 1.5, bandH);
  const g = c.getContext("2d")!;
  const mh = bandH * 0.62;
  const step = markWidth(mh) * 2.15;
  const r = rng(3);
  for (let x = -step * 0.3, i = 0; x < c.width + step; x += step, i++) {
    const y = bandH - mh * (0.92 + r() * 0.12);
    mark(g, x, y, mh, color, 0.55 + r() * 0.45);
  }
  // fade the band out towards its top edge
  g.globalCompositeOperation = "destination-in";
  const grad = g.createLinearGradient(0, 0, 0, bandH);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.6)");
  grad.addColorStop(1, "rgba(0,0,0,1)");
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, bandH);
  caches.set(key, c);
  return c;
}

export interface BgOpts {
  /** Draw the icon-mark pattern band at the bottom. */
  pattern?: boolean;
  /** Seconds, for slow drift. */
  t: number;
  /** Small per-scene variation. */
  seed?: number;
}

export function background(ctx: Ctx, s: Stage, theme: Theme, o: BgOpts) {
  const { W, H, u } = s;
  const t = o.t;
  const seed = o.seed ?? 0;
  ctx.save();
  if (theme === "light") {
    ctx.fillStyle = BRAND.white;
    ctx.fillRect(0, 0, W, H);
    const gx = W * (0.85 + 0.04 * Math.sin(t * 0.25 + seed));
    const gy = H * (0.08 + 0.03 * Math.cos(t * 0.2 + seed));
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.75);
    g.addColorStop(0, "rgba(185,212,255,0.55)");
    g.addColorStop(0.45, "rgba(220,234,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (o.pattern !== false) drawBand(ctx, s, "rgba(0,114,245,1)", 0.07, t);
  } else if (theme === "dark") {
    ctx.fillStyle = BRAND.blackout;
    ctx.fillRect(0, 0, W, H);
    const gx = W * (0.2 + 0.05 * Math.sin(t * 0.22 + seed));
    const gy = H * (0.95 + 0.03 * Math.cos(t * 0.18 + seed));
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.8);
    g.addColorStop(0, "rgba(0,114,245,0.32)");
    g.addColorStop(0.5, "rgba(0,86,190,0.10)");
    g.addColorStop(1, "rgba(10,10,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (o.pattern !== false) drawBand(ctx, s, "#FFFFFF", 0.07, t);
    drawGrain(ctx, s, t, 0.05);
  } else {
    // Brand gradient: deep navy top-left, primary blue through the middle, pale cyan bottom-right.
    const drift = 0.04 * Math.sin(t * 0.2 + seed);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#14223F");
    g.addColorStop(0.28 + drift, "#0B4FC6");
    g.addColorStop(0.5 + drift, "#1A77FF");
    g.addColorStop(0.78, "#5CB8F2");
    g.addColorStop(1, "#C9F1FF");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const gx = W * (0.9 + 0.05 * Math.cos(t * 0.17 + seed));
    const gy = H * (0.85 + 0.04 * Math.sin(t * 0.21));
    const r = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.6);
    r.addColorStop(0, "rgba(220,248,255,0.55)");
    r.addColorStop(1, "rgba(220,248,255,0)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
    if (o.pattern !== false) drawBand(ctx, s, "#FFFFFF", 0.16, t);
    drawGrain(ctx, s, t, 0.09);
  }
  ctx.restore();
  void u;
}

function drawBand(ctx: Ctx, s: Stage, color: string, alpha: number, t: number) {
  const bandH = (s.portrait ? 300 : 230) * s.u;
  const band = patternBand(s.W, bandH, color);
  const shift = ((t * 14 * s.u) % (band.width - s.W)) || 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(band, -shift, s.H - bandH + 6 * s.u);
  ctx.restore();
}

function drawGrain(ctx: Ctx, s: Stage, t: number, alpha: number) {
  const tile = grainTile();
  const frame = Math.floor(t * 24);
  const r = rng(frame * 9973 + 11);
  const ox = Math.floor(r() * 256);
  const oy = Math.floor(r() * 256);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  const scale = Math.max(1, s.u * 1.2);
  ctx.translate(-ox, -oy);
  ctx.scale(scale, scale);
  const pat = ctx.createPattern(tile, "repeat")!;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, (s.W + 512) / scale, (s.H + 512) / scale);
  ctx.restore();
}

/** Draws an image to cover or fit a box, with optional rounded clipping. */
export function image(ctx: Ctx, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, fit: "cover" | "contain" = "cover", r = 0) {
  const iw = img.width;
  const ih = img.height;
  const sc = fit === "cover" ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * sc;
  const dh = ih * sc;
  ctx.save();
  if (r > 0) {
    rrect(ctx, x, y, w, h, r);
    ctx.clip();
  }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

