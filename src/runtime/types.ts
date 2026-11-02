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

export interface VideoSpec {
  version: 1;
  title: string;
  /** Format the team is designing for; the same spec renders in all three. */
  format: Format;
  fps?: number;
  theme: Theme;
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
  kind: "image" | "audio" | "voice";
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
