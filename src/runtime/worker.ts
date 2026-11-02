/// <reference lib="webworker" />
// Renderer worker. Runs the motion runtime off the main thread: live preview on a transferred
// canvas, contact sheets for review, poster stills and MP4 export (WebCodecs via mediabunny).
// Scene code, including Claude's custom scenes, runs here with no access to the app's session.

import { AudioSample, AudioSampleSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, canEncodeAudio, canEncodeVideo } from "mediabunny";
import { Composition, contactSheet, reviewTimes } from "./composition";
import { makeStage } from "./draw";
import { installFonts } from "./fonts";
import type { Format, VideoSpec, Word } from "./types";

declare const self: DedicatedWorkerGlobalScope;

let preview: OffscreenCanvas | null = null;
let pctx: OffscreenCanvasRenderingContext2D | null = null;
let comp: Composition | null = null;
let current: { spec: VideoSpec; format: Format; words?: Word[]; beats?: number[] } | null = null;
const images = new Map<string, ImageBitmap>();
let fontsReady: Promise<void> = Promise.resolve();
const cancelled = new Set<string>();

const post = (msg: unknown, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

function build(scale: number): Composition | null {
  if (!current) return null;
  return new Composition(current.spec, makeStage(current.format, scale), { images, words: current.words, beats: current.beats });
}

async function blobFrom(c: OffscreenCanvas, type = "image/jpeg", quality = 0.88) {
  return c.convertToBlob({ type, quality });
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  try {
    switch (m.type) {
      case "init":
        fontsReady = installFonts(self.fonts as unknown as FontFaceSet, m.fonts);
        await fontsReady;
        post({ type: "ready" });
        break;
      case "canvas":
        preview = m.canvas as OffscreenCanvas;
        pctx = preview.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D;
        break;
      case "images":
        for (const [id, bmp] of Object.entries(m.images as Record<string, ImageBitmap>)) images.set(id, bmp);
        if (comp && preview && pctx) comp.render(pctx, m.t ?? 0);
        break;
      case "load": {
        await fontsReady;
        current = { spec: m.spec, format: m.format, words: m.words, beats: m.beats };
        comp = build(m.scale ?? 0.5);
        if (preview && comp) {
          preview.width = comp.stage.W;
          preview.height = comp.stage.H;
          comp.render(pctx!, m.t ?? 0);
        }
        post({ type: "loaded", duration: comp?.duration ?? 0, timings: comp?.timings ?? [], warnings: [...(comp?.warnings ?? [])] });
        break;
      }
      case "seek":
        if (comp && pctx) {
          const before = comp.warnings.size;
          comp.render(pctx, m.t);
          if (comp.warnings.size !== before) post({ type: "warnings", warnings: [...comp.warnings] });
        }
        break;
      case "sheet": {
        const full = build(1);
        if (!full) throw new Error("Nothing loaded");
        const times = m.times ?? reviewTimes(full);
        const sheet = contactSheet(full, times, m.cols ?? (current!.format === "16:9" ? 4 : 6), m.thumbW ?? (current!.format === "16:9" ? 420 : 260));
        post({ type: "sheet", id: m.id, blob: await blobFrom(sheet, "image/jpeg", 0.82), times, warnings: [...full.warnings] });
        break;
      }
      case "still": {
        const c = build(m.scale ?? 0.4);
        if (!c) throw new Error("Nothing loaded");
        const canvas = new OffscreenCanvas(c.stage.W, c.stage.H);
        c.render(canvas.getContext("2d")!, m.t ?? Math.min(c.duration * 0.3, 2.5));
        post({ type: "still", id: m.id, blob: await blobFrom(canvas, "image/jpeg", 0.85) });
        break;
      }
      case "export":
        await exportVideo(m);
        break;
      case "cancel":
        cancelled.add(m.id);
        break;
    }
  } catch (err) {
    post({ type: "error", id: m.id, message: (err as Error).message || String(err) });
  }
};

async function exportVideo(m: { id: string; format: Format; fps?: number; audio?: { rate: number; left: Float32Array; right: Float32Array } | null }) {
  if (!current) throw new Error("Nothing loaded");
  const saved = current.format;
  current.format = m.format;
  const c = build(1)!;
  current.format = saved;
  const { W, H } = c.stage;
  const fps = m.fps ?? 30;
  let container: "mp4" | "webm" = "mp4";
  let vcodec: "avc" | "vp9" = "avc";
  let acodec: "aac" | "opus" = "aac";
  if (!(await canEncodeVideo("avc", { width: W, height: H })) || (m.audio && !(await canEncodeAudio("aac")))) {
    container = "webm";
    vcodec = "vp9";
    acodec = "opus";
    if (!(await canEncodeVideo("vp9", { width: W, height: H }))) throw new Error("This browser can't encode video. Use Chrome or Edge on a laptop or desktop.");
  }
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const output = new Output({ format: container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: new BufferTarget() });
  // ~0.17 bits per pixel per frame: 10.6 Mbps at 1080×1920, 6 Mbps at 1080×1080. Enough for grain
  // and gradients without banding; social platforms re-encode anyway.
  const bitrate = Math.round(W * H * fps * (vcodec === "avc" ? 0.17 : 0.12));
  const video = new CanvasSource(canvas, { codec: vcodec, bitrate, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });
  let audio: AudioSampleSource | null = null;
  if (m.audio) {
    audio = new AudioSampleSource({ codec: acodec, quality: QUALITY_HIGH });
    output.addAudioTrack(audio);
  }
  await output.start();
  const total = c.duration;
  const frames = Math.round(total * fps);
  // audio goes in 2-second planar chunks, kept ahead of the video
  let audioAt = 0;
  const rate = m.audio?.rate ?? 48000;
  const feed = async (until: number) => {
    if (!audio || !m.audio) return;
    while (audioAt < Math.min(until, total) - 1e-6) {
      const next = Math.min(audioAt + 2, total);
      const a = Math.floor(audioAt * rate);
      const b = Math.floor(next * rate);
      const len = Math.max(1, b - a);
      const data = new Float32Array(len * 2);
      const L = m.audio.left;
      const R = m.audio.right;
      for (let i = 0; i < len; i++) {
        data[i] = L[a + i] ?? 0;
        data[len + i] = R[a + i] ?? 0;
      }
      const sample = new AudioSample({ data, format: "f32-planar", numberOfChannels: 2, sampleRate: rate, timestamp: audioAt });
      await audio.add(sample);
      sample.close();
      audioAt = next;
    }
  };
  try {
    for (let f = 0; f < frames; f++) {
      if (cancelled.has(m.id)) throw new Error("Export cancelled");
      const t = f / fps;
      c.render(ctx, t);
      await feed(t + 1);
      await video.add(t, 1 / fps);
      if (f % 10 === 0) post({ type: "progress", id: m.id, p: f / frames });
    }
    await feed(total);
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  } finally {
    cancelled.delete(m.id);
  }
  const buf = (output.target as BufferTarget).buffer!;
  post({ type: "exported", id: m.id, buffer: buf, mime: container === "mp4" ? "video/mp4" : "video/webm", ext: container, duration: total, warnings: [...c.warnings] }, [buf]);
}
