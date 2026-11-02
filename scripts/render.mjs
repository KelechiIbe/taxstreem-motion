#!/usr/bin/env node
// Headless renderer: draws a spec frame by frame with the same runtime the app uses, in Chromium
// via Playwright, and encodes with FFmpeg. Also makes contact sheets for review.
//
//   npm run build
//   node scripts/render.mjs spec.json --format 9:16 --out out.mp4 [--fps 30] [--audio mix.wav]
//   node scripts/render.mjs spec.json --format 16:9 --sheet sheet.jpg
//   node scripts/render.mjs spec.json --format 1:1 --frames 0.5,2,4 --frames-dir shots/
//   options: --asset id=path/to/image.png (repeatable), --words words.json, --beats beats.json
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const many = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const specPath = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true);
if (!specPath) {
  console.error("usage: node scripts/render.mjs spec.json [--format 9:16] [--out out.mp4] [--sheet sheet.jpg]");
  process.exit(1);
}
if (!existsSync(join(dist, "lab.html"))) {
  console.error("Build first: npm run build");
  process.exit(1);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const format = opt("format", spec.format || "9:16");
const fps = Number(opt("fps", spec.fps || 30));

const local = new Map();
const assets = {};
for (const a of many("asset")) {
  const [id, p] = a.split("=");
  const key = `/__local/${encodeURIComponent(id)}${extname(p)}`;
  local.set(key, resolve(p));
  assets[id] = key;
}
const words = opt("words") ? JSON.parse(readFileSync(opt("words"), "utf8")) : undefined;
const beats = opt("beats") ? JSON.parse(readFileSync(opt("beats"), "utf8")) : undefined;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".webp": "image/webp" };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = local.get(encodeURI(url)) ?? local.get(url) ?? join(dist, url === "/" ? "index.html" : url);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && console.error("[page]", m.text()));
page.on("pageerror", (e) => console.error("[page]", e.message));
await page.goto(`http://127.0.0.1:${port}/lab.html`);
await page.waitForFunction(() => !!window.lab);
const info = await page.evaluate(([s, f, a, w, b]) => window.lab.load(s, f, a, w, b), [spec, format, assets, words, beats]);
console.log(`duration ${info.duration.toFixed(2)}s, ${info.timings.length} scenes`);

const toBuf = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");

const sheet = opt("sheet");
if (sheet) {
  const cols = Number(opt("cols", format === "16:9" ? 5 : 7));
  const url = await page.evaluate(([c]) => window.lab.sheet(undefined, c, 280), [cols]);
  writeFileSync(sheet, toBuf(url));
  console.log("sheet:", sheet);
}

const frames = opt("frames");
if (frames) {
  const dir = opt("frames-dir", "frames");
  mkdirSync(dir, { recursive: true });
  for (const t of frames.split(",").map(Number)) {
    const url = await page.evaluate(([tt]) => window.lab.frame(tt, "image/png"), [t]);
    const f = join(dir, `${format.replace(":", "x")}-${t.toFixed(2)}.png`);
    writeFileSync(f, toBuf(url));
    console.log("frame:", f);
  }
}

const out = opt("out");
if (out) {
  const n = Math.round(info.duration * fps);
  const audio = opt("audio");
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", ...(audio ? ["-i", audio, "-c:a", "aac", "-b:a", "192k", "-shortest"] : []), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let f = 0; f < n; f++) {
    const url = await page.evaluate(([tt]) => window.lab.frame(tt, "image/jpeg", 0.95), [f / fps]);
    if (!ff.stdin.write(toBuf(url))) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 60 === 0) process.stdout.write(`\rframe ${f}/${n}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log(`\nvideo: ${out} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

const warn = await page.evaluate(() => window.lab.warnings());
if (warn.length) console.log("warnings:\n- " + warn.join("\n- "));
await browser.close();
server.close();
