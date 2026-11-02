// Inter (OFL) stands in for Helvetica Neue, which the brand licence doesn't allow as a webfont.
// Loaded from our own files so every render, in any browser or worker, uses identical glyphs.

export const FONT_FILES = [
  { url: "/fonts/inter-latin-wght-normal.woff2", range: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  { url: "/fonts/inter-latin-ext-wght-normal.woff2", range: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
];

export async function fetchFonts(base = ""): Promise<{ range: string; data: ArrayBuffer }[]> {
  return Promise.all(FONT_FILES.map(async (f) => ({ range: f.range, data: await (await fetch(base + f.url)).arrayBuffer() })));
}

/** Registers the fonts on a FontFaceSet (document.fonts or a worker's self.fonts). */
export async function installFonts(set: FontFaceSet, files: { range: string; data: ArrayBuffer }[]) {
  for (const f of files) {
    const face = new FontFace("Inter", f.data.slice(0), { weight: "100 900", unicodeRange: f.range });
    await face.load();
    set.add(face);
  }
  // warm every weight we draw with
  await Promise.all([400, 500, 600, 700].map((w) => set.load(`${w} 40px Inter`).catch(() => null)));
}
