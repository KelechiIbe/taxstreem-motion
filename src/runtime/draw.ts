// The drawing kit: palettes, type, layout, brand marks, icons, cards, pills, cursors and
// backgrounds. Scene templates build only from these pieces. The active look (set by the
// composition before each frame) decides fonts, surfaces, backgrounds and colours, so the same
// template renders as TaxStreem Calm, Punchy Kinetic, Editorial Serif and the rest.

import { RANGE } from "./fonts";
import { ICONS, LOGO, MARK } from "./generated";
import { clamp, rng } from "./lib";
import { BRAND_COLORS, LOOKS, alpha, contrast, luminance, mix, onColor, type BgKind, type Colorway, type Look, type Surface } from "./looks";
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
  /** Base background colour (the flat colour under any gradient). */
  bg: string;
  fg: string;
  muted: string;
  faint: string;
  accent: string;
  /** Text on an accent fill. */
  onAccent: string;
  /** Colour for highlighted words in headlines. May be a gradient token (see paint). */
  highlight: string;
  /** Opacity of non-highlighted words in a two-tone statement. */
  dimAlpha: number;
  card: string;
  cardFg: string;
  cardMuted: string;
  cardBorder: string;
  /** Quieter card, e.g. the "without" side of a comparison. */
  softCard: string;
  iconTile: string;
  iconFg: string;
  logo: "dark" | "white";
  pillFill: string;
  pillFg: string;
  /** Rails, dividers, empty tracks. */
  track: string;
  /** Empty progress bars. */
  subtle: string;
  /** Tinted badge fill and its text. */
  tint: string;
  tintFg: string;
  chartBase: string;
  areaTop: string;
  point: string;
  dot: string;
  goodFill: string;
  goodFg: string;
  goodMuted: string;
  goodIcon: string;
  quiet: string;
  /** Colour of the icon mark when drawn on this theme. */
  markColor: string;
  glow: string;
  ripple: string;
  /** Callout label fill (screenshot focus labels). */
  callout: string;
  calloutFg: string;
}

const V1: Record<Theme, Palette> = {
  light: {
    name: "light", bg: BRAND.white, fg: BRAND.blackout, muted: BRAND.ink500, faint: BRAND.line, accent: BRAND.primary, onAccent: BRAND.white,
    highlight: BRAND.primary, dimAlpha: 0.38, card: BRAND.white, cardFg: BRAND.blackout, cardMuted: BRAND.ink500, cardBorder: BRAND.line,
    softCard: BRAND.surface1, iconTile: BRAND.blue50, iconFg: BRAND.primary, logo: "dark", pillFill: BRAND.primary, pillFg: BRAND.white,
    track: BRAND.line, subtle: BRAND.surface2, tint: BRAND.blue50, tintFg: BRAND.primary, chartBase: BRAND.blue200, areaTop: "rgba(0,114,245,0.22)",
    point: BRAND.white, dot: BRAND.white, goodFill: BRAND.primary, goodFg: BRAND.white, goodMuted: "rgba(255,255,255,0.82)", goodIcon: BRAND.white,
    quiet: BRAND.ink400, markColor: BRAND.primary, glow: "rgba(0,114,245,0.30)", ripple: BRAND.primary, callout: BRAND.primary, calloutFg: BRAND.white,
  },
  dark: {
    name: "dark", bg: BRAND.blackout, fg: "#FAFAFA", muted: "#9CA3AF", faint: "#26282C", accent: BRAND.lightBlue, onAccent: BRAND.white,
    highlight: BRAND.lightBlue, dimAlpha: 0.42, card: "#141518", cardFg: "#FAFAFA", cardMuted: "#9CA3AF", cardBorder: "#26282C",
    softCard: "#141518", iconTile: "rgba(62,136,255,0.14)", iconFg: BRAND.lightBlue, logo: "white", pillFill: BRAND.primary, pillFg: BRAND.white,
    track: "rgba(255,255,255,0.2)", subtle: "rgba(255,255,255,0.16)", tint: "rgba(62,136,255,0.16)", tintFg: BRAND.lightBlue, chartBase: "#24364F",
    areaTop: "rgba(0,114,245,0.22)", point: BRAND.blackout, dot: "#141518", goodFill: BRAND.blue900, goodFg: BRAND.white, goodMuted: "rgba(255,255,255,0.82)",
    goodIcon: BRAND.white, quiet: BRAND.ink400, markColor: BRAND.white, glow: "rgba(0,114,245,0.30)", ripple: BRAND.primary, callout: BRAND.primary, calloutFg: BRAND.white,
  },
  blue: {
    name: "blue", bg: BRAND.primary, fg: BRAND.white, muted: "rgba(255,255,255,0.82)", faint: "rgba(255,255,255,0.18)", accent: BRAND.white, onAccent: BRAND.primary,
    highlight: BRAND.white, dimAlpha: 0.55, card: "rgba(255,255,255,0.97)", cardFg: BRAND.blackout, cardMuted: BRAND.ink500, cardBorder: "rgba(255,255,255,0.6)",
    softCard: "rgba(255,255,255,0.12)", iconTile: BRAND.blue50, iconFg: BRAND.primary, logo: "white", pillFill: BRAND.white, pillFg: BRAND.blackout,
    track: "rgba(255,255,255,0.2)", subtle: "rgba(255,255,255,0.16)", tint: "rgba(255,255,255,0.16)", tintFg: BRAND.white, chartBase: "rgba(255,255,255,0.32)",
    areaTop: "rgba(255,255,255,0.30)", point: BRAND.primary, dot: "rgba(255,255,255,0.14)", goodFill: BRAND.white, goodFg: BRAND.blackout, goodMuted: BRAND.ink500,
    goodIcon: BRAND.primary, quiet: BRAND.ink400, markColor: BRAND.white, glow: "rgba(10,36,68,0.25)", ripple: BRAND.white, callout: BRAND.primary, calloutFg: BRAND.white,
  },
};

/** The original TaxStreem palettes (also what the TaxStreem Calm look uses). */
export const PALETTES = V1;

// ---------------------------------------------------------------- active look

interface Active {
  look: Look;
  colors: Colorway;
  brand: boolean;
  pals: Partial<Record<Theme, Palette>>;
}

const sameColors = (a: Colorway, b: Colorway) => a.primary === b.primary && a.secondary === b.secondary && a.tertiary === b.tertiary && a.ink === b.ink && a.paper === b.paper;
const mk = (look: Look, colors: Colorway): Active => ({ look, colors, brand: sameColors(colors, BRAND_COLORS), pals: {} });
let A: Active = mk(LOOKS[0], BRAND_COLORS);

/** Called by the composition before each frame (and by anything else that draws). */
export function setLook(look: Look, colors: Colorway) {
  if (A.look !== look || !sameColors(A.colors, colors)) A = mk(look, colors);
}
export const activeLook = () => A.look;
export const activeColors = () => A.colors;
/** True when the colours are TaxStreem's own. */
export const brandColors = () => A.brand;

/** Gradient text token: drawWord/text paint it across the word. */
export const gradient = (a: string, b: string) => `grad:${a},${b}`;

export function palette(theme: Theme): Palette {
  const hit = A.pals[theme];
  if (hit) return hit;
  const p = A.brand && A.look.id === "taxstreem" ? V1[theme] : derive(A.look, A.colors, theme);
  A.pals[theme] = p;
  return p;
}

const readable = (c: string, bg: string, min = 3) => contrast(c, bg) >= min;

function derive(L: Look, c: Colorway, theme: Theme): Palette {
  const brandLike = A.brand;
  const surf = L.surface;
  if (theme === "light") {
    const bg = brandLike && L.bg.light === "brand-soft" ? "#FFFFFF" : c.paper;
    const fg = c.ink;
    const accent = readable(c.primary, bg, 2.6) ? c.primary : c.ink;
    const muted = mix(fg, bg, 0.46);
    const faint = mix(fg, bg, 0.88);
    const card = surf === "glass" ? "rgba(255,255,255,0.62)" : surf === "outline" ? bg : "#FFFFFF";
    const border = surf === "outline" ? mix(fg, bg, 0.72) : surf === "glass" ? "rgba(255,255,255,0.85)" : faint;
    const second = readable(c.secondary, bg, 2) ? c.secondary : accent;
    return {
      name: theme, bg, fg, muted, faint, accent, onAccent: onColor(accent, c.ink),
      highlight: L.gradientText ? gradient(accent, second) : accent, dimAlpha: 0.38,
      card, cardFg: fg, cardMuted: muted, cardBorder: border, softCard: mix(bg, fg, 0.035),
      iconTile: alpha(accent, 0.1), iconFg: accent, logo: "dark", pillFill: accent, pillFg: onColor(accent, c.ink),
      track: faint, subtle: mix(bg, fg, 0.07), tint: alpha(accent, 0.1), tintFg: accent, chartBase: mix(accent, bg, 0.72),
      areaTop: alpha(accent, 0.22), point: bg, dot: card === bg ? bg : "#FFFFFF", goodFill: accent, goodFg: onColor(accent, c.ink),
      goodMuted: alpha(onColor(accent, c.ink), 0.8), goodIcon: onColor(accent, c.ink), quiet: mix(fg, bg, 0.55), markColor: brandLike ? BRAND.primary : accent,
      glow: alpha(accent, 0.3), ripple: accent, callout: accent, calloutFg: onColor(accent, c.ink),
    };
  }
  if (theme === "dark") {
    const bg = luminance(c.ink) < 0.03 ? c.ink : "#0A0A0A";
    const fg = mix(c.paper, "#FFFFFF", 0.55);
    const accent = readable(c.primary, bg) ? c.primary : readable(c.secondary, bg) ? c.secondary : mix(c.primary, "#FFFFFF", 0.45);
    const muted = mix(fg, bg, 0.42);
    const faint = mix(fg, bg, 0.86);
    const card = surf === "glass" ? "rgba(255,255,255,0.07)" : surf === "outline" ? bg : mix(bg, "#FFFFFF", 0.07);
    const border = surf === "glass" ? "rgba(255,255,255,0.16)" : surf === "outline" ? mix(fg, bg, 0.7) : mix(fg, bg, 0.85);
    const second = readable(c.secondary, bg) ? c.secondary : c.tertiary;
    return {
      name: theme, bg, fg, muted, faint, accent, onAccent: onColor(accent, c.ink),
      highlight: L.gradientText ? gradient(accent, second) : accent, dimAlpha: 0.42,
      card, cardFg: fg, cardMuted: muted, cardBorder: border, softCard: mix(bg, "#FFFFFF", 0.05),
      iconTile: alpha(accent, 0.16), iconFg: accent, logo: "white", pillFill: accent, pillFg: onColor(accent, c.ink),
      track: "rgba(255,255,255,0.2)", subtle: "rgba(255,255,255,0.14)", tint: alpha(accent, 0.16), tintFg: accent, chartBase: mix(accent, bg, 0.7),
      areaTop: alpha(accent, 0.24), point: bg, dot: mix(bg, "#FFFFFF", 0.07), goodFill: mix(accent, bg, 0.55), goodFg: "#FFFFFF",
      goodMuted: "rgba(255,255,255,0.82)", goodIcon: "#FFFFFF", quiet: mix(fg, bg, 0.55), markColor: "#FFFFFF",
      glow: alpha(accent, 0.35), ripple: accent, callout: accent, calloutFg: onColor(accent, c.ink),
    };
  }
  // brand-colour scenes ("blue" theme): the primary colour is the background
  const bg = c.primary;
  const fg = onColor(bg, c.ink);
  const lightFg = fg === "#FFFFFF";
  const glassy = surf === "glass" || surf === "outline";
  const pop = L.brandHighlight === "secondary" && readable(c.secondary, bg, 1.8) ? c.secondary : fg;
  const card = glassy ? (surf === "glass" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0)") : "rgba(255,255,255,0.97)";
  const cardFg = glassy ? fg : c.ink;
  const cardMuted = glassy ? alpha(fg, 0.8) : mix(c.ink, "#FFFFFF", 0.45);
  return {
    name: theme, bg, fg, muted: alpha(fg, 0.82), faint: alpha(fg, 0.18), accent: fg, onAccent: lightFg ? bg : "#FFFFFF",
    highlight: pop, dimAlpha: 0.55, card, cardFg, cardMuted, cardBorder: glassy ? alpha(fg, 0.4) : "rgba(255,255,255,0.6)",
    softCard: alpha(fg, 0.12), iconTile: glassy ? alpha(fg, 0.16) : alpha(bg, 0.1), iconFg: glassy ? fg : bg, logo: lightFg ? "white" : "dark",
    pillFill: pop !== fg ? pop : fg, pillFg: pop !== fg ? onColor(pop, c.ink) : lightFg ? c.ink : "#FFFFFF",
    track: alpha(fg, 0.2), subtle: alpha(fg, 0.16), tint: alpha(fg, 0.16), tintFg: fg, chartBase: alpha(fg, 0.32), areaTop: alpha(fg, 0.3),
    point: bg, dot: alpha(fg, 0.14), goodFill: glassy ? alpha(fg, 0.22) : "#FFFFFF", goodFg: glassy ? fg : c.ink, goodMuted: glassy ? alpha(fg, 0.8) : mix(c.ink, "#FFFFFF", 0.45),
    goodIcon: glassy ? fg : bg, quiet: alpha(fg, 0.6), markColor: fg, glow: "rgba(10,20,40,0.25)", ripple: fg, callout: lightFg ? c.ink : bg, calloutFg: lightFg ? "#FFFFFF" : fg,
  };
}

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

/** display: headlines and big numbers. head: card and step titles. body: everything else. */
export type Role = "display" | "head" | "body" | "mono";

function family(role: Role): string {
  const f = A.look.fonts;
  return role === "mono" ? f.mono : role === "body" ? f.body : role === "head" ? f.head ?? f.display : f.display;
}

/** Template weights are written for TaxStreem (display 500, head 600); looks shift them. */
function weightFor(role: Role, w: number, fam: string): number {
  const t = A.look.type;
  let out = w;
  if (role === "display") out = w - 500 + t.displayWeight;
  else if (role === "head") out = w - 600 + t.headWeight;
  const [lo, hi] = RANGE[fam] ?? [100, 900];
  return Math.round(clamp(out, lo, hi));
}

function trackingFor(role: Role, em: number): number {
  const dt = A.look.type.tracking + 0.02;
  if (role === "head" && A.look.fonts.head && A.look.fonts.head !== A.look.fonts.display) return em;
  return role === "display" ? em + dt : role === "head" ? em + dt * 0.5 : em;
}

export const upperFor = (role: Role) => !!A.look.type.upper && (role === "display" || (role === "head" && !A.look.fonts.head));
export const displayScale = () => A.look.type.scale;

export function setFont(ctx: Ctx, weight: number, size: number, trackingEm = 0, role: Role = "body", italic = false) {
  const fam = family(role);
  const w = weightFor(role, weight, fam);
  ctx.font = `${italic ? "italic " : ""}${w} ${size}px "${fam}", ${FONT}`;
  (ctx as any).letterSpacing = `${(trackingFor(role, trackingEm) * size).toFixed(2)}px`;
}

/** Fill style for a colour or a gradient token, across a box. */
export function paint(ctx: Ctx, color: string, x0: number, y0: number, x1: number, y1: number): string | CanvasGradient {
  if (!color.startsWith("grad:")) return color;
  const [a, b] = color.slice(5).split(",");
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}
/** A gradient token's first colour, for places that need one solid colour. */
export const solid = (color: string) => (color.startsWith("grad:") ? color.slice(5).split(",")[0] : color);

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
  role: Role;
  italicHl: boolean;
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
  /** Defaults by weight: 400 or lighter is body, 600+ is head, otherwise display. */
  role?: Role;
  /** Use the size as given (no look scaling). Second passes that pass size: probe.size are exact. */
  exact?: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}₦%$£€]+/gu, "");

/** Wraps text to a width, shrinking the size until it fits the line and height limits. */
export function layoutText(ctx: Ctx, text: string, x: number, y: number, o: TextOpts): TextLayout {
  const weight = o.weight ?? 500;
  const role: Role = o.role ?? (weight <= 400 ? "body" : weight >= 600 ? "head" : "display");
  const tracking = o.tracking ?? -0.02;
  const ratio = A.look.type.lineHeight / 1.04;
  const lhBase = o.lineHeight ?? 1.08;
  const lh = role === "display" ? lhBase * ratio : role === "head" ? lhBase * (1 + (ratio - 1) * 0.5) : lhBase;
  const exact = o.exact ?? (o.minSize !== undefined && o.minSize === o.size);
  const k = exact ? 1 : role === "display" ? A.look.type.scale : role === "head" ? 1 + (A.look.type.scale - 1) * 0.4 : 1;
  const maxLines = o.maxLines ?? 99;
  const size0 = o.size * k;
  const minSize = (o.minSize ?? Math.round(o.size * 0.55)) * k;
  const italicHl = !!A.look.fonts.italicAccent && role === "display";
  const hl = new Set((o.highlight ?? []).flatMap((h) => h.split(/\s+/)).map(norm).filter(Boolean));
  const upper = upperFor(role);
  const tokens = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).map((t) => (upper ? t.toUpperCase() : t));
  const isHl = tokens.map((t) => hl.has(norm(t)));
  let size = size0;
  let lines: { words: { text: string; w: number; hl: boolean }[]; width: number }[] = [];
  let overflow = false;
  const measureTok = (tok: string, h: boolean) => {
    if (h && italicHl) {
      setFont(ctx, weight, size, tracking, role, true);
      const w = ctx.measureText(tok).width;
      setFont(ctx, weight, size, tracking, role);
      return w;
    }
    return ctx.measureText(tok).width;
  };
  for (let guard = 0; guard < 40; guard++) {
    setFont(ctx, weight, size, tracking, role);
    const space = ctx.measureText(" ").width;
    lines = [];
    let cur: { text: string; w: number; hl: boolean }[] = [];
    let width = 0;
    let tooWide = false;
    tokens.forEach((tok, ti) => {
      const w = measureTok(tok, isHl[ti]);
      if (w > o.maxWidth) tooWide = true;
      const next = cur.length ? width + space + w : w;
      if (cur.length && next > o.maxWidth) {
        lines.push({ words: cur, width });
        cur = [{ text: tok, w, hl: isHl[ti] }];
        width = w;
      } else {
        cur.push({ text: tok, w, hl: isHl[ti] });
        width = next;
      }
    });
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
  setFont(ctx, weight, size, tracking, role);
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
      const lwd: LaidWord = { text: w.text, x: cx, y: by, w: w.w, line: li, index: words.length, highlight: w.hl };
      lw.push(lwd);
      words.push(lwd);
      cx += w.w + space;
    }
    maxW = Math.max(maxW, ln.width);
    out.push({ y: by, x: lx, width: ln.width, words: lw });
  });
  return { size, weight, tracking, lineHeight: lh, role, italicHl, lines: out, words, width: maxW, height: lines.length * size * lh, overflow };
}

/** Sets the font a laid-out word is drawn in (italic accents included). */
export function fontFor(ctx: Ctx, l: TextLayout, w: LaidWord) {
  setFont(ctx, l.weight, l.size, l.tracking, l.role, l.italicHl && w.highlight);
}

export function drawWord(ctx: Ctx, l: TextLayout, w: LaidWord, color: string, dx = 0, dy = 0, text = w.text) {
  fontFor(ctx, l, w);
  ctx.fillStyle = paint(ctx, color, w.x + dx, w.y + dy - l.size * 0.7, w.x + dx + w.w, w.y + dy);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(text, w.x + dx, w.y + dy);
}

/** Draws a laid-out block in one go (no per-word animation). */
export function drawLayout(ctx: Ctx, l: TextLayout, color: string, highlightColor?: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (const w of l.words) drawWord(ctx, l, w, w.highlight && highlightColor ? highlightColor : color);
  ctx.restore();
}

/** Single-line text with tracking; returns its width. */
export function text(ctx: Ctx, s: string, x: number, y: number, size: number, weight: number, color: string, align: CanvasTextAlign = "left", trackingEm = 0, role: Role = "body"): number {
  if (upperFor(role)) s = s.toUpperCase();
  setFont(ctx, weight, size, trackingEm, role);
  const w = ctx.measureText(s).width;
  const x0 = align === "center" ? x - w / 2 : align === "right" || align === "end" ? x - w : x;
  ctx.fillStyle = paint(ctx, color, x0, y - size * 0.7, x0 + w, y);
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s, x, y);
  ctx.textAlign = "left";
  return w;
}
export function measure(ctx: Ctx, s: string, size: number, weight: number, trackingEm = 0, role: Role = "body"): number {
  if (upperFor(role)) s = s.toUpperCase();
  setFont(ctx, weight, size, trackingEm, role);
  return ctx.measureText(s).width;
}

/** Micro label: ALL CAPS, tracked, with a short accent rule before it (brand spec-label style). */
export function kicker(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, rule: string, p = 1, align: "left" | "center" = "left") {
  const role: Role = A.look.kicker === "mono" ? "mono" : "body";
  const label = s.toUpperCase();
  const track = role === "mono" ? 0.06 : 0.14;
  const w = measure(ctx, label, size, 600, track, role);
  const ruleW = size * 2.2 * clamp(p * 1.4);
  const gap = size * 0.8;
  const total = size * 2.2 + gap + w;
  const x0 = align === "center" ? x - total / 2 : x;
  ctx.save();
  ctx.fillStyle = paint(ctx, rule, x0, 0, x0 + size * 2.2, 0);
  if (role === "mono") {
    // mono looks use a small square marker instead of a rule
    const sq = size * 0.5 * clamp(p * 1.4);
    ctx.fillRect(x0 + size * 0.8 - sq / 2, y - size * 0.36 - sq / 2, sq, sq);
  } else ctx.fillRect(x0, y - size * 0.42, ruleW, Math.max(2, size * 0.14));
  ctx.globalAlpha *= clamp((p - 0.2) / 0.8);
  text(ctx, label, x0 + size * 2.2 + gap, y, size, 600, color, "left", track, role);
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

/** Card corner radius for the active look. */
export const radius = (r: number) => r * A.look.radius;

export interface CardOpts {
  border?: string;
  elevation?: number;
  glow?: boolean;
  /** Override the look's surface (device frames pass "solid" when glass would be wrong). */
  surface?: Surface;
  /** Keep the radius as given (pills, round callouts). */
  keepRadius?: boolean;
}

/** A card in the look's surface style: soft shadow, frosted glass, hairline, outline or sticker. */
export function card(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, u: number, opts: CardOpts = {}) {
  const e = opts.elevation ?? 1;
  const surf = opts.surface ?? A.look.surface;
  if (!opts.keepRadius) r = radius(r);
  const primary = A.colors.primary;
  ctx.save();
  if (surf === "sticker") {
    // hard offset shadow and an ink outline (campaign / neo-brutal)
    const off = 10 * u * Math.max(0.4, e);
    rrect(ctx, x + off * 0.8, y + off, w, h, r);
    ctx.fillStyle = A.colors.ink;
    ctx.fill();
    rrect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3.5 * u;
    ctx.strokeStyle = A.colors.ink;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (surf === "glass") {
    if (e > 0) {
      ctx.shadowColor = opts.glow ? alpha(primary, 0.35) : "rgba(20,24,60,0.14)";
      ctx.shadowBlur = 60 * u * e;
      ctx.shadowOffsetY = 22 * u * e;
    }
    rrect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    // lit top edge
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.35, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0.08)");
    rrect(ctx, x + 0.75 * u, y + 0.75 * u, w - 1.5 * u, h - 1.5 * u, r);
    ctx.strokeStyle = opts.border && opts.border.startsWith("rgba(255,255,255") ? opts.border : g;
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (surf === "outline") {
    rrect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    rrect(ctx, x + u, y + u, w - 2 * u, h - 2 * u, r);
    ctx.strokeStyle = opts.border ?? "rgba(128,128,128,0.55)";
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (surf === "flat") {
    if (e > 0 && !opts.glow) {
      ctx.shadowColor = "rgba(15,30,50,0.06)";
      ctx.shadowBlur = 10 * u * e;
      ctx.shadowOffsetY = 3 * u * e;
    } else if (opts.glow && e > 0) {
      ctx.shadowColor = alpha(primary, 0.22);
      ctx.shadowBlur = 30 * u * e;
      ctx.shadowOffsetY = 10 * u * e;
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
    return;
  }
  // solid: soft, cool, layered shadow (the brand's --shadow-lg)
  if (e > 0) {
    ctx.shadowColor = opts.glow ? (A.brand ? "rgba(0,114,245,0.30)" : alpha(primary, 0.3)) : "rgba(14,63,126,0.12)";
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
  ctx.strokeStyle = paint(ctx, color, 0, 0, 24, 24);
  ctx.lineWidth = weight * (A.look.id === "playful" || A.look.id === "campaign" ? 1.2 : 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (p < 1) {
    ctx.setLineDash([60, 60]);
    ctx.lineDashOffset = 60 * (1 - clamp(p));
  }
  for (const path of paths) ctx.stroke(path);
  ctx.restore();
}
export const hasIcon = (name: string) => !!ICONS[name];

let logoPaths: Path2D[] | null = null;
let markPaths: Path2D[] | null = null;
/** TaxStreem wordmark lockup. Height in px; returns drawn width. Variant follows the logo rule. */
export function logo(ctx: Ctx, x: number, y: number, h: number, variant: "dark" | "white" | "brand", alphaV = 1): number {
  logoPaths ??= LOGO.d.map((d) => new Path2D(d));
  const s = h / LOGO.h;
  ctx.save();
  ctx.globalAlpha *= alphaV;
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
export function mark(ctx: Ctx, x: number, y: number, h: number, color: string, alphaV = 1, split = 1) {
  markPaths ??= (MARK.parts as string[]).map((d) => new Path2D(d));
  const s = h / MARK.h;
  ctx.save();
  ctx.globalAlpha *= alphaV;
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
  const role: Role = A.look.type.upper ? "head" : "body";
  const tw = measure(ctx, label, size, 500, -0.01, role);
  const chev = opts.chevron === false ? 0 : size * 1.1;
  const w = h * 0.9 + tw + chev + h * 0.55;
  const x0 = opts.align === "center" ? x - w / 2 : x;
  const r = (h / 2) * clamp(A.look.radius * 1.6, 0.3, 1);
  const u = opts.u ?? h / 100;
  ctx.save();
  if (opts.scale && opts.scale !== 1) {
    ctx.translate(x0 + w / 2, y + h / 2);
    ctx.scale(opts.scale, opts.scale);
    ctx.translate(-(x0 + w / 2), -(y + h / 2));
  }
  if (opts.outline) {
    rrect(ctx, x0, y, w, h, r);
    ctx.strokeStyle = fg;
    ctx.lineWidth = Math.max(2, h * 0.04);
    ctx.stroke();
  } else if (A.look.surface === "sticker") {
    rrect(ctx, x0 + 6 * u, y + 8 * u, w, h, r);
    ctx.fillStyle = A.colors.ink;
    ctx.fill();
    rrect(ctx, x0, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 3.5 * u;
    ctx.strokeStyle = A.colors.ink;
    ctx.stroke();
  } else {
    if (opts.glow && A.look.glow > 0) {
      const light = fill === "#FFFFFF" || luminance(solid(fill)) > 0.7;
      ctx.shadowColor = light ? "rgba(10,36,68,0.25)" : A.brand ? "rgba(0,114,245,0.35)" : alpha(solid(fill), 0.45 * Math.min(1, A.look.glow + 0.3));
      ctx.shadowBlur = h * 0.5 * (0.6 + A.look.glow * 0.8);
      ctx.shadowOffsetY = h * 0.18;
    }
    rrect(ctx, x0, y, w, h, r);
    ctx.fillStyle = paint(ctx, fill, x0, y, x0 + w, y + h);
    ctx.fill();
    ctx.shadowColor = "transparent";
    if (A.look.surface === "glass") {
      rrect(ctx, x0 + u, y + u, w - 2 * u, h - 2 * u, r);
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
    }
  }
  text(ctx, label, x0 + h * 0.6, y + h / 2 + size * 0.36, size, 500, fg, "left", -0.01, role);
  if (chev) icon(ctx, "chevron-right", x0 + h * 0.6 + tw + size * 0.35, y + h / 2 - size * 0.55, size * 1.1, fg, 1, 2.4);
  ctx.restore();
  return w;
}

// ---------------------------------------------------------------- cursors

const ARROW = "M2 1.5 L2 19.5 L6.6 15.4 L9.6 22.2 L13 20.7 L10.1 14.1 L16.3 14.1 Z";
// pointing hand, fingertip at (8.6, 1.4)
const HAND =
  "M8.6 1.4c-1.15 0-2.05.9-2.05 2.05v9.35l-1.5-1.5c-.82-.82-2.15-.82-2.97 0-.82.82-.82 2.13-.02 2.96l4.9 5.35c1.4 1.55 3.25 2.4 5.35 2.4h2.3c3.4 0 6.15-2.75 6.15-6.15v-4.5c0-1.05-.85-1.9-1.9-1.9-.42 0-.8.13-1.12.36-.2-.92-1.02-1.6-2-1.6-.5 0-.95.18-1.3.47-.3-.8-1.07-1.37-1.98-1.37-.4 0-.77.11-1.08.3V3.45c0-1.15-.9-2.05-2.05-2.05Z";
let arrowPath: Path2D | null = null;
let handPath: Path2D | null = null;

/** Pointer cursor in the look's style (macOS arrow, or a hand for product-demo looks). */
export function cursor(ctx: Ctx, x: number, y: number, size: number, alphaV: number, style?: "arrow" | "hand") {
  const hand = (style ?? A.look.cursor) === "hand";
  arrowPath ??= new Path2D(ARROW);
  handPath ??= new Path2D(HAND);
  const k = size / 24;
  ctx.save();
  ctx.globalAlpha *= alphaV;
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (hand) ctx.translate(-8.6, -1.4);
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  const path = hand ? handPath : arrowPath;
  ctx.fillStyle = "#FFFFFF";
  ctx.fill(path);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#0A0A0A";
  ctx.lineWidth = hand ? 1.4 : 1.6;
  ctx.lineJoin = "round";
  ctx.stroke(path);
  ctx.restore();
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
  /** Draw the icon-mark pattern band at the bottom (looks that use it). */
  pattern?: boolean;
  /** Seconds, for slow drift. */
  t: number;
  /** Small per-scene variation. */
  seed?: number;
  /** Force a background kind (media scenes use "plain"). */
  kind?: BgKind;
}

function blob(ctx: Ctx, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, alpha(solid(color), a));
  g.addColorStop(0.55, alpha(solid(color), a * 0.42));
  g.addColorStop(1, alpha(solid(color), 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function edgeFade(ctx: Ctx, s: Stage, color: string, a: number) {
  const g = ctx.createRadialGradient(s.W / 2, s.H / 2, Math.min(s.W, s.H) * 0.25, s.W / 2, s.H / 2, Math.max(s.W, s.H) * 0.72);
  g.addColorStop(0, alpha(color, 0));
  g.addColorStop(1, alpha(color, a));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s.W, s.H);
}

export function bgKind(theme: Theme): BgKind {
  return A.look.bg[theme] ?? "plain";
}

export function background(ctx: Ctx, s: Stage, theme: Theme, o: BgOpts) {
  const { W, H, u } = s;
  const t = o.t;
  const seed = o.seed ?? 0;
  const L = A.look;
  const c = A.colors;
  const pal = palette(theme);
  const kind = o.kind ?? bgKind(theme);
  const pattern = o.pattern !== false && L.pattern;
  const grain = L.grain;
  ctx.save();
  switch (kind) {
    case "brand-soft": {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      const gx = W * (0.85 + 0.04 * Math.sin(t * 0.25 + seed));
      const gy = H * (0.08 + 0.03 * Math.cos(t * 0.2 + seed));
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.75);
      if (A.brand) {
        g.addColorStop(0, "rgba(185,212,255,0.55)");
        g.addColorStop(0.45, "rgba(220,234,255,0.35)");
      } else {
        g.addColorStop(0, alpha(mix(c.primary, "#FFFFFF", 0.62), 0.55));
        g.addColorStop(0.45, alpha(mix(c.primary, "#FFFFFF", 0.82), 0.35));
      }
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (pattern) drawBand(ctx, s, A.brand ? "rgba(0,114,245,1)" : c.primary, 0.07, t);
      break;
    }
    case "brand-dark": {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      const gx = W * (0.2 + 0.05 * Math.sin(t * 0.22 + seed));
      const gy = H * (0.95 + 0.03 * Math.cos(t * 0.18 + seed));
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.8);
      g.addColorStop(0, A.brand ? "rgba(0,114,245,0.32)" : alpha(c.primary, 0.32));
      g.addColorStop(0.5, A.brand ? "rgba(0,86,190,0.10)" : alpha(c.primary, 0.1));
      g.addColorStop(1, "rgba(10,10,10,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (pattern) drawBand(ctx, s, "#FFFFFF", 0.07, t);
      drawGrain(ctx, s, t, 0.05 * grain);
      break;
    }
    case "brand-gradient": {
      // deep navy top-left, primary through the middle, pale cyan bottom-right
      const drift = 0.04 * Math.sin(t * 0.2 + seed);
      const g = ctx.createLinearGradient(0, 0, W, H);
      const stops = A.brand
        ? ["#14223F", "#0B4FC6", "#1A77FF", "#5CB8F2", "#C9F1FF"]
        : [mix(c.primary, "#000000", 0.72), mix(c.primary, "#000000", 0.2), c.primary, c.secondary, mix(c.tertiary, "#FFFFFF", 0.55)];
      g.addColorStop(0, stops[0]);
      g.addColorStop(0.28 + drift, stops[1]);
      g.addColorStop(0.5 + drift, stops[2]);
      g.addColorStop(0.78, stops[3]);
      g.addColorStop(1, stops[4]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const gx = W * (0.9 + 0.05 * Math.cos(t * 0.17 + seed));
      const gy = H * (0.85 + 0.04 * Math.sin(t * 0.21));
      const r = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.6);
      r.addColorStop(0, "rgba(220,248,255,0.55)");
      r.addColorStop(1, "rgba(220,248,255,0)");
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, W, H);
      if (pattern) drawBand(ctx, s, "#FFFFFF", 0.16, t);
      drawGrain(ctx, s, t, 0.09 * grain);
      break;
    }
    case "grid": {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      blob(ctx, W * (0.92 + 0.03 * Math.sin(t * 0.2 + seed)), H * 0.04, Math.max(W, H) * 0.6, pal.accent, 0.12);
      const step = 64 * u;
      const off = (t * 6 * u) % step;
      ctx.strokeStyle = alpha(theme === "light" ? c.ink : "#FFFFFF", theme === "light" ? 0.07 : 0.06);
      ctx.lineWidth = Math.max(1, u);
      ctx.beginPath();
      for (let x = -step + off; x < W + step; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, H);
      }
      for (let y = -step + off; y < H + step; y += step) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(W, Math.round(y) + 0.5);
      }
      ctx.stroke();
      edgeFade(ctx, s, solid(pal.bg), 0.85);
      drawGrain(ctx, s, t, 0.04 * grain);
      break;
    }
    case "dots": {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      const step = 40 * u;
      const dotR = 1.7 * u;
      ctx.fillStyle = alpha(theme === "light" ? c.ink : "#FFFFFF", theme === "light" ? 0.2 : 0.16);
      for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) ctx.fillRect(x - dotR, y - dotR, dotR * 2, dotR * 2);
      edgeFade(ctx, s, solid(pal.bg), 0.75);
      break;
    }
    case "glass": {
      ctx.fillStyle = theme === "light" ? c.paper : pal.bg;
      ctx.fillRect(0, 0, W, H);
      const R = Math.max(W, H);
      blob(ctx, W * (0.12 + 0.06 * Math.sin(t * 0.21 + seed)), H * (0.18 + 0.05 * Math.cos(t * 0.17)), R * 0.62, c.primary, 0.38);
      blob(ctx, W * (0.9 + 0.05 * Math.cos(t * 0.19 + seed)), H * (0.38 + 0.06 * Math.sin(t * 0.23)), R * 0.55, c.secondary, 0.34);
      blob(ctx, W * (0.45 + 0.08 * Math.sin(t * 0.15 + seed * 2)), H * (0.98 + 0.03 * Math.cos(t * 0.2)), R * 0.6, c.tertiary, 0.42);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(0, 0, W, H);
      drawGrain(ctx, s, t, 0.05 * grain);
      break;
    }
    case "mesh": {
      ctx.fillStyle = c.primary;
      ctx.fillRect(0, 0, W, H);
      const R = Math.max(W, H);
      blob(ctx, W * (0.1 + 0.08 * Math.sin(t * 0.2 + seed)), H * (0.12 + 0.06 * Math.cos(t * 0.16)), R * 0.7, mix(c.primary, "#000000", 0.45), 0.8);
      blob(ctx, W * (0.92 + 0.05 * Math.cos(t * 0.18 + seed)), H * (0.3 + 0.07 * Math.sin(t * 0.22)), R * 0.6, c.secondary, 0.75);
      blob(ctx, W * (0.4 + 0.1 * Math.sin(t * 0.14 + seed)), H * (0.95 + 0.04 * Math.cos(t * 0.2)), R * 0.65, c.tertiary, 0.7);
      drawGrain(ctx, s, t, 0.08 * grain);
      break;
    }
    case "neon": {
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, W, H);
      const R = Math.max(W, H);
      const a = t * 0.18 + seed;
      blob(ctx, W * (0.5 + 0.38 * Math.cos(a)), H * (0.32 + 0.22 * Math.sin(a * 1.3)), R * 0.55, c.primary, 0.42);
      blob(ctx, W * (0.5 + 0.4 * Math.cos(a + 2.2)), H * (0.7 + 0.2 * Math.sin(a * 1.1 + 1)), R * 0.5, c.secondary, 0.3);
      blob(ctx, W * (0.5 + 0.3 * Math.cos(a + 4.1)), H * (0.5 + 0.3 * Math.sin(a * 0.9 + 2)), R * 0.35, c.tertiary, 0.18);
      // faint horizon grid
      ctx.strokeStyle = "rgba(255,255,255,0.045)";
      ctx.lineWidth = Math.max(1, u);
      ctx.beginPath();
      const step = 90 * u;
      for (let x = (t * 8 * u) % step; x < W; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let y = 0; y < H; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
      edgeFade(ctx, s, solid(pal.bg), 0.7);
      drawGrain(ctx, s, t, 0.06 * grain);
      break;
    }
    case "black": {
      ctx.fillStyle = theme === "light" ? pal.bg : "#000000";
      ctx.fillRect(0, 0, W, H);
      if (theme !== "light") blob(ctx, W / 2, H * 0.55, Math.max(W, H) * 0.6, pal.accent, L.glow * 0.1);
      drawGrain(ctx, s, t, 0.08 * grain);
      break;
    }
    case "block": {
      ctx.fillStyle = theme === "dark" ? pal.bg : c.primary;
      ctx.fillRect(0, 0, W, H);
      drawGrain(ctx, s, t, 0.08 * grain);
      break;
    }
    case "block-light": {
      ctx.fillStyle = c.paper;
      ctx.fillRect(0, 0, W, H);
      drawGrain(ctx, s, t, 0.06 * grain);
      break;
    }
    case "paper": {
      ctx.fillStyle = c.paper;
      ctx.fillRect(0, 0, W, H);
      blob(ctx, W * 0.8, H * 0.1, Math.max(W, H) * 0.7, "#FFFFFF", 0.45);
      edgeFade(ctx, s, mix(c.paper, c.ink, luminance(c.paper) > 0.95 ? 0.08 : 0.25), luminance(c.paper) > 0.95 ? 0.3 : 0.35);
      drawGrain(ctx, s, t, 0.1 * grain);
      break;
    }
    case "ink": {
      const base = theme === "blue" ? mix(c.primary, "#000000", 0.35) : pal.bg;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      // slow flowing ribbons of colour
      for (let k = 0; k < 3; k++) {
        const ph = t * (0.08 + k * 0.03) + seed + k * 2.1;
        ctx.save();
        ctx.translate(W * (0.3 + 0.4 * Math.sin(ph)), H * (0.25 + k * 0.28 + 0.06 * Math.cos(ph * 1.3)));
        ctx.rotate(-0.5 + 0.25 * Math.sin(ph * 0.7));
        ctx.scale(2.6, 0.5);
        blob(ctx, 0, 0, Math.max(W, H) * 0.42, k === 1 ? c.secondary : c.primary, k === 1 ? 0.16 : 0.5);
        ctx.restore();
      }
      drawGrain(ctx, s, t, 0.1 * grain);
      break;
    }
    case "shapes": {
      const base = theme === "light" ? c.paper : theme === "dark" ? pal.bg : c.primary;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, W, H);
      const r = rng(1000 + seed * 31);
      const cols = theme === "blue" ? ["#FFFFFF", c.secondary, c.tertiary] : [c.primary, c.secondary, c.tertiary];
      const n = 8;
      const sf = s.safe;
      for (let i = 0; i < n; i++) {
        // shapes live in the margins outside the safe area so text stays clear
        const edge = i % 4;
        const along = r();
        const k = r();
        const x = edge === 0 ? k * sf.x * 0.75 : edge === 1 ? W - k * (W - sf.x - sf.w) * 0.75 : along * W;
        const y = edge === 2 ? k * sf.y * 0.8 : edge === 3 ? H - k * (H - sf.y - sf.h) * 0.8 : along * H;
        const sz = (44 + r() * 100) * u;
        const bob = Math.sin(t * (0.6 + r() * 0.6) + i) * 14 * u;
        const rot = (r() - 0.5) * 0.8 + Math.sin(t * 0.4 + i) * 0.12;
        const kind = Math.floor(r() * 4);
        ctx.save();
        ctx.translate(x, y + bob);
        ctx.rotate(rot);
        ctx.globalAlpha = theme === "light" ? 0.85 : 0.7;
        ctx.fillStyle = cols[i % 3];
        ctx.strokeStyle = cols[i % 3];
        if (kind === 0) {
          ctx.beginPath();
          ctx.arc(0, 0, sz / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind === 1) {
          rrect(ctx, -sz / 2, -sz / 2, sz, sz, sz * 0.28);
          ctx.fill();
        } else if (kind === 2) {
          ctx.lineWidth = sz * 0.18;
          ctx.beginPath();
          ctx.arc(0, 0, sz * 0.38, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          rrect(ctx, -sz * 0.7, -sz * 0.22, sz * 1.4, sz * 0.44, sz * 0.22);
          ctx.fill();
        }
        ctx.restore();
      }
      break;
    }
    case "plain":
    default: {
      ctx.fillStyle = theme === "blue" ? c.primary : pal.bg;
      ctx.fillRect(0, 0, W, H);
      if (theme !== "light") blob(ctx, W * 0.5, -H * 0.1, Math.max(W, H) * 0.7, theme === "blue" ? "#FFFFFF" : pal.accent, theme === "blue" ? 0.14 : 0.12 * Math.max(0.3, L.glow));
      drawGrain(ctx, s, t, 0.05 * grain);
    }
  }
  ctx.restore();
}

function drawBand(ctx: Ctx, s: Stage, color: string, a: number, t: number) {
  const bandH = (s.portrait ? 300 : 230) * s.u;
  const band = patternBand(s.W, bandH, color);
  const shift = ((t * 14 * s.u) % (band.width - s.W)) || 0;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.drawImage(band, -shift, s.H - bandH + 6 * s.u);
  ctx.restore();
}

export function drawGrain(ctx: Ctx, s: Stage, t: number, a: number) {
  if (a <= 0.001) return;
  const tile = grainTile();
  const frame = Math.floor(t * 24);
  const r = rng(frame * 9973 + 11);
  const ox = Math.floor(r() * 256);
  const oy = Math.floor(r() * 256);
  ctx.save();
  ctx.globalAlpha = a;
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
export function image(ctx: Ctx, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, fit: "cover" | "contain" = "cover", r = 0, focusX = 0.5, focusY = 0.5) {
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
  ctx.drawImage(img, x + (w - dw) * clamp(focusX), y + (h - dh) * clamp(focusY), dw, dh);
  ctx.restore();
}

// ---------------------------------------------------------------- 3D tilt

const scratchCanvases = new Map<string, OffscreenCanvas>();
/** A reusable offscreen layer the size of the stage (slot lets nested effects use separate layers). */
export function scratch(W: number, H: number, slot = 0): OffscreenCanvas {
  const key = `${W}x${H}:${slot}`;
  let c = scratchCanvases.get(key);
  if (!c) scratchCanvases.set(key, (c = new OffscreenCanvas(W, H)));
  return c;
}

export interface Tilt {
  /** Lean back (+) or forward, radians. */
  rx: number;
  /** Turn left (+) or right, radians. */
  ry: number;
  /** In-plane rotation, radians. */
  rz?: number;
}

/**
 * Draws a group rotated in 3D about the centre of `box`: the group is drawn flat into a layer,
 * then mapped onto the screen through a perspective projection, a small triangle mesh at a time.
 */
export function tilted(ctx: Ctx, s: Stage, box: { x: number; y: number; w: number; h: number }, tilt: Tilt, draw: (g: OffscreenCanvasRenderingContext2D) => void, slot = 0) {
  if (Math.abs(tilt.rx) < 0.002 && Math.abs(tilt.ry) < 0.002 && Math.abs(tilt.rz ?? 0) < 0.002) {
    draw(ctx as OffscreenCanvasRenderingContext2D);
    return;
  }
  const layer = scratch(s.W, s.H, 10 + slot);
  const g = layer.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.filter = "none";
  g.clearRect(0, 0, s.W, s.H);
  draw(g);
  // region to map: the box plus a margin for shadows, labels and the cursor
  const m = 90 * s.u;
  const sx = Math.max(0, box.x - m);
  const sy = Math.max(0, box.y - m);
  const sw = Math.min(s.W, box.x + box.w + m) - sx;
  const sh = Math.min(s.H, box.y + box.h + m) - sy;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dist = Math.max(s.W, s.H) * 1.7;
  const cX = Math.cos(tilt.rx), sX = Math.sin(tilt.rx);
  const cY = Math.cos(tilt.ry), sY = Math.sin(tilt.ry);
  const rz = tilt.rz ?? 0;
  const cZ = Math.cos(rz), sZ = Math.sin(rz);
  const proj = (x: number, y: number): [number, number] => {
    let X = x - cx;
    let Y = y - cy;
    // in-plane, then turn (Y axis), then lean (X axis)
    const X1 = X * cZ - Y * sZ;
    const Y1 = X * sZ + Y * cZ;
    const X2 = X1 * cY;
    const Z2 = -X1 * sY;
    const Y3 = Y1 * cX - Z2 * sX;
    const Z3 = Y1 * sX + Z2 * cX;
    const k = dist / (dist + Z3);
    X = X2 * k;
    Y = Y3 * k;
    return [cx + X, cy + Y];
  };
  const n = 12;
  const pts: [number, number][][] = [];
  for (let j = 0; j <= n; j++) {
    const row: [number, number][] = [];
    for (let i = 0; i <= n; i++) row.push(proj(sx + (sw * i) / n, sy + (sh * j) / n));
    pts.push(row);
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = sx + (sw * i) / n;
      const x1 = sx + (sw * (i + 1)) / n;
      const y0 = sy + (sh * j) / n;
      const y1 = sy + (sh * (j + 1)) / n;
      tri(ctx, layer, [x0, y0], [x1, y0], [x0, y1], pts[j][i], pts[j][i + 1], pts[j + 1][i], [x0, y0, x1 - x0, y1 - y0]);
      tri(ctx, layer, [x1, y0], [x1, y1], [x0, y1], pts[j][i + 1], pts[j + 1][i + 1], pts[j + 1][i], [x0, y0, x1 - x0, y1 - y0]);
    }
  }
}

function tri(ctx: Ctx, img: OffscreenCanvas, s0: number[], s1: number[], s2: number[], d0: number[], d1: number[], d2: number[], cell: number[]) {
  // grow the destination triangle a little so neighbouring triangles overlap (no hairline seams)
  const gx = (d0[0] + d1[0] + d2[0]) / 3;
  const gy = (d0[1] + d1[1] + d2[1]) / 3;
  const grow = (p: number[]) => {
    const dx = p[0] - gx;
    const dy = p[1] - gy;
    const l = Math.hypot(dx, dy) || 1;
    return [p[0] + (dx / l) * 0.9, p[1] + (dy / l) * 0.9];
  };
  const [a0, a1, a2] = [grow(d0), grow(d1), grow(d2)];
  const denom = s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]);
  if (Math.abs(denom) < 1e-9) return;
  const a = (d0[0] * (s1[1] - s2[1]) + d1[0] * (s2[1] - s0[1]) + d2[0] * (s0[1] - s1[1])) / denom;
  const b = (d0[1] * (s1[1] - s2[1]) + d1[1] * (s2[1] - s0[1]) + d2[1] * (s0[1] - s1[1])) / denom;
  const c = (d0[0] * (s2[0] - s1[0]) + d1[0] * (s0[0] - s2[0]) + d2[0] * (s1[0] - s0[0])) / denom;
  const d = (d0[1] * (s2[0] - s1[0]) + d1[1] * (s0[0] - s2[0]) + d2[1] * (s1[0] - s0[0])) / denom;
  const e = (d0[0] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[0] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[0] * (s0[0] * s1[1] - s1[0] * s0[1])) / denom;
  const f = (d0[1] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[1] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[1] * (s0[0] * s1[1] - s1[0] * s0[1])) / denom;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a0[0], a0[1]);
  ctx.lineTo(a1[0], a1[1]);
  ctx.lineTo(a2[0], a2[1]);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  // draw only the cell (plus a pixel of bleed) from the layer
  const bx = Math.max(0, cell[0] - 1);
  const by = Math.max(0, cell[1] - 1);
  const bw = Math.min(img.width - bx, cell[2] + 2);
  const bh = Math.min(img.height - by, cell[3] + 2);
  if (bw > 0 && bh > 0) ctx.drawImage(img, bx, by, bw, bh, bx, by, bw, bh);
  ctx.restore();
}

/** A tilt that settles from a stronger entry angle to a gentle resting one. */
export function tiltFor(mode: string | boolean | undefined, p: number, t: number, flat = 0): Tilt {
  const m = mode === true ? "left" : mode || "none";
  if (m === "none") return { rx: 0, ry: 0 };
  const k = 1 - clamp(flat);
  const drift = Math.sin(t * 0.6) * 0.015;
  const ease = (a: number, b: number) => (a + (b - a) * clamp(p)) * k;
  if (m === "back") return { rx: ease(0.55, 0.24) + drift, ry: 0, rz: 0 };
  const dir = m === "right" ? -1 : 1;
  return { rx: ease(0.4, 0.14) + drift * 0.5, ry: dir * (ease(0.62, 0.3) + drift), rz: dir * ease(-0.06, -0.025) };
}
