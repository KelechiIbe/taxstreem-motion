// Motion maths. Everything is a pure function of time so any frame can be drawn on its own
// (seek(t)): no state carried between frames, no timers, seeded randomness only.

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const invLerp = (a: number, b: number, x: number) => (b === a ? 0 : clamp((x - a) / (b - a)));
/** Maps x from [a,b] to [c,d], clamped. */
export const remap = (x: number, a: number, b: number, c: number, d: number) => lerp(c, d, invLerp(a, b, x));

export const ease = {
  linear: (p: number) => clamp(p),
  outCubic: (p: number) => 1 - Math.pow(1 - clamp(p), 3),
  outQuart: (p: number) => 1 - Math.pow(1 - clamp(p), 4),
  outQuint: (p: number) => 1 - Math.pow(1 - clamp(p), 5),
  outExpo: (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(p))),
  inCubic: (p: number) => Math.pow(clamp(p), 3),
  inOutCubic: (p: number) => {
    p = clamp(p);
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  },
  inOutQuart: (p: number) => {
    p = clamp(p);
    return p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2;
  },
  inOutExpo: (p: number) => {
    p = clamp(p);
    if (p === 0 || p === 1) return p;
    return p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2;
  },
  /** Smooth start and stop, gentler than inOutCubic. */
  smooth: (p: number) => {
    p = clamp(p);
    return p * p * p * (p * (p * 6 - 15) + 10);
  },
};

/**
 * Closed-form spring response from 0 to 1, evaluated at time t (seconds since it started).
 * `settle` is roughly the time to come to rest; `bounce` 0 is critically damped (the brand
 * default: calm, no overshoot), up to ~0.25 for a hint of life on small UI elements.
 */
export function spring(t: number, settle = 0.7, bounce = 0): number {
  if (t <= 0) return 0;
  const zeta = clamp(1 - bounce, 0.05, 1);
  const w = 6.6 / settle; // ~99% settled at `settle` when critically damped
  if (zeta >= 0.999) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
}

/**
 * Sum of spring responses: a value that changes target several times stays seekable.
 * value(t) = initial + Σ (change × spring(t − changeTime))
 */
export function springSteps(t: number, initial: number, steps: { at: number; to: number }[], settle = 0.7, bounce = 0): number {
  let v = initial;
  let prev = initial;
  for (const s of steps) {
    v += (s.to - prev) * spring(t - s.at, settle, bounce);
    prev = s.to;
  }
  return v;
}

/** 0→1 over [start, start+dur] with an easing. */
export const tween = (t: number, start: number, dur: number, fn: (p: number) => number = ease.outCubic) => fn((t - start) / Math.max(1e-6, dur));

/** Seeded PRNG (mulberry32): same seed, same numbers, every render. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Parses #RGB/#RRGGBB into [r,g,b]. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
export function mixHex(a: string, b: string, p: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = x.map((v, i) => Math.round(lerp(v, y[i], clamp(p))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Formats numbers for on-screen stats: ₦1,250,000 or ₦1.25M. */
export function formatNumber(v: number, opts: { decimals?: number; compact?: boolean; prefix?: string; suffix?: string } = {}): string {
  const { decimals = 0, compact = false, prefix = "", suffix = "" } = opts;
  let body: string;
  if (compact) {
    const abs = Math.abs(v);
    const units: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
    const u = units.find(([n]) => abs >= n);
    if (u) {
      const n = v / u[0];
      body = n.toFixed(n >= 100 ? 0 : decimals || (n >= 10 ? 1 : 2)).replace(/\.0+$/, "") + u[1];
    } else body = v.toFixed(decimals);
  } else {
    body = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return prefix + body + suffix;
}
