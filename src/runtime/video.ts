// Video clips for scenes: decodes frames with Mediabunny (WebCodecs) and hands them to the
// composition synchronously. Rendering stays a pure function of t: a frame asks for "clip X at
// 2.4s"; if that frame isn't decoded yet the request is recorded, the caller awaits fill(), and
// renders the frame again. Sequential access (playback, export) reuses one decoder per clip.

import { ALL_FORMATS, BlobSource, CanvasSink, Input, type WrappedCanvas } from "mediabunny";
import type { VideoSource } from "./composition";

type Frame = WrappedCanvas;

interface Clip {
  input: Input;
  sink: CanvasSink;
  duration: number;
  width: number;
  height: number;
  cache: Frame[];
  it: AsyncGenerator<Frame, void, unknown> | null;
  cur: Frame | null;
  queue: Promise<unknown>;
}

const KEEP = 10;
const MAX_SIDE = 1920;

export interface ClipInfo {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** Reads the basics of a video file (duration, size, whether it has sound and can be decoded here). */
export async function probeVideo(blob: Blob): Promise<ClipInfo & { decodable: boolean; codec: string | null }> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("This file has no video track.");
    const audio = await input.getPrimaryAudioTrack();
    return {
      duration: await input.computeDuration(),
      width: track.displayWidth,
      height: track.displayHeight,
      hasAudio: !!audio,
      decodable: await track.canDecode(),
      codec: track.codec,
    };
  } finally {
    input.dispose();
  }
}

export class VideoProvider implements VideoSource {
  private clips = new Map<string, Clip>();
  private misses = new Map<string, Set<number>>();

  async add(id: string, blob: Blob): Promise<ClipInfo> {
    this.remove(id);
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(`Video "${id}" has no video track.`);
    if (!(await track.canDecode())) throw new Error(`Video "${id}" uses a codec this browser can't decode (${track.codec ?? "unknown"}). Export it as H.264 MP4 or VP9 WebM.`);
    const w = track.displayWidth;
    const h = track.displayHeight;
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const width = Math.max(2, Math.round(w * k));
    const height = Math.max(2, Math.round(h * k));
    const sink = new CanvasSink(track, k < 1 ? { width, height, fit: "fill" } : {});
    const duration = await input.computeDuration();
    const audio = await input.getPrimaryAudioTrack();
    this.clips.set(id, { input, sink, duration, width, height, cache: [], it: null, cur: null, queue: Promise.resolve() });
    return { duration, width, height, hasAudio: !!audio };
  }

  remove(id: string) {
    const c = this.clips.get(id);
    if (!c) return;
    void c.it?.return();
    c.input.dispose();
    this.clips.delete(id);
  }

  has(id: string) {
    return this.clips.has(id);
  }
  duration(id: string) {
    return this.clips.get(id)?.duration ?? 0;
  }
  size(id: string) {
    const c = this.clips.get(id);
    return c ? { width: c.width, height: c.height } : null;
  }

  frame(id: string, at: number) {
    const c = this.clips.get(id);
    if (!c) return null;
    const t = Math.min(Math.max(0, at), Math.max(0, c.duration - 1e-3));
    let best: Frame | null = null;
    let bd = Infinity;
    for (const f of c.cache) {
      if (t >= f.timestamp - 1e-4 && t < f.timestamp + Math.max(f.duration, 1e-3)) return f.canvas as any;
      const d = Math.abs(f.timestamp - t);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    let set = this.misses.get(id);
    if (!set) this.misses.set(id, (set = new Set()));
    set.add(Math.round(t * 1000) / 1000);
    return (best?.canvas as any) ?? null;
  }

  hasMisses() {
    return this.misses.size > 0;
  }

  /** Decodes every frame asked for since the last fill. */
  async fill() {
    const jobs: Promise<unknown>[] = [];
    for (const [id, times] of this.misses) {
      const c = this.clips.get(id);
      if (!c) continue;
      const sorted = [...times].sort((a, b) => a - b);
      for (const t of sorted) jobs.push(this.get(c, t));
    }
    this.misses.clear();
    await Promise.all(jobs);
  }

  private get(c: Clip, t: number): Promise<Frame | null> {
    const run = async () => {
      const covers = (f: Frame | null) => !!f && t >= f.timestamp - 1e-4 && t < f.timestamp + Math.max(f.duration, 1e-3);
      if (covers(c.cur)) return c.cur;
      const hit = c.cache.find(covers);
      if (hit) return hit;
      // restart the decoder when seeking back or jumping far ahead
      if (!c.it || !c.cur || t < c.cur.timestamp || t > c.cur.timestamp + 2.5) {
        await c.it?.return();
        c.it = c.sink.canvases(t);
        c.cur = null;
      }
      while (true) {
        const r = await c.it.next();
        if (r.done) {
          c.it = null;
          return c.cur;
        }
        c.cur = r.value;
        if (t < r.value.timestamp + Math.max(r.value.duration, 1e-3)) {
          c.cache.push(r.value);
          if (c.cache.length > KEEP) c.cache.shift();
          return r.value;
        }
      }
    };
    const p = c.queue.then(run, run);
    c.queue = p.catch(() => null);
    return p;
  }

  dispose() {
    for (const id of [...this.clips.keys()]) this.remove(id);
  }
}
