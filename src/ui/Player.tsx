import { useEffect, useRef, useState } from "react";
import type { Playback } from "../lib/audio";
import type { Renderer } from "../lib/renderer";
import type { Format, SceneTiming } from "../runtime/types";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}.${Math.floor((t % 1) * 10)}`;

export function Player({ renderer, duration, timings, format, playback, busy, tRef }: { renderer: Renderer; duration: number; timings: SceneTiming[]; format: Format; playback: Playback; busy?: string | null; tRef: React.MutableRefObject<number> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const attached = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [muted, setMuted] = useState(false);
  const clock = useRef({ t0: 0, start: 0 });

  useEffect(() => {
    if (canvas.current && !attached.current) {
      attached.current = true;
      renderer.attach(canvas.current);
    }
  }, [renderer]);

  useEffect(() => {
    if (tRef.current > duration) {
      tRef.current = 0;
      setT(0);
    }
  }, [duration, tRef]);

  useEffect(() => {
    playback.muted = muted;
    if (playing) playback.start(tRef.current);
  }, [muted]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || duration <= 0) return;
    let raf = 0;
    clock.current = { t0: performance.now(), start: tRef.current >= duration - 0.05 ? 0 : tRef.current };
    playback.start(clock.current.start);
    let lastUi = 0;
    const tick = (now: number) => {
      let nt = clock.current.start + (now - clock.current.t0) / 1000;
      if (nt >= duration) {
        clock.current = { t0: now, start: 0 };
        playback.start(0);
        nt = 0;
      }
      tRef.current = nt;
      renderer.seek(nt);
      if (now - lastUi > 50) {
        lastUi = now;
        setT(nt);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      playback.stop();
    };
  }, [playing, duration, renderer, playback, tRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.code === "Space" && tag !== "TEXTAREA" && tag !== "INPUT" && tag !== "BUTTON") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const seek = (x: number) => {
    const nt = Math.max(0, Math.min(duration - 0.001, x));
    tRef.current = nt;
    setT(nt);
    renderer.seek(nt);
    if (playing) {
      clock.current = { t0: performance.now(), start: nt };
      playback.start(nt);
    }
  };

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * duration);
  };

  return (
    <div className="player">
      <div className={`screen f${format.replace(":", "x")}`}>
        <canvas ref={canvas} />
        {busy && <div className="screen-busy">{busy}</div>}
        {duration <= 0 && !busy && <div className="screen-empty">Your video appears here. Describe it in the chat to start.</div>}
      </div>
      <div className="transport">
        <button className="btn icon" onClick={() => setPlaying((p) => !p)} disabled={duration <= 0} title="Play / pause (space)">
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className="time">{fmt(t)} / {fmt(Math.max(0, duration))}</span>
        <div
          className="scrub"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub(e);
          }}
          onPointerMove={(e) => e.buttons && scrub(e)}
        >
          <div className="scenes">
            {timings.map((s) => (
              <div key={s.id} className="seg" style={{ left: `${(s.start / duration) * 100}%`, width: `${(s.duration / duration) * 100}%` }} title={`${s.id} · ${s.type} · ${s.duration.toFixed(1)}s`}>
                <span>{s.id}</span>
              </div>
            ))}
          </div>
          <div className="head" style={{ left: `${duration ? (t / duration) * 100 : 0}%` }} />
        </div>
        <button className="btn icon" onClick={() => setMuted((m) => !m)} title={muted ? "Unmute" : "Mute"}>
          {muted ? <MuteIcon /> : <SoundIcon />}
        </button>
      </div>
    </div>
  );
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" /></svg>
);
const SoundIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
);
const MuteIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m22 9-6 6M16 9l6 6" /></svg>
);
