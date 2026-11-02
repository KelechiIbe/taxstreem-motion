// The video spec: what Claude writes and edits, and what the runtime draws.
// Content lives here as data; how it moves lives in the scene templates.

export type Format = "9:16" | "1:1" | "16:9";
export type Theme = "light" | "dark" | "blue";
export type TransitionKind = "cut" | "fade" | "push" | "slide-up" | "wipe" | "zoom";

export interface SceneSpec {
  id: string;
  /** Template name from the catalog, or "custom" for a hand-written draw function. */
  type: string;
  /** Seconds this scene owns on the timeline. */
  duration: number;
  /** How this scene arrives (the previous one leaves the same way). Defaults to "fade". */
  transition?: TransitionKind;
  /** Background for this scene; defaults to the video theme. */
  theme?: Theme;
  /** Template props. See catalog.ts for each template's fields. */
  props: Record<string, any>;
  /** Free-text note for humans (why the scene exists). Not drawn. */
  note?: string;
}

export interface AudioSpec {
  /** Asset id of a music track. */
  music?: string | null;
  musicVolume?: number;
  /** Seconds into the music file where the video starts. */
  musicStart?: number;
  /** Asset id of a voiceover (ElevenLabs or uploaded). */
  voice?: string | null;
  voiceVolume?: number;
  /** Seconds into the video when the voiceover starts. */
  voiceDelay?: number;
  /** Lower the music while the voice speaks. Default true. */
  duck?: boolean;
}

export type PaletteSpec = "brand" | "look" | { primary?: string; secondary?: string; tertiary?: string; ink?: string; paper?: string };

export interface VideoSpec {
  version: 1;
  title: string;
  /** Format the team is designing for; the same spec renders in all three. */
  format: Format;
  fps?: number;
  /** Style: fonts, backgrounds, surfaces and motion feel. See looks.ts. Defaults to "taxstreem". */
  look?: string;
  /** Colours: "brand" (TaxStreem, the default), "look" (the style's own colourway) or custom hex colours. */
  palette?: PaletteSpec;
  /** Default background for scenes. Defaults to the look's default. */
  theme?: Theme;
  scenes: SceneSpec[];
  audio?: AudioSpec;
  /** Burned-in captions from the voiceover's word timings. */
  captions?: { enabled: boolean; style?: "box" | "bold" };
  /** Small TaxStreem mark in a corner for the whole video. */
  brandBug?: boolean;
  /** Snap scene boundaries to the nearest music beat. */
  snapToBeats?: boolean;
}

export interface Word {
  text: string;
  start: number;
  end: number;
}

/** Facts about an asset the runtime and the prompt both need. */
export interface AssetInfo {
  id: string;
  kind: "image" | "audio" | "voice" | "video" | "reference";
  name: string;
  width?: number;
  height?: number;
  duration?: number;
  bpm?: number;
  beats?: number[];
  words?: Word[];
  text?: string;
}

export interface SceneTiming {
  id: string;
  type: string;
  start: number;
  duration: number;
}

/** One beat of an approved script: what is said, what is shown, and for how long. */
export interface ScriptScene {
  id: string;
  /** Voiceover line (spoken). Empty when the scene is silent or music-only. */
  vo: string;
  /** Words on screen, verbatim. */
  onScreen: string;
  /** What the viewer sees: template idea, media, camera, motion. */
  visual: string;
  seconds: number;
  /** Asset ids (or stock:/generate: requests) the scene should use. */
  media?: string[];
  /** How the scene moves: entrances, camera, what changes, the exit. The team's words win. */
  motion?: string;
  /** Areas the team marked on a picked screenshot or photo, in camera order. */
  focus?: FocusMark[];
}

/** A box the team drew on an image: where the camera should go, in 0..1 fractions of the image. */
export interface FocusMark {
  asset: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

/** The editable script a video is built from. */
export interface Script {
  title: string;
  /** The core idea in one or two sentences. */
  idea: string;
  /** Everything else the team gave: audience, purpose, key message, facts to use, things to avoid, and the gist of attached documents. */
  context?: string;
  audience?: string;
  platform?: string;
  format: Format;
  look: string;
  palette?: PaletteSpec;
  /** Target length in seconds. */
  length: number;
  /** Mood and pacing for music, if any. */
  music?: string;
  /** Direction for the voiceover read, if any. */
  voiceDirection?: string;
  scenes: ScriptScene[];
  notes?: string;
  /** Set when the team approves it for building. */
  approvedAt?: string;
}
