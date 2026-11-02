// Lab page: runs the motion runtime on the main thread so scripts (Playwright) can seek frames
// and capture them. Used by `npm run render` and for checking templates without the app.
import { Composition, contactSheet, renderSettled, reviewTimes } from "./runtime/composition";
import { makeStage } from "./runtime/draw";
import { ensureFonts, familiesFor } from "./runtime/fonts";
import { getLook } from "./runtime/looks";
import type { Format, VideoSpec, Word } from "./runtime/types";
import { VideoProvider } from "./runtime/video";

declare global {
  interface Window {
    __SPEC__?: VideoSpec;
    __ASSETS__?: Record<string, string>;
    __WORDS__?: Word[];
    __BEATS__?: number[];
    lab: {
      load(spec: VideoSpec, format: Format, assets?: Record<string, string>, words?: Word[], beats?: number[]): Promise<{ duration: number; timings: unknown; warnings: string[] }>;
      seek(t: number): void;
      frame(t: number, type?: string, quality?: number): Promise<string>;
      warnings(): string[];
      sheet(times?: { t: number; label: string }[], cols?: number, thumbW?: number): Promise<string>;
    };
  }
}

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { alpha: false })!;
let comp: Composition | null = null;
const videos = new VideoProvider();
const loadedVideos = new Map<string, string>();

window.lab = {
  async load(spec, format, assets = {}, words, beats) {
    await ensureFonts(document.fonts, familiesFor([getLook(spec.look)]));
    const images = new Map<string, ImageBitmap>();
    await Promise.all(
      Object.entries(assets).map(async ([id, url]) => {
        const blob = await (await fetch(url)).blob();
        if (/^video\//.test(blob.type) || /\.(mp4|webm|mov|m4v|mkv)$/i.test(url)) {
          if (loadedVideos.get(id) !== url) {
            await videos.add(id, blob);
            loadedVideos.set(id, url);
          }
        } else images.set(id, await createImageBitmap(blob));
      }),
    );
    const stage = makeStage(format);
    canvas.width = stage.W;
    canvas.height = stage.H;
    comp = new Composition(spec, stage, { images, video: videos, words, beats });
    await renderSettled(comp, ctx, 0, videos);
    return { duration: comp.duration, timings: comp.timings, warnings: [...comp.warnings] };
  },
  seek(t) {
    comp?.render(ctx, t);
  },
  async frame(t, type = "image/png", quality = 0.92) {
    if (comp) await renderSettled(comp, ctx, t, videos);
    return canvas.toDataURL(type, quality);
  },
  warnings() {
    return comp ? [...comp.warnings] : [];
  },
  async sheet(times, cols = 6, thumbW = 300) {
    if (!comp) return "";
    const c = await contactSheet(comp, times ?? reviewTimes(comp), cols, thumbW, videos);
    const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    return await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.readAsDataURL(blob);
    });
  },
};
