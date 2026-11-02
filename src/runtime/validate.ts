// Checks and tidies a VideoSpec from the model before it is saved. Returns the cleaned spec and
// a list of problems; serious problems go back to Claude for a repair round.

import { CATALOG, ICON_NAMES, TRANSITIONS } from "./catalog";
import { LOOK_BY_ID } from "./looks";
import type { Format, PaletteSpec, SceneSpec, Theme, VideoSpec } from "./types";

const FORMATS: Format[] = ["9:16", "1:1", "16:9"];
const THEMES: Theme[] = ["light", "dark", "blue"];
const TEMPLATE_NAMES = new Set(CATALOG.map((c) => c.name));
const UI_KINDS = ["button", "prompt", "notifications", "picker", "toggles", "payment", "chat"];
const HEX = /^#?[0-9a-f]{6}$/i;
const icon = (v: unknown, fallback = "circle-check") => (ICON_NAMES.includes(String(v)) ? String(v) : fallback);

export interface Checked {
  spec: VideoSpec;
  errors: string[];
  notes: string[];
}

export function checkSpec(input: unknown, ctx: { imageIds: Set<string>; audioIds: Set<string>; videoIds?: Set<string>; format: Format }): Checked {
  const visual = new Set([...ctx.imageIds, ...(ctx.videoIds ?? [])]);
  const checkMedia = (id: string, v: unknown, what: string, required = true) => {
    if (v === undefined || v === null || v === "") {
      if (required) errors.push(`Scene "${id}" needs ${what} set to an uploaded image or video id.`);
      return;
    }
    if (visual.size && !visual.has(String(v))) errors.push(`Scene "${id}" points at "${v}" for ${what}, which isn't uploaded. Uploaded media: ${[...visual].join(", ") || "none"}.`);
    else if (!visual.size) errors.push(`Scene "${id}" needs media for ${what}, but nothing is uploaded yet. Use a template without media, or ask the user to upload or pick stock.`);
  };
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
    // no transition means the look's default (cut for punchy looks, fade or push for calm ones)
    const transition = (TRANSITIONS as readonly string[]).includes(String(s.transition)) ? s.transition : i === 0 ? "cut" : undefined;
    const theme = THEMES.includes(s.theme as Theme) ? s.theme : undefined;
    const props = s.props && typeof s.props === "object" ? { ...s.props } : {};
    if (type === "screenshot") checkMedia(id, props.video ?? props.image, "props.image (or props.video)");
    if (type === "media" || type === "split") checkMedia(id, props.media ?? props.video ?? props.image, "props.media");
    if (type === "kinetic" && props.media) checkMedia(id, props.media, "props.media");
    if (type === "collage") {
      const items = Array.isArray(props.items) ? props.items.slice(0, 5) : [];
      if (!items.length) errors.push(`Scene "${id}" (collage) needs props.items with 1-5 media ids.`);
      items.forEach((it: any, k: number) => checkMedia(id, it?.media ?? it?.video ?? it?.image, `items[${k}].media`));
      props.items = items;
    }
    if (type === "features" && Array.isArray(props.items)) props.items = props.items.map((it: any) => ({ ...it, icon: icon(it?.icon) }));
    if (type === "icons" && Array.isArray(props.items)) {
      props.items = props.items.slice(0, 8).map((it: any) => {
        if (it?.image) checkMedia(id, it.image, "an icon image");
        return it?.image ? it : { ...it, icon: icon(it?.icon, "sparkles") };
      });
    }
    if (type === "kinetic" && !(Array.isArray(props.lines) ? props.lines.length : String(props.text ?? "").trim())) errors.push(`Scene "${id}" (kinetic) needs props.lines.`);
    if (type === "ui") {
      if (!UI_KINDS.includes(String(props.kind))) errors.push(`Scene "${id}" (ui) needs props.kind: one of ${UI_KINDS.join(", ")}.`);
      for (const key of ["items", "rows"]) {
        if (Array.isArray(props[key])) props[key] = props[key].map((it: any) => (it && typeof it === "object" && it.icon && it.icon !== "taxstreem" ? { ...it, icon: icon(it.icon, "sparkles") } : it));
      }
      if (props.icon) props.icon = icon(props.icon, "sparkles");
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
  let look: string | undefined;
  if (raw.look !== undefined) {
    if (LOOK_BY_ID.has(String(raw.look))) look = String(raw.look);
    else notes.push(`Unknown look "${raw.look}"; using TaxStreem Calm. Looks: ${[...LOOK_BY_ID.keys()].join(", ")}.`);
  }
  let palette: PaletteSpec | undefined;
  if (raw.palette === "look" || raw.palette === "brand") palette = raw.palette;
  else if (raw.palette && typeof raw.palette === "object") {
    const pal: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.palette)) if (["primary", "secondary", "tertiary", "ink", "paper"].includes(k) && HEX.test(String(v))) pal[k] = String(v).startsWith("#") ? String(v) : `#${v}`;
    if (Object.keys(pal).length) palette = pal;
    else notes.push("Ignored a custom palette with no valid hex colours.");
  }
  const spec: VideoSpec = {
    version: 1,
    title: String(raw.title || "Untitled video").slice(0, 120),
    format: FORMATS.includes(raw.format as Format) ? (raw.format as Format) : ctx.format,
    fps: 30,
    ...(look ? { look } : {}),
    ...(palette && palette !== "brand" ? { palette } : {}),
    ...(THEMES.includes(raw.theme as Theme) ? { theme: raw.theme as Theme } : {}),
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
  return { version: 1, title: "Untitled video", format, fps: 30, scenes: [] };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
