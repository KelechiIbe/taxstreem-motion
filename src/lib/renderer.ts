// Main-thread handle on the renderer worker.
import type { Format, SceneTiming, VideoSpec, Word } from "../runtime/types";
import RendererWorker from "../runtime/worker?worker";

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; onProgress?: (p: number) => void };

export interface Loaded {
  duration: number;
  timings: SceneTiming[];
  warnings: string[];
}

export class Renderer {
  private worker: Worker;
  private pending = new Map<string, Pending>();
  private loadWaiter: Pending | null = null;
  private ready: Promise<void>;
  private sent = new Set<string>();
  private videos = new Set<string>();
  onWarnings: (w: string[]) => void = () => {};

  constructor() {
    this.worker = new RendererWorker();
    let ok: () => void = () => {};
    this.ready = new Promise<void>((r) => (ok = r));
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "ready") return ok();
      if (m.type === "loaded") {
        this.loadWaiter?.resolve(m);
        this.loadWaiter = null;
        return;
      }
      if (m.type === "warnings") return this.onWarnings(m.warnings);
      if (m.type === "seeked") return this.seeked();
      const p = this.pending.get(m.id);
      if (!p) {
        if (m.type === "error") console.error("renderer:", m.message);
        return;
      }
      if (m.type === "progress") return p.onProgress?.(m.p);
      this.pending.delete(m.id);
      if (m.type === "error") p.reject(new Error(m.message));
      else p.resolve(m);
    };
    this.worker.postMessage({ type: "init" });
  }

  attach(canvas: HTMLCanvasElement) {
    const off = canvas.transferControlToOffscreen();
    this.worker.postMessage({ type: "canvas", canvas: off }, [off]);
  }

  hasImage(id: string) {
    return this.sent.has(id);
  }

  hasVideo(id: string) {
    return this.videos.has(id);
  }

  /** Hands a video clip to the worker, which decodes its frames on demand. */
  sendVideo(id: string, blob: Blob, t = 0): Promise<{ ok: boolean; duration?: number; width?: number; height?: number; hasAudio?: boolean; message?: string }> {
    this.videos.add(id);
    return this.call({ type: "video", assetId: id, blob, t });
  }

  sendImages(images: Record<string, ImageBitmap>, t = 0) {
    Object.keys(images).forEach((k) => this.sent.add(k));
    this.worker.postMessage({ type: "images", images, t }, Object.values(images));
  }

  async load(spec: VideoSpec, format: Format, extra: { words?: Word[]; beats?: number[]; t?: number; scale?: number } = {}): Promise<Loaded> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.loadWaiter?.reject(new Error("superseded"));
      this.loadWaiter = { resolve, reject };
      this.worker.postMessage({ type: "load", spec, format, words: extra.words, beats: extra.beats, t: extra.t ?? 0, scale: extra.scale ?? 0.5 });
    });
  }

  /**
   * Seeks coalesce: one frame is in flight at a time and only the newest request waits behind it,
   * so slow frames never build a backlog that delays loads and exports.
   */
  seek(t: number) {
    if (this.seeking) {
      this.nextSeek = t;
      return;
    }
    this.seeking = true;
    this.worker.postMessage({ type: "seek", t });
  }
  private seeking = false;
  private nextSeek: number | null = null;
  private seeked() {
    this.seeking = false;
    if (this.nextSeek !== null) {
      const t = this.nextSeek;
      this.nextSeek = null;
      this.seek(t);
    }
  }

  private call<T>(msg: Record<string, unknown>, transfer: Transferable[] = [], onProgress?: (p: number) => void): Promise<T> {
    const id = Math.random().toString(36).slice(2);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ ...msg, id }, transfer);
    });
  }

  sheet(): Promise<{ blob: Blob; times: { t: number; label: string }[]; warnings: string[] }> {
    return this.call({ type: "sheet" });
  }

  still(t?: number, scale = 0.4): Promise<{ blob: Blob }> {
    return this.call({ type: "still", t, scale });
  }

  export(format: Format, audio: { rate: number; left: Float32Array; right: Float32Array } | null, onProgress: (p: number) => void): { promise: Promise<{ buffer: ArrayBuffer; mime: string; ext: string; duration: number }>; cancel: () => void } {
    const id = Math.random().toString(36).slice(2);
    const transfer: Transferable[] = [];
    let payload: { rate: number; left: Float32Array; right: Float32Array } | null = null;
    if (audio) {
      const left = audio.left.slice();
      const right = audio.right.slice();
      payload = { rate: audio.rate, left, right };
      transfer.push(left.buffer, right.buffer);
    }
    const promise = new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.worker.postMessage({ type: "export", id, format, fps: 30, audio: payload }, transfer);
    });
    return { promise, cancel: () => this.worker.postMessage({ type: "cancel", id }) };
  }

  destroy() {
    this.worker.terminate();
  }
}
