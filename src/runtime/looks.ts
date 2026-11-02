// Looks: the style layer. A look changes fonts, type, backgrounds, card surfaces, motion feel
// and cursor; the scene templates stay the same. Colours come from TaxStreem by default, from the
// look's own colourway when asked, or from a custom palette (for partner or non-TaxStreem work).

import { clamp, hexToRgb, mixHex } from "./lib";
import type { Theme, TransitionKind } from "./types";

export type BgKind = "brand-soft" | "brand-dark" | "brand-gradient" | "plain" | "grid" | "dots" | "glass" | "mesh" | "neon" | "black" | "block" | "block-light" | "paper" | "ink" | "shapes";
export type Surface = "solid" | "glass" | "outline" | "flat" | "sticker";
export type Entry = "rise" | "pop" | "blur" | "slide" | "type";

export interface Colorway {
  primary: string;
  secondary: string;
  tertiary: string;
  ink: string;
  paper: string;
}

export interface Look {
  id: string;
  name: string;
  blurb: string;
  bestFor: string;
  fonts: { display: string; body: string; mono: string; italicAccent?: boolean; /** Card and step titles; defaults to the display face. */ head?: string };
  type: { displayWeight: number; headWeight: number; tracking: number; lineHeight: number; scale: number; upper?: boolean };
  colors: Colorway;
  defaultTheme: Theme;
  bg: Record<Theme, BgKind>;
  surface: Surface;
  radius: number;
  motion: { settle: number; bounce: number; stagger: number; entry: Entry; transition: TransitionKind };
  cursor: "arrow" | "hand";
  glow: number;
  grain: number;
  pattern: boolean;
  tilt: boolean;
  gradientText: boolean;
  /** Kicker labels in the mono face. */
  kicker?: "mono";
  /** On brand-colour (blue theme) scenes, highlight words in the secondary colour instead of two-tone. */
  brandHighlight?: "secondary";
}

export const BRAND_COLORS: Colorway = { primary: "#0072F5", secondary: "#3E88FF", tertiary: "#8CBAFF", ink: "#0A0A0A", paper: "#FFFFFF" };

export const LOOKS: Look[] = [
  {
    id: "taxstreem",
    name: "TaxStreem Calm",
    blurb: "The house style: white space, Inter, the brand gradient and mark pattern, calm settling motion.",
    bestFor: "Default for TaxStreem product, education and brand content.",
    fonts: { display: "Inter", body: "Inter", mono: "JetBrains Mono" },
    type: { displayWeight: 500, headWeight: 600, tracking: -0.02, lineHeight: 1.04, scale: 1 },
    colors: BRAND_COLORS,
    defaultTheme: "light",
    bg: { light: "brand-soft", dark: "brand-dark", blue: "brand-gradient" },
    surface: "solid",
    radius: 1,
    motion: { settle: 1, bounce: 0, stagger: 1, entry: "rise", transition: "fade" },
    cursor: "arrow",
    glow: 0.5,
    grain: 1,
    pattern: true,
    tilt: false,
    gradientText: false,
  },
  {
    id: "corporate",
    name: "Corporate Clean",
    blurb: "Measured B2B: Manrope, fine grid, flat cards with hairlines, tidy push transitions.",
    bestFor: "LinkedIn, partner and investor updates, enterprise and accountant audiences.",
    fonts: { display: "Manrope", body: "Manrope", mono: "JetBrains Mono" },
    type: { displayWeight: 700, headWeight: 700, tracking: -0.03, lineHeight: 1.06, scale: 0.95 },
    colors: { primary: "#0B4DB8", secondary: "#14B8A6", tertiary: "#7DD3FC", ink: "#0B1B2B", paper: "#F7F9FC" },
    defaultTheme: "light",
    bg: { light: "grid", dark: "plain", blue: "plain" },
    surface: "flat",
    radius: 0.6,
    motion: { settle: 0.85, bounce: 0, stagger: 0.9, entry: "slide", transition: "push" },
    cursor: "arrow",
    glow: 0.15,
    grain: 0.15,
    pattern: false,
    tilt: false,
    gradientText: false,
  },
  {
    id: "punchy",
    name: "Punchy Kinetic",
    blurb: "Loud and fast: condensed all-caps Anton, hard cuts on the beat, words that pop.",
    bestFor: "Reels and TikTok hooks, hype, launches, deadline urgency, music-led edits.",
    fonts: { display: "Anton", body: "Inter", mono: "JetBrains Mono" },
    type: { displayWeight: 400, headWeight: 400, tracking: 0.005, lineHeight: 0.98, scale: 1.25, upper: true },
    colors: { primary: "#FF3B30", secondary: "#FFD60A", tertiary: "#FFFFFF", ink: "#0B0B0B", paper: "#F2F2F2" },
    defaultTheme: "dark",
    bg: { light: "plain", dark: "black", blue: "block" },
    surface: "flat",
    radius: 0.45,
    motion: { settle: 0.45, bounce: 0.12, stagger: 0.55, entry: "pop", transition: "cut" },
    cursor: "arrow",
    glow: 0,
    grain: 0.6,
    pattern: false,
    tilt: false,
    gradientText: false,
    brandHighlight: "secondary",
  },
  {
    id: "glass",
    name: "Glass SaaS Launch",
    blurb: "Soft frosted glass on drifting colour, glowing buttons, a hand cursor and 3D-tilted product UI.",
    bestFor: "Product launches, feature demos, app walkthroughs (the Zelios / ObiN look).",
    fonts: { display: "Plus Jakarta Sans", body: "Plus Jakarta Sans", mono: "JetBrains Mono" },
    type: { displayWeight: 700, headWeight: 700, tracking: -0.035, lineHeight: 1.04, scale: 1 },
    colors: { primary: "#3B5BFF", secondary: "#7C9CFF", tertiary: "#C3B5FF", ink: "#0E1330", paper: "#F4F6FF" },
    defaultTheme: "light",
    bg: { light: "glass", dark: "neon", blue: "mesh" },
    surface: "glass",
    radius: 1.4,
    motion: { settle: 0.75, bounce: 0.22, stagger: 0.9, entry: "blur", transition: "zoom" },
    cursor: "hand",
    glow: 1,
    grain: 0.25,
    pattern: false,
    tilt: true,
    gradientText: true,
  },
  {
    id: "neon",
    name: "Neon Dark AI",
    blurb: "Near-black with orbiting neon glows, glass-dark cards with lit edges, gradient type.",
    bestFor: "AI features (Martina, Numens), tech audiences, night-mode launches.",
    fonts: { display: "Space Grotesk", body: "Space Grotesk", mono: "JetBrains Mono" },
    type: { displayWeight: 600, headWeight: 600, tracking: -0.035, lineHeight: 1.02, scale: 1 },
    colors: { primary: "#8B5CF6", secondary: "#22D3EE", tertiary: "#F472B6", ink: "#06050C", paper: "#F5F3FF" },
    defaultTheme: "dark",
    bg: { light: "glass", dark: "neon", blue: "neon" },
    surface: "glass",
    radius: 1.2,
    motion: { settle: 0.9, bounce: 0.05, stagger: 1, entry: "blur", transition: "fade" },
    cursor: "hand",
    glow: 1,
    grain: 0.4,
    pattern: false,
    tilt: true,
    gradientText: true,
    kicker: "mono",
  },
  {
    id: "keynote",
    name: "Keynote Black",
    blurb: "Apple-style: pure black, big tight white type, slow blur-ins, generous pauses.",
    bestFor: "Big announcements, premium moments, product reveals, founder messages.",
    fonts: { display: "Inter", body: "Inter", mono: "JetBrains Mono" },
    type: { displayWeight: 600, headWeight: 600, tracking: -0.04, lineHeight: 1.02, scale: 1.1 },
    colors: { primary: "#2997FF", secondary: "#BF5AF2", tertiary: "#FF9F0A", ink: "#000000", paper: "#F5F5F7" },
    defaultTheme: "dark",
    bg: { light: "plain", dark: "black", blue: "black" },
    surface: "flat",
    radius: 1.2,
    motion: { settle: 1.15, bounce: 0, stagger: 1.2, entry: "blur", transition: "fade" },
    cursor: "arrow",
    glow: 0.35,
    grain: 0,
    pattern: false,
    tilt: false,
    gradientText: true,
  },
  {
    id: "campaign",
    name: "Bold Campaign",
    blurb: "Flat colour blocks, chunky Bricolage type, sticker cards, photo collages that slide in.",
    bestFor: "People-led campaigns, community, events, the LemFi-style brand ad.",
    fonts: { display: "Bricolage Grotesque", body: "Inter", mono: "JetBrains Mono" },
    type: { displayWeight: 800, headWeight: 700, tracking: -0.045, lineHeight: 0.94, scale: 1.15 },
    colors: { primary: "#6D28D9", secondary: "#C6F432", tertiary: "#F59E0B", ink: "#111111", paper: "#FFFDF5" },
    defaultTheme: "blue",
    bg: { light: "block-light", dark: "black", blue: "block" },
    surface: "sticker",
    radius: 0.8,
    motion: { settle: 0.6, bounce: 0.25, stagger: 0.7, entry: "slide", transition: "push" },
    cursor: "hand",
    glow: 0,
    grain: 0.5,
    pattern: false,
    tilt: false,
    gradientText: false,
    brandHighlight: "secondary",
  },
  {
    id: "editorial",
    name: "Editorial Serif",
    blurb: "Elegant Instrument Serif with italic accents over warm paper or flowing ink, slow and literary.",
    bestFor: "Thought leadership, stories, faith and community content, manifesto or hype films.",
    fonts: { display: "Instrument Serif", body: "Inter", mono: "JetBrains Mono", italicAccent: true, head: "Inter" },
    type: { displayWeight: 400, headWeight: 600, tracking: -0.01, lineHeight: 1.0, scale: 1.12 },
    colors: { primary: "#1F4D3A", secondary: "#57D9A3", tertiary: "#E9C46A", ink: "#0E1512", paper: "#F4EFE6" },
    defaultTheme: "light",
    bg: { light: "paper", dark: "ink", blue: "ink" },
    surface: "outline",
    radius: 0.3,
    motion: { settle: 1.25, bounce: 0, stagger: 1.4, entry: "blur", transition: "fade" },
    cursor: "arrow",
    glow: 0,
    grain: 0.8,
    pattern: false,
    tilt: false,
    gradientText: false,
  },
  {
    id: "playful",
    name: "Playful Animated",
    blurb: "Rounded Fredoka, floating shapes, big bouncy pops and chunky rounded cards.",
    bestFor: "Light explainers, tips, education for individuals and freelancers, fun reminders.",
    fonts: { display: "Fredoka", body: "Fredoka", mono: "JetBrains Mono" },
    type: { displayWeight: 600, headWeight: 600, tracking: -0.01, lineHeight: 1.04, scale: 1.05 },
    colors: { primary: "#FF5A5F", secondary: "#FFC93C", tertiary: "#3D8BFF", ink: "#1F1B2E", paper: "#FFF7EC" },
    defaultTheme: "light",
    bg: { light: "shapes", dark: "shapes", blue: "shapes" },
    surface: "solid",
    radius: 2,
    motion: { settle: 0.7, bounce: 0.35, stagger: 0.8, entry: "pop", transition: "zoom" },
    cursor: "hand",
    glow: 0.3,
    grain: 0,
    pattern: false,
    tilt: false,
    gradientText: false,
  },
  {
    id: "mono",
    name: "Minimal Mono",
    blurb: "Swiss-minimal: dot grid, monospace labels, outlined cards, one sharp accent, typewriter text.",
    bestFor: "Developer and API content (developer portal), data, changelogs, precise how-tos.",
    fonts: { display: "Space Grotesk", body: "Space Grotesk", mono: "JetBrains Mono" },
    type: { displayWeight: 500, headWeight: 500, tracking: -0.035, lineHeight: 1.04, scale: 1 },
    colors: { primary: "#111111", secondary: "#FF4F00", tertiary: "#9CA3AF", ink: "#0F0F0F", paper: "#F3F3F1" },
    defaultTheme: "light",
    bg: { light: "dots", dark: "dots", blue: "plain" },
    surface: "outline",
    radius: 0.25,
    motion: { settle: 0.8, bounce: 0, stagger: 1, entry: "type", transition: "cut" },
    cursor: "arrow",
    glow: 0,
    grain: 0.15,
    pattern: false,
    tilt: false,
    gradientText: false,
    kicker: "mono",
  },
];

export const LOOK_BY_ID = new Map(LOOKS.map((l) => [l.id, l]));
export const getLook = (id?: string) => LOOK_BY_ID.get(id ?? "") ?? LOOKS[0];

export type PaletteChoice = "brand" | "look" | Partial<Colorway>;

/** Colours for a look: TaxStreem's by default, the look's own, or a custom palette. */
export function colorwayFor(look: Look, choice?: PaletteChoice): Colorway {
  if (!choice || choice === "brand") return BRAND_COLORS;
  if (choice === "look") return look.colors;
  const c = { ...BRAND_COLORS, ...look.colors, ...pickHex(choice) };
  return c;
}

function pickHex(c: Partial<Colorway>): Partial<Colorway> {
  const out: Partial<Colorway> = {};
  for (const k of ["primary", "secondary", "tertiary", "ink", "paper"] as const) {
    const v = c[k];
    if (typeof v === "string" && /^#?[0-9a-f]{6}$/i.test(v.trim())) out[k] = v.trim().startsWith("#") ? v.trim() : `#${v.trim()}`;
  }
  return out;
}

const isHex = (c: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);

export function luminance(hex: string): number {
  if (!isHex(hex)) return 0.5;
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const onColor = (hex: string, ink = "#0A0A0A") => (luminance(hex) > 0.45 ? ink : "#FFFFFF");
export const alpha = (hex: string, a: number) => {
  if (!isHex(hex)) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(a)})`;
};
export const mix = (a: string, b: string, p: number) => {
  if (!isHex(a) || !isHex(b)) return isHex(a) ? a : b;
  const m = mixHex(a, b, p).match(/\d+/g)!.map(Number);
  return "#" + m.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
};
export const contrast = (a: string, b: string) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
