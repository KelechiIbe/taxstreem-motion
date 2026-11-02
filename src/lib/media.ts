// Video clips and sample references in the browser: probe, shrink big files before upload,
// make poster frames, and read a sample video's shots, tempo and colours for Claude.
import { ALL_FORMATS, BlobSource, BufferTarget, CanvasSink, Conversion, Input, Mp4OutputFormat, Output, WebMOutputFormat, canEncodeVideo } from "mediabunny";
import { decodeFile, detectBeats } from "./audio";
import type { AssetRow } from "./assets";
import { check, fileUrl, sb, upload } from "./supabase";

const uid = () => crypto.randomUUID().slice(0, 8);
const MAX_BYTES = 45 * 1024 * 1024;

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  decodable: boolean;
  codec: string | null;
}

export async function probe(blob: Blob): Promise<VideoInfo> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    if (!v) throw new Error("This file has no video in it.");
    return { duration: await input.computeDuration(), width: v.displayWidth, height: v.displayHeight, hasAudio: !!(await input.getPrimaryAudioTrack()), decodable: await v.canDecode(), codec: v.codec };
  } finally {
    input.dispose();
  }
}

/** Re-encodes big or very large-frame clips to ≤1920px H.264 (or VP9) so they upload and play smoothly. */
export async function shrink(file: Blob, info: VideoInfo, onProgress: (p: number) => void): Promise<Blob> {
  const long = Math.max(info.width, info.height);
  if (file.size <= MAX_BYTES && long <= 1920) return file;
  const k = Math.min(1, 1920 / long);
  const width = Math.round((info.width * k) / 2) * 2;
  const height = Math.round((info.height * k) / 2) * 2;
  const avc = await canEncodeVideo("avc", { width, height });
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: avc ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: new BufferTarget() });
  // ~6 Mbps keeps a minute of 1080p footage around 45 MB
  const bitrate = Math.min(6_000_000, Math.floor(((MAX_BYTES * 8) / Math.max(1, info.duration)) * 0.85));
  const conv = await Conversion.init({ input, output, video: { width, height, fit: "contain", codec: avc ? "avc" : "vp9", bitrate, forceTranscode: true }, audio: { codec: avc ? "aac" : "opus", bitrate: 128_000 } });
  if (!conv.isValid) throw new Error("This video can't be converted in the browser. Export it as an MP4 (H.264) and try again.");
  conv.onProgress = (p) => onProgress(p);
  await conv.execute();
  input.dispose();
  const buf = (output.target as BufferTarget).buffer!;
  return new Blob([buf], { type: avc ? "video/mp4" : "video/webm" });
}

/** A JPEG still from a clip, for thumbnails and for Claude to look at. */
export async function poster(blob: Blob, at: number, maxSide = 1280): Promise<Blob> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    if (!v) throw new Error("no video");
    const k = Math.min(1, maxSide / Math.max(v.displayWidth, v.displayHeight));
    const sink = new CanvasSink(v, { width: Math.max(2, Math.round(v.displayWidth * k)) });
    const f = await sink.getCanvas(Math.max(0, at));
    if (!f) throw new Error("no frame");
    return toJpeg(f.canvas as any, 0.85);
  } finally {
    input.dispose();
  }
}

async function toJpeg(c: HTMLCanvasElement | OffscreenCanvas, q: number): Promise<Blob> {
  if ("convertToBlob" in c) return c.convertToBlob({ type: "image/jpeg", quality: q });
  return new Promise((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error("no jpeg"))), "image/jpeg", q));
}

/** Uploads a clip (footage, screen recording, stock) as a video asset. */
export async function uploadVideo(projectId: string, file: File, status: (s: string) => void): Promise<AssetRow> {
  status(`Checking ${file.name}`);
  const info = await probe(file);
  if (!info.decodable) throw new Error(`${file.name} uses a codec this browser can't play (${info.codec ?? "unknown"}). Export it as an MP4 (H.264).`);
  const body = await shrink(file, info, (p) => status(`Optimising ${file.name} · ${Math.round(p * 100)}%`));
  const after = body === file ? info : await probe(body);
  status(`Uploading ${file.name}`);
  const id = uid();
  const ext = body.type.includes("webm") ? "webm" : body.type.includes("quicktime") ? "mov" : "mp4";
  const path = `motion/${projectId}/clip-${id}.${ext}`;
  const ppath = `motion/${projectId}/clip-${id}-poster.jpg`;
  await upload(path, body, body.type || "video/mp4");
  await upload(ppath, await poster(body, Math.min(1, after.duration / 3)), "image/jpeg");
  return check(
    await sb
      .from("motion_assets")
      .insert({ project_id: projectId, kind: "video", name: file.name, path, mime: body.type || "video/mp4", meta: { width: after.width, height: after.height, duration: Math.round(after.duration * 100) / 100, hasAudio: after.hasAudio, poster: ppath } })
      .select("*")
      .single(),
  ) as AssetRow;
}

// ------------------------------------------------------------------ samples to learn from

interface Shot {
  t: number;
  canvas: HTMLCanvasElement | OffscreenCanvas;
}

/**
 * Reads a sample motion design: finds the cuts, keeps one frame per shot (plus extra frames in
 * long shots), measures its tempo and main colours, and draws a labelled frame sheet for Claude.
 */
export async function analyseSample(blob: Blob, status: (s: string) => void) {
  const info = await probe(blob);
  if (!info.decodable) throw new Error(`This sample uses a codec this browser can't read (${info.codec ?? "unknown"}).`);
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const v = (await input.getPrimaryVideoTrack())!;
  const small = new CanvasSink(v, { width: 64 });
  const step = info.duration > 60 ? 0.25 : 1 / 8;
  const times: number[] = [];
  for (let t = 0; t < info.duration - 0.02; t += step) times.push(t);
  const diffs: number[] = [];
  let prev: Uint8ClampedArray | null = null;
  const hist = new Map<string, number>();
  let i = 0;
  for await (const f of small.canvasesAtTimestamps(times)) {
    if (i % 40 === 0) status(`Reading the sample · ${Math.round((i / times.length) * 100)}%`);
    i++;
    if (!f) {
      diffs.push(0);
      continue;
    }
    const c = f.canvas as any;
    const g = c.getContext("2d");
    const data: Uint8ClampedArray = g.getImageData(0, 0, c.width, c.height).data;
    let d = 0;
    for (let k = 0; k < data.length; k += 4) {
      if (prev) d += Math.abs(data[k] - prev[k]) + Math.abs(data[k + 1] - prev[k + 1]) + Math.abs(data[k + 2] - prev[k + 2]);
      if (k % 32 === 0) {
        const key = [data[k] >> 5, data[k + 1] >> 5, data[k + 2] >> 5].join(",");
        hist.set(key, (hist.get(key) ?? 0) + 1);
      }
    }
    diffs.push(prev ? d / (data.length * 0.75) : 0);
    prev = data;
  }
  // a cut is a frame that changes far more than its neighbours
  const cuts: number[] = [];
  for (let k = 1; k < diffs.length; k++) {
    const around = diffs.slice(Math.max(1, k - 6), k + 7).filter((_, j) => j !== Math.min(6, k - 1)).sort((a, b) => a - b);
    const med = around[Math.floor(around.length / 2)] ?? 0;
    if (diffs[k] > 28 && diffs[k] > med * 3 + 6 && (!cuts.length || times[k] - cuts[cuts.length - 1] > 0.3)) cuts.push(Math.round(times[k] * 100) / 100);
  }
  const bounds = [0, ...cuts, info.duration];
  const shots = bounds.slice(1).map((b, k) => Math.round((b - bounds[k]) * 100) / 100);
  // frames for the sheet: the middle of each shot, plus one per extra 1.5s inside long shots
  const pick: number[] = [];
  bounds.slice(0, -1).forEach((a, k) => {
    const b = bounds[k + 1];
    const n = Math.max(1, Math.min(3, Math.round((b - a) / 1.5)));
    for (let j = 0; j < n; j++) pick.push(a + ((j + 0.5) * (b - a)) / n);
  });
  const chosen = pick.length > 24 ? pick.filter((_, k) => k % Math.ceil(pick.length / 24) === 0) : pick;
  status("Drawing the frame sheet");
  const big = new CanvasSink(v, { width: info.width >= info.height ? 400 : 240 });
  const frames: Shot[] = [];
  for await (const f of big.canvasesAtTimestamps(chosen)) if (f) frames.push({ t: f.timestamp, canvas: f.canvas as any });
  input.dispose();
  const sheet = drawSheet(frames, info);
  const colors = [...hist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => "#" + k.split(",").map((x) => ((Number(x) << 5) + 16).toString(16).padStart(2, "0")).join("").toUpperCase());
  let bpm: number | undefined;
  if (info.hasAudio) {
    try {
      status("Listening for the tempo");
      bpm = detectBeats(await decodeFile(blob)).bpm;
    } catch {
      /* no readable audio */
    }
  }
  return { info, cuts, shots, colors, bpm, sheet: await toJpeg(sheet, 0.82), frames: frames.length };
}

function drawSheet(frames: Shot[], info: VideoInfo): OffscreenCanvas {
  const fw = frames[0] ? frames[0].canvas.width : 240;
  const fh = frames[0] ? frames[0].canvas.height : 135;
  const cols = info.width >= info.height ? 4 : 6;
  const rows = Math.max(1, Math.ceil(frames.length / cols));
  const lab = 22;
  const c = new OffscreenCanvas(cols * (fw + 6) + 6, rows * (fh + lab + 6) + 6);
  const g = c.getContext("2d")!;
  g.fillStyle = "#1b1d22";
  g.fillRect(0, 0, c.width, c.height);
  frames.forEach((f, k) => {
    const x = 6 + (k % cols) * (fw + 6);
    const y = 6 + Math.floor(k / cols) * (fh + lab + 6);
    g.drawImage(f.canvas as any, x, y, fw, fh);
    g.fillStyle = "#e8eaee";
    g.font = "600 13px Inter, Arial, sans-serif";
    g.fillText(`${f.t.toFixed(2)}s`, x + 2, y + fh + 16);
  });
  return c;
}

/** Uploads a sample motion design to learn from: its frame sheet always, the file itself if it isn't huge. */
export async function uploadSample(projectId: string, file: File, status: (s: string) => void): Promise<AssetRow> {
  const a = await analyseSample(file, status);
  const id = uid();
  const sheetPath = `motion/${projectId}/sample-${id}-sheet.jpg`;
  status("Uploading the sample");
  await upload(sheetPath, a.sheet, "image/jpeg");
  let path = sheetPath;
  if (file.size <= MAX_BYTES) {
    path = `motion/${projectId}/sample-${id}.${(file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "mp4").toLowerCase()}`;
    await upload(path, file, file.type || "video/mp4");
  }
  return check(
    await sb
      .from("motion_assets")
      .insert({
        project_id: projectId,
        kind: "reference",
        name: file.name,
        path,
        mime: path === sheetPath ? "image/jpeg" : file.type || "video/mp4",
        meta: { width: a.info.width, height: a.info.height, duration: Math.round(a.info.duration * 100) / 100, cuts: a.cuts, shots: a.shots, colors: a.colors, bpm: a.bpm, sheet: sheetPath, frames: a.frames },
      })
      .select("*")
      .single(),
  ) as AssetRow;
}

// ------------------------------------------------------------------ previews and blobs

const blobs = new Map<string, Promise<Blob>>();
/** The file behind an asset, fetched once per session. */
export function assetBlob(a: AssetRow): Promise<Blob> {
  let p = blobs.get(a.id);
  if (!p) {
    p = fileUrl(a.path).then((u) => fetch(u).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`Couldn't load ${a.name}`)))));
    blobs.set(a.id, p);
    p.catch(() => blobs.delete(a.id));
  }
  return p;
}

/** Images made on the server (AI images) get the small preview Claude looks at. */
export async function ensurePreview(a: AssetRow): Promise<AssetRow | null> {
  if (a.kind !== "image" || a.meta?.preview || !a.project_id) return null;
  const bmp = await createImageBitmap(await assetBlob(a));
  const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const ppath = a.path.replace(/\.[a-z0-9]+$/i, "") + "-preview.jpg";
  await upload(ppath, await c.convertToBlob({ type: "image/jpeg", quality: 0.86 }), "image/jpeg");
  const meta = { ...a.meta, preview: ppath, width: a.meta?.width ?? bmp.width, height: a.meta?.height ?? bmp.height };
  bmp.close();
  return check(await sb.from("motion_assets").update({ meta }).eq("id", a.id).select("*").single()) as AssetRow;
}
