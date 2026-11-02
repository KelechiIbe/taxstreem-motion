// A composition turns a VideoSpec into frames: scene timing, transitions between scenes,
// burned-in captions and the brand bug. render(ctx, t) draws the frame at time t, so the same
// code drives the live preview, frame review and the MP4 export.

import * as D from "./draw";
import { type Ctx, type Stage } from "./draw";
import { clamp, ease, hashString, spring } from "./lib";
import { colorwayFor, getLook, type Colorway, type Look } from "./looks";
import { TEMPLATES, type MediaFrame } from "./scenes";
import type { SceneSpec, SceneTiming, Theme, TransitionKind, VideoSpec, Word } from "./types";

/** Decoded video frames, provided by the worker or the lab page. */
export interface VideoSource {
  /** The frame showing at `at` seconds into the clip, or the nearest one decoded so far. Records misses. */
  frame(id: string, at: number): (CanvasImageSource & { width: number; height: number }) | null;
  has(id: string): boolean;
  duration(id: string): number;
  size(id: string): { width: number; height: number } | null;
}

export interface Env {
  images: Map<string, ImageBitmap>;
  video?: VideoSource;
  /** Voiceover word timings (seconds from the start of the voice file). */
  words?: Word[];
  /** Music beat times (seconds into the music file). */
  beats?: number[];
}

const TDUR: Record<TransitionKind, number> = { cut: 0, fade: 0.5, push: 0.7, "slide-up": 0.75, wipe: 0.9, zoom: 0.6 };

interface Phrase {
  start: number;
  end: number;
  words: Word[];
}

export class Composition {
  readonly timings: SceneTiming[] = [];
  readonly duration: number;
  readonly warnings = new Set<string>();
  private layers: [OffscreenCanvas, OffscreenCanvas];
  private phrases: Phrase[] = [];
  readonly look: Look;
  readonly colors: Colorway;
  readonly theme: Theme;

  constructor(public spec: VideoSpec, public stage: Stage, private env: Env) {
    this.look = getLook(spec.look);
    this.colors = colorwayFor(this.look, spec.palette);
    this.theme = spec.theme ?? this.look.defaultTheme;
    const scenes = Array.isArray(spec.scenes) ? spec.scenes : [];
    let starts: number[] = [];
    let at = 0;
    for (const sc of scenes) {
      starts.push(at);
      at += Math.max(0.4, Number(sc.duration) || 3);
    }
    let total = at;
    // optional: move each cut onto the nearest music beat
    if (spec.snapToBeats && env.beats?.length) {
      const off = spec.audio?.musicStart ?? 0;
      const beats = env.beats.map((b) => b - off).filter((b) => b > 0);
      const snapped = starts.map((s0, i) => {
        if (i === 0) return 0;
        let best = s0;
        let bd = 0.35;
        for (const b of beats) {
          const dd = Math.abs(b - s0);
          if (dd < bd) {
            bd = dd;
            best = b;
          }
        }
        return best;
      });
      // keep order and a minimum length
      for (let i = 1; i < snapped.length; i++) snapped[i] = Math.max(snapped[i], snapped[i - 1] + 0.6);
      starts = snapped;
      const last = scenes.length - 1;
      if (last >= 0) {
        const endT = starts[last] + Math.max(0.4, Number(scenes[last].duration) || 3);
        let bestEnd = endT;
        let bd = 0.35;
        for (const b of beats) if (Math.abs(b - endT) < bd && b > starts[last] + 0.6) { bd = Math.abs(b - endT); bestEnd = b; }
        total = bestEnd;
      }
    }
    scenes.forEach((sc, i) => {
      const end = i + 1 < scenes.length ? starts[i + 1] : total;
      this.timings.push({ id: sc.id || `s${i + 1}`, type: sc.type, start: starts[i], duration: end - starts[i] });
      if (!TEMPLATES[sc.type]) this.warn(`Scene "${sc.id}" uses an unknown template "${sc.type}".`);
    });
    this.duration = Math.max(0.5, total);
    this.layers = [new OffscreenCanvas(stage.W, stage.H), new OffscreenCanvas(stage.W, stage.H)];
    this.phrases = buildPhrases(env.words ?? [], spec.audio?.voiceDelay ?? 0);
  }

  warn(msg: string) {
    this.warnings.add(msg);
  }

  sceneAt(t: number): number {
    for (let i = this.timings.length - 1; i >= 0; i--) if (t >= this.timings[i].start) return i;
    return 0;
  }

  private drawScene(ctx: Ctx, i: number, local: number) {
    const sc = this.spec.scenes[i] as SceneSpec;
    const tm = this.timings[i];
    const theme = sc.theme ?? this.theme;
    const s = this.stage;
    ctx.save();
    D.background(ctx, s, theme, { t: tm.start + local, seed: hashString(sc.id || String(i)) % 7, pattern: sc.props?.pattern !== false });
    const env = this.env;
    const tpl = TEMPLATES[sc.type];
    if (tpl) {
      try {
        tpl({
          ctx,
          s,
          t: local,
          d: tm.duration,
          p: sc.props ?? {},
          pal: D.palette(theme),
          theme,
          scene: sc,
          index: i,
          image: (id) => (id ? ((env.images.get(id) as any) ?? null) : null),
          media: (id, at = 0): MediaFrame | null => {
            if (!id) return null;
            const img = env.images.get(id);
            if (img) return { source: img as any, width: img.width, height: img.height };
            if (env.video?.has(id)) {
              const f = env.video.frame(id, Math.max(0, at));
              const sz = env.video.size(id);
              if (f) return { source: f, width: sz?.width ?? f.width, height: sz?.height ?? f.height };
            }
            return null;
          },
          mediaInfo: (id) => {
            if (!id) return null;
            const img = env.images.get(id);
            if (img) return { width: img.width, height: img.height, duration: 0, video: false };
            if (env.video?.has(id)) {
              const sz = env.video.size(id);
              return { width: sz?.width ?? 1920, height: sz?.height ?? 1080, duration: env.video.duration(id), video: true };
            }
            return null;
          },
          warn: (m) => this.warn(m),
        });
      } catch (e) {
        this.warn(`Scene "${sc.id}" failed to draw: ${(e as Error).message}`);
      }
    }
    ctx.restore();
  }

  render(ctx: Ctx, t: number) {
    const { W, H } = this.stage;
    D.setLook(this.look, this.colors);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    if (!this.timings.length) {
      D.background(ctx, this.stage, this.theme, { t });
      ctx.restore();
      return;
    }
    t = clamp(t, 0, this.duration - 1e-4);
    const i = this.sceneAt(t);
    const tm = this.timings[i];
    const local = t - tm.start;
    const kind: TransitionKind = (this.spec.scenes[i].transition as TransitionKind) ?? (i === 0 ? "cut" : this.look.motion.transition);
    const td = Math.min(TDUR[kind] ?? 0.5, tm.duration * 0.5, this.timings[i - 1]?.duration ?? 0);
    if (i > 0 && td > 0 && local < td) {
      const prev = this.timings[i - 1];
      const a = this.layers[0].getContext("2d")!;
      const b = this.layers[1].getContext("2d")!;
      a.setTransform(1, 0, 0, 1, 0, 0);
      b.setTransform(1, 0, 0, 1, 0, 0);
      this.drawScene(a, i - 1, t - prev.start);
      this.drawScene(b, i, local);
      this.transition(ctx, kind, local / td, this.layers[0], this.layers[1]);
    } else {
      this.drawScene(ctx, i, local);
    }
    this.overlays(ctx, t, i);
    ctx.restore();
    void W;
    void H;
  }

  private transition(ctx: Ctx, kind: TransitionKind, p: number, A: OffscreenCanvas, B: OffscreenCanvas) {
    const { W, H, u, portrait } = this.stage;
    const vertical = portrait;
    switch (kind) {
      case "push": {
        const k = ease.inOutQuart(p);
        const dx = vertical ? 0 : W;
        const dy = vertical ? H : 0;
        ctx.drawImage(A, -dx * k, -dy * k);
        ctx.drawImage(B, dx * (1 - k), dy * (1 - k));
        break;
      }
      case "slide-up": {
        const k = spring(p * 0.75, 0.62);
        const s = 1 - 0.06 * k;
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(s, s);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(A, 0, 0);
        ctx.restore();
        ctx.fillStyle = `rgba(10,10,10,${0.45 * k})`;
        ctx.fillRect(0, 0, W, H);
        const y = H * (1 - k);
        ctx.save();
        ctx.shadowColor = "rgba(10,36,68,0.35)";
        ctx.shadowBlur = 60 * u;
        ctx.shadowOffsetY = -10 * u;
        D.rrect(ctx, 0, y, W, H + 60 * u, 48 * u * (1 - k));
        ctx.fillStyle = "#000";
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.clip();
        ctx.drawImage(B, 0, y);
        ctx.restore();
        break;
      }
      case "wipe": {
        // a brand-blue panel sweeps across, carrying the mark, and reveals the next scene
        ctx.drawImage(p < 0.5 ? A : B, 0, 0);
        const k1 = ease.inOutQuart(clamp(p / 0.5));
        const k2 = ease.inOutQuart(clamp((p - 0.5) / 0.5));
        ctx.save();
        const g = vertical ? ctx.createLinearGradient(0, H, 0, 0) : ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, D.brandColors() ? D.BRAND.primary : this.colors.primary);
        g.addColorStop(1, D.brandColors() ? D.BRAND.lightBlue : this.colors.secondary);
        ctx.fillStyle = g;
        if (vertical) {
          // bottom to top: the panel rises over A, then its tail lifts off B
          if (p < 0.5) ctx.fillRect(0, H * (1 - k1), W, H * k1);
          else ctx.fillRect(0, 0, W, H * (1 - k2));
        } else {
          // left to right
          if (p < 0.5) ctx.fillRect(0, 0, W * k1, H);
          else ctx.fillRect(W * k2, 0, W * (1 - k2), H);
        }
        const mid = 1 - Math.abs(p - 0.5) * 2;
        if (mid > 0.2 && D.brandColors()) {
          const mh = 150 * u;
          D.mark(ctx, W / 2 - D.markWidth(mh) / 2, H / 2 - mh / 2, mh, "#FFFFFF", clamp((mid - 0.2) / 0.5), 0.6 + 0.4 * mid);
        }
        ctx.restore();
        break;
      }
      case "zoom": {
        const k = ease.inOutCubic(p);
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.translate(W / 2, H / 2);
        ctx.scale(1 + 0.12 * k, 1 + 0.12 * k);
        ctx.drawImage(A, -W / 2, -H / 2);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = k;
        ctx.translate(W / 2, H / 2);
        ctx.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k);
        ctx.drawImage(B, -W / 2, -H / 2);
        ctx.restore();
        break;
      }
      case "fade":
      default: {
        ctx.drawImage(A, 0, 0);
        ctx.globalAlpha = ease.inOutCubic(p);
        ctx.drawImage(B, 0, 0);
        ctx.globalAlpha = 1;
      }
    }
  }

  private overlays(ctx: Ctx, t: number, i: number) {
    const s = this.stage;
    const u = s.u;
    const theme = this.spec.scenes[i]?.theme ?? this.theme;
    if (this.spec.brandBug) {
      const h = 46 * u;
      D.mark(ctx, s.safe.x, (s.portrait ? 120 : 56) * u, h, theme === "light" && D.palette(theme).logo === "dark" ? D.BRAND.primary : "#FFFFFF", 0.9);
    }
    if (this.spec.captions?.enabled && this.phrases.length) {
      const ph = this.phrases.find((q) => t >= q.start - 0.05 && t <= q.end + 0.3);
      if (ph) this.caption(ctx, ph, t);
    }
  }

  private get karaoke() {
    if (D.brandColors()) return D.BRAND.lightBlue;
    const d = D.palette("dark");
    return D.solid(d.accent);
  }

  private caption(ctx: Ctx, ph: Phrase, t: number) {
    const s = this.stage;
    const u = s.u;
    const size = (s.portrait ? 52 : s.landscape ? 46 : 44) * u;
    const maxW = s.portrait ? s.W - 2 * 110 * u : s.landscape ? s.W * 0.62 : s.W - 2 * 120 * u;
    const textStr = ph.words.map((w) => w.text).join(" ");
    const cy = s.portrait ? s.H * 0.715 : s.landscape ? s.H - 150 * u : s.H - 170 * u;
    const l = D.layoutText(ctx, textStr, s.W / 2, 0, { maxWidth: maxW, size, weight: 600, tracking: -0.01, maxLines: 2, lineHeight: 1.18, align: "center" });
    const padX = 34 * u;
    const padY = 22 * u;
    const boxW = l.width + padX * 2;
    const boxH = l.height + padY * 2;
    const x = s.W / 2 - boxW / 2;
    const y = cy - boxH / 2;
    const appear = ease.outCubic((t - ph.start + 0.05) / 0.18) * (1 - ease.inCubic((t - ph.end - 0.1) / 0.2));
    if (appear <= 0) return;
    const laid = D.layoutText(ctx, textStr, s.W / 2, y + padY, { maxWidth: maxW, size: l.size, minSize: l.size, weight: 600, tracking: -0.01, maxLines: 99, lineHeight: 1.18, align: "center" });
    ctx.save();
    ctx.globalAlpha = appear;
    const bold = this.spec.captions?.style === "bold";
    if (!bold) {
      D.rrect(ctx, x, y, boxW, boxH, 22 * u);
      ctx.fillStyle = "rgba(10,10,10,0.82)";
      ctx.fill();
    }
    laid.words.forEach((lw, k) => {
      const w = ph.words[k];
      const spoken = w && t >= w.start;
      if (bold) {
        ctx.save();
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(10,10,10,0.9)";
        ctx.lineWidth = 10 * u;
        D.fontFor(ctx, laid, lw);
        ctx.strokeText(lw.text, lw.x, lw.y);
        ctx.restore();
      }
      D.drawWord(ctx, laid, lw, spoken ? (bold ? "#FFFFFF" : "#FFFFFF") : "rgba(255,255,255,0.5)");
      if (spoken && w && t < w.end + 0.05) D.drawWord(ctx, laid, lw, this.karaoke);
    });
    ctx.restore();
  }
}

/** Groups voiceover words into short caption phrases: a pause, a full stop or 6 words ends one. */
export function buildPhrases(words: Word[], delay: number): Phrase[] {
  const out: Phrase[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  words.forEach((w0, i) => {
    const w = { text: w0.text, start: w0.start + delay, end: w0.end + delay };
    const prev = words[i - 1];
    if (cur.length && (cur.length >= 6 || (prev && w0.start - prev.end > 0.35))) flush();
    cur.push(w);
    if (/[.!?;:]$/.test(w.text) || (/,$/.test(w.text) && cur.length >= 3)) flush();
  });
  flush();
  return out;
}

export function sizeFor(spec: VideoSpec, format = spec.format) {
  return D.SIZES[format] ?? D.SIZES["9:16"];
}

/**
 * Review times for a composition: a storyboard frame early, mid and late in every scene, plus
 * frames just before, during and after each transition (where broken transitions hide).
 */
export function reviewTimes(comp: Composition): { t: number; label: string }[] {
  const out: { t: number; label: string }[] = [];
  comp.timings.forEach((tm, i) => {
    const d = tm.duration;
    for (const [f, tag] of [[0.35, "early"], [0.62, "mid"], [0.93, "settled"]] as [number, string][]) {
      out.push({ t: tm.start + d * f, label: `${tm.id} ${tag}` });
    }
    if (i > 0) out.push({ t: tm.start + 0.25, label: `→${tm.id} transition` });
  });
  return out.sort((a, b) => a.t - b.t);
}

/** Something that can decode missing video frames between render passes. */
export interface FrameFiller {
  hasMisses(): boolean;
  fill(): Promise<void>;
}

/** Renders a frame, decoding any video frames it needed and drawing again until it's complete. */
export async function renderSettled(comp: Composition, ctx: Ctx, t: number, video?: FrameFiller) {
  comp.render(ctx, t);
  for (let k = 0; k < 3 && video?.hasMisses(); k++) {
    await video.fill();
    comp.render(ctx, t);
  }
}

/** Tiles frames into one labelled contact sheet image for visual review. */
export async function contactSheet(comp: Composition, times: { t: number; label: string }[], cols = 6, thumbW = 300, video?: FrameFiller): Promise<OffscreenCanvas> {
  const { W, H } = comp.stage;
  const tw = thumbW;
  const th = Math.round((tw * H) / W);
  const labelH = 26;
  const rows = Math.ceil(times.length / cols);
  const sheet = new OffscreenCanvas(cols * (tw + 8) + 8, rows * (th + labelH + 8) + 8);
  const g = sheet.getContext("2d")!;
  g.fillStyle = "#1b1d22";
  g.fillRect(0, 0, sheet.width, sheet.height);
  const frame = new OffscreenCanvas(W, H);
  const fc = frame.getContext("2d")!;
  for (let k = 0; k < times.length; k++) {
    const x = times[k];
    await renderSettled(comp, fc, x.t, video);
    const cx = 8 + (k % cols) * (tw + 8);
    const cy = 8 + Math.floor(k / cols) * (th + labelH + 8);
    g.drawImage(frame, cx, cy, tw, th);
    g.fillStyle = "#e8eaee";
    g.font = "600 13px Inter, Arial, sans-serif";
    (g as any).letterSpacing = "0px";
    g.fillText(`${x.t.toFixed(2)}s  ${x.label}`.slice(0, 44), cx + 2, cy + th + 18);
  }
  return sheet;
}
