// Checks and tidies a VideoSpec from the model before it is saved. Returns the cleaned spec and
// a list of problems; serious problems go back to Claude for a repair round.

import { CATALOG, ICON_NAMES, TRANSITIONS } from "./catalog";
import type { Format, SceneSpec, Theme, VideoSpec } from "./types";

const FORMATS: Format[] = ["9:16", "1:1", "16:9"];
const THEMES: Theme[] = ["light", "dark", "blue"];
const TEMPLATE_NAMES = new Set(CATALOG.map((c) => c.name));

export interface Checked {
  spec: VideoSpec;
  errors: string[];
  notes: string[];
}

export function checkSpec(input: unknown, ctx: { imageIds: Set<string>; audioIds: Set<string>; format: Format }): Checked {
  const errors: string[] = [];
  const notes: string[] = [];
  const raw = (typeof input === "string" ? safeParse(input) : input) as Partial<VideoSpec> | null;
  if (!raw || typeof raw !== "object") return { spec: emptySpec(ctx.format), errors: ["The spec is not a JSON object."], notes };
  const scenesIn = Array.isArray(raw.scenes) ? raw.scenes : [];
  if (!scenesIn.length) errors.push("The spec has no scenes.");
  const seen = new Set<string>();
  const scenes: SceneSpec[] = scenesIn.map((s0, i) => {
    const s = (s0 ?? {}) as SceneSpec;
    let id = String(s.id || `s${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
    while (seen.has(id)) id += "-b";
    seen.add(id);
    const type = String(s.type || "title");
    if (!TEMPLATE_NAMES.has(type)) errors.push(`Scene "${id}" uses unknown template "${type}". Use one of: ${[...TEMPLATE_NAMES].join(", ")}.`);
    let duration = Number(s.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = 3.5;
      notes.push(`Scene "${id}" had no duration; set to 3.5s.`);
    }
    duration = Math.min(30, Math.max(0.6, Math.round(duration * 100) / 100));
    const transition = (TRANSITIONS as readonly string[]).includes(String(s.transition)) ? s.transition : i === 0 ? "cut" : "fade";
    const theme = THEMES.includes(s.theme as Theme) ? s.theme : undefined;
    const props = s.props && typeof s.props === "object" ? { ...s.props } : {};
    if (type === "screenshot") {
      if (!props.image) errors.push(`Scene "${id}" (screenshot) needs props.image set to an uploaded image id.`);
      else if (ctx.imageIds.size && !ctx.imageIds.has(String(props.image))) errors.push(`Scene "${id}" points at image "${props.image}", which isn't uploaded. Uploaded images: ${[...ctx.imageIds].join(", ") || "none"}.`);
    }
    if (type === "features" && Array.isArray(props.items)) {
      props.items = props.items.map((it: any) => ({ ...it, icon: ICON_NAMES.includes(it?.icon) ? it.icon : "circle-check" }));
    }
    if (type === "custom" && typeof props.code === "string") {
      if (/\b(fetch|XMLHttpRequest|importScripts|postMessage|indexedDB|caches)\b/.test(props.code)) errors.push(`Scene "${id}": custom code may only draw; remove network or storage calls.`);
      if (/Math\.random|Date\.now|new Date|performance\.now|setTimeout|setInterval|requestAnimationFrame/.test(props.code)) errors.push(`Scene "${id}": custom code must be a pure function of t (no Math.random, Date, timers).`);
      try {
        new Function("api", props.code);
      } catch (e) {
        errors.push(`Scene "${id}": custom code doesn't compile: ${(e as Error).message}`);
      }
    }
    return { id, type, duration, transition, ...(theme ? { theme } : {}), props, ...(s.note ? { note: String(s.note).slice(0, 200) } : {}) } as SceneSpec;
  });
  const audio = raw.audio && typeof raw.audio === "object" ? { ...raw.audio } : undefined;
  if (audio) {
    for (const k of ["music", "voice"] as const) {
      if (audio[k] && !ctx.audioIds.has(String(audio[k]))) {
        notes.push(`Removed ${k} "${audio[k]}" because no such audio is uploaded.`);
        audio[k] = null;
      }
    }
  }
  const spec: VideoSpec = {
    version: 1,
    title: String(raw.title || "Untitled video").slice(0, 120),
    format: FORMATS.includes(raw.format as Format) ? (raw.format as Format) : ctx.format,
    fps: 30,
    theme: THEMES.includes(raw.theme as Theme) ? (raw.theme as Theme) : "light",
    scenes,
    ...(audio ? { audio } : {}),
    ...(raw.captions ? { captions: { enabled: !!raw.captions.enabled, style: raw.captions.style === "bold" ? "bold" : "box" } } : {}),
    ...(raw.brandBug ? { brandBug: true } : {}),
    ...(raw.snapToBeats ? { snapToBeats: true } : {}),
  };
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  if (total > 180) errors.push(`The video is ${Math.round(total)}s long; keep it under 3 minutes.`);
  return { spec, errors, notes };
}

export function emptySpec(format: Format): VideoSpec {
  return { version: 1, title: "Untitled video", format, fps: 30, theme: "light", scenes: [] };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
