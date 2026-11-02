// Audio in the browser: decoding, beat detection for music, the voice + music mix (with ducking)
// used for both preview playback and the exported file.

export const RATE = 48000;

let ctx: AudioContext | null = null;
export function audioContext(): AudioContext {
  ctx ??= new AudioContext({ sampleRate: RATE });
  return ctx;
}

const decoded = new Map<string, Promise<AudioBuffer>>();
export function decodeUrl(key: string, url: string): Promise<AudioBuffer> {
  let p = decoded.get(key);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => audioContext().decodeAudioData(b));
    decoded.set(key, p);
    p.catch(() => decoded.delete(key));
  }
  return p;
}

export async function decodeFile(file: Blob): Promise<AudioBuffer> {
  return audioContext().decodeAudioData(await file.arrayBuffer());
}

/**
 * Tempo and beat grid from an onset envelope: log-energy rises every 10ms, autocorrelated over
 * 70–180 BPM (gently preferring 90–130), then the phase that best lines up with the onsets.
 */
export function detectBeats(buf: AudioBuffer): { bpm: number; beats: number[] } {
  const sr = buf.sampleRate;
  const hop = Math.round(sr * 0.01);
  const win = hop * 2;
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  const n = Math.floor((ch0.length - win) / hop);
  if (n < 200) return { bpm: 0, beats: [] };
  const energy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * hop;
    for (let k = 0; k < win; k += 2) {
      const v = (ch0[o + k] + ch1[o + k]) * 0.5;
      s += v * v;
    }
    energy[i] = Math.log(1e-6 + s / (win / 2));
  }
  const onset = new Float32Array(n);
  for (let i = 1; i < n; i++) onset[i] = Math.max(0, energy[i] - energy[i - 1]);
  // remove slow trend
  const mean = onset.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) onset[i] = Math.max(0, onset[i] - mean);
  const fps = sr / hop;
  let best = 0;
  let bestLag = 0;
  const minLag = Math.round((60 / 180) * fps);
  const maxLag = Math.round((60 / 70) * fps);
  const span = Math.min(n, Math.round(fps * 60));
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < span; i++) s += onset[i] * onset[i + lag];
    const bpm = (60 * fps) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 115) / 0.9, 2));
    s *= w;
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  if (!bestLag) return { bpm: 0, beats: [] };
  let bestPhase = 0;
  let bestScore = -1;
  for (let ph = 0; ph < bestLag; ph++) {
    let s = 0;
    for (let i = ph; i < span; i += bestLag) s += onset[i] + 0.5 * (onset[i - 1] ?? 0) + 0.5 * (onset[i + 1] ?? 0);
    if (s > bestScore) {
      bestScore = s;
      bestPhase = ph;
    }
  }
  const beats: number[] = [];
  for (let i = bestPhase; i < n; i += bestLag) beats.push(Math.round((i / fps) * 1000) / 1000);
  return { bpm: Math.round(((60 * fps) / bestLag) * 10) / 10, beats: beats.slice(0, 600) };
}

export interface MixInput {
  duration: number;
  music?: AudioBuffer | null;
  musicVolume?: number;
  musicStart?: number;
  voice?: AudioBuffer | null;
  voiceVolume?: number;
  voiceDelay?: number;
  duck?: boolean;
  /** Sound from video clips used in scenes. */
  clips?: { buffer: AudioBuffer | null; at: number; from: number; duration: number; speed: number; volume: number }[];
}

/** Renders the voice and music into one stereo track of exactly `duration` seconds. */
export async function mix(o: MixInput): Promise<AudioBuffer | null> {
  const clips = (o.clips ?? []).filter((c) => c.buffer && c.volume > 0);
  if (!o.music && !o.voice && !clips.length) return null;
  const len = Math.max(1, Math.ceil(o.duration * RATE));
  const off = new OfflineAudioContext(2, len, RATE);
  const end = o.duration;
  if (o.music) {
    const src = off.createBufferSource();
    src.buffer = o.music;
    const g = off.createGain();
    const vol = o.musicVolume ?? (o.voice ? 0.3 : 0.9);
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(vol, 0.25);
    // duck under the voice
    if (o.voice && o.duck !== false) {
      const spans = voiceSpans(o.voice, o.voiceDelay ?? 0);
      for (const [a, b] of spans) {
        if (a > end) break;
        g.gain.setValueAtTime(vol, Math.max(0.26, a - 0.2));
        g.gain.linearRampToValueAtTime(vol * 0.5, Math.max(0.27, a));
        g.gain.setValueAtTime(vol * 0.5, Math.max(0.28, b));
        g.gain.linearRampToValueAtTime(vol, Math.max(0.29, b + 0.35));
      }
    }
    g.gain.setValueAtTime(g.gain.value, Math.max(0.3, end - 1.6));
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(g).connect(off.destination);
    src.start(0, Math.max(0, o.musicStart ?? 0));
  }
  if (o.voice) {
    const src = off.createBufferSource();
    src.buffer = o.voice;
    const g = off.createGain();
    g.gain.value = o.voiceVolume ?? 1;
    src.connect(g).connect(off.destination);
    src.start(Math.max(0, o.voiceDelay ?? 0));
  }
  // sound from video clips placed in scenes, faded at the cuts
  for (const c of clips) {
    const src = off.createBufferSource();
    src.buffer = c.buffer;
    src.playbackRate.value = c.speed || 1;
    const g = off.createGain();
    const a = Math.max(0, c.at);
    const b = Math.min(end, c.at + c.duration);
    if (b <= a) continue;
    g.gain.setValueAtTime(0, a);
    g.gain.linearRampToValueAtTime(c.volume, a + 0.12);
    g.gain.setValueAtTime(c.volume, Math.max(a + 0.13, b - 0.15));
    g.gain.linearRampToValueAtTime(0, b);
    src.connect(g).connect(off.destination);
    src.start(a, Math.max(0, c.from), (b - a) * (c.speed || 1));
  }
  return off.startRendering();
}

/** Stretches of speech (start, end) in seconds, from a 50ms RMS gate. */
function voiceSpans(buf: AudioBuffer, delay: number): [number, number][] {
  const sr = buf.sampleRate;
  const step = Math.round(sr * 0.05);
  const d = buf.getChannelData(0);
  const out: [number, number][] = [];
  let start = -1;
  let quiet = 0;
  for (let i = 0; i < d.length; i += step) {
    let s = 0;
    for (let k = i; k < Math.min(d.length, i + step); k++) s += d[k] * d[k];
    const loud = Math.sqrt(s / step) > 0.02;
    const t = i / sr + delay;
    if (loud) {
      if (start < 0) start = t;
      quiet = 0;
    } else if (start >= 0 && ++quiet > 8) {
      out.push([start, t]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, d.length / sr + delay]);
  return out;
}

/** Plays a mixed track in sync with the preview clock. */
export class Playback {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  buffer: AudioBuffer | null = null;
  muted = false;

  start(at: number) {
    this.stop();
    if (!this.buffer || this.muted) return;
    const ac = audioContext();
    if (ac.state === "suspended") ac.resume();
    this.src = ac.createBufferSource();
    this.src.buffer = this.buffer;
    this.gain = ac.createGain();
    this.src.connect(this.gain).connect(ac.destination);
    this.src.start(0, Math.max(0, at));
  }

  stop() {
    try {
      this.src?.stop();
    } catch {
      /* already stopped */
    }
    this.src?.disconnect();
    this.src = null;
  }
}
