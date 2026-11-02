// Bundled fonts (all SIL Open Font Licence), loaded on demand by whichever look needs them.
// Same files in the browser, the worker and headless renders, so glyphs never differ.
// Inter stands in for Helvetica Neue, which the TaxStreem licence doesn't allow as a webfont.

const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

interface FontFile {
  url: string;
  range: string;
  weight: string;
  style?: "normal" | "italic";
}

const variable = (slug: string, weight: string): FontFile[] => [
  { url: `/fonts/${slug}-latin-wght-normal.woff2`, range: LATIN, weight },
  { url: `/fonts/${slug}-latin-ext-wght-normal.woff2`, range: LATIN_EXT, weight },
];

export const FAMILIES: Record<string, FontFile[]> = {
  Inter: variable("inter", "100 900"),
  Manrope: variable("manrope", "200 800"),
  "Plus Jakarta Sans": variable("plus-jakarta-sans", "200 800"),
  "Space Grotesk": variable("space-grotesk", "300 700"),
  "Bricolage Grotesque": variable("bricolage-grotesque", "200 800"),
  Fredoka: variable("fredoka", "300 700"),
  "JetBrains Mono": variable("jetbrains-mono", "100 800"),
  // single-weight faces: registered across all weights so the browser never fakes bold
  Anton: [
    { url: "/fonts/anton-latin-400-normal.woff2", range: LATIN, weight: "100 900" },
    { url: "/fonts/anton-latin-ext-400-normal.woff2", range: LATIN_EXT, weight: "100 900" },
  ],
  "Instrument Serif": [
    { url: "/fonts/instrument-serif-latin-400-normal.woff2", range: LATIN, weight: "100 900" },
    { url: "/fonts/instrument-serif-latin-ext-400-normal.woff2", range: LATIN_EXT, weight: "100 900" },
    { url: "/fonts/instrument-serif-latin-400-italic.woff2", range: LATIN, weight: "100 900", style: "italic" },
    { url: "/fonts/instrument-serif-latin-ext-400-italic.woff2", range: LATIN_EXT, weight: "100 900", style: "italic" },
  ],
};

/** Weight range each family really has, so requests outside it are clamped rather than faked. */
export const RANGE: Record<string, [number, number]> = {
  Inter: [100, 900],
  Manrope: [200, 800],
  "Plus Jakarta Sans": [200, 800],
  "Space Grotesk": [300, 700],
  "Bricolage Grotesque": [200, 800],
  Fredoka: [300, 700],
  "JetBrains Mono": [100, 800],
  Anton: [100, 900],
  "Instrument Serif": [100, 900],
};

/** Families a set of looks needs. */
export function familiesFor(looks: { fonts: { display: string; body: string; mono: string } }[]): string[] {
  return [...new Set(looks.flatMap((l) => [l.fonts.display, l.fonts.body, l.fonts.mono]))];
}

const loaded = new WeakMap<FontFaceSet, Map<string, Promise<void>>>();

/** Makes sure each family is registered on this FontFaceSet (document.fonts or a worker's self.fonts). */
export async function ensureFonts(set: FontFaceSet, families: string[], base = ""): Promise<void> {
  let m = loaded.get(set);
  if (!m) loaded.set(set, (m = new Map()));
  const jobs: Promise<void>[] = [];
  for (const fam of new Set(["Inter", ...families])) {
    const files = FAMILIES[fam];
    if (!files) continue;
    let p = m.get(fam);
    if (!p) {
      p = (async () => {
        for (const f of files) {
          const data = await (await fetch(base + f.url)).arrayBuffer();
          const face = new FontFace(fam, data, { weight: f.weight, style: f.style ?? "normal", unicodeRange: f.range });
          await face.load();
          set.add(face);
        }
        await Promise.all([400, 500, 600, 700].map((w) => set.load(`${w} 40px "${fam}"`).catch(() => null)));
      })();
      m.set(fam, p);
      p.catch(() => m!.delete(fam));
    }
    jobs.push(p);
  }
  await Promise.all(jobs);
}
