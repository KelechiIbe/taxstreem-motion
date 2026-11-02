// Which video clips in a spec play their own sound, and when. Clip sound is off unless a scene
// sets `volume` (0..1); footage from stock sites usually has none worth keeping.

import type { SceneTiming, VideoSpec } from "./types";

export interface ClipSound {
  asset: string;
  /** Seconds into the video where the clip's sound starts. */
  at: number;
  /** Seconds into the clip file. */
  from: number;
  duration: number;
  speed: number;
  volume: number;
}

const MEDIA_KEYS = ["media", "video", "image"];

export function clipSounds(spec: VideoSpec, timings: SceneTiming[], isVideo: (id: string) => boolean): ClipSound[] {
  const out: ClipSound[] = [];
  spec.scenes.forEach((sc, i) => {
    const tm = timings[i];
    if (!tm) return;
    const p = sc.props ?? {};
    const push = (q: Record<string, any>, delay = 0) => {
      const vol = Math.min(1, Math.max(0, Number(q.volume) || 0));
      if (!vol) return;
      const id = MEDIA_KEYS.map((k) => q[k]).find((v) => typeof v === "string" && isVideo(v));
      if (!id) return;
      out.push({ asset: id, at: tm.start + delay, from: Math.max(0, Number(q.start) || 0), duration: Math.max(0, tm.duration - delay), speed: Number(q.speed) > 0 ? Number(q.speed) : 1, volume: vol });
    };
    push(p);
    if (Array.isArray(p.items)) p.items.forEach((it: any) => it && typeof it === "object" && push(it));
  });
  return out;
}

/** Every media asset id a spec refers to (images and clips), for loading and validation. */
export function mediaIds(spec: VideoSpec): Set<string> {
  const ids = new Set<string>();
  const add = (v: unknown) => typeof v === "string" && v && ids.add(v);
  for (const sc of spec.scenes ?? []) {
    const p = sc.props ?? {};
    MEDIA_KEYS.forEach((k) => add(p[k]));
    if (Array.isArray(p.items)) p.items.forEach((it: any) => it && typeof it === "object" && MEDIA_KEYS.forEach((k) => add(it[k])));
  }
  return ids;
}
