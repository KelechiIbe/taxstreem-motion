import { useEffect, useMemo, useRef, useState } from "react";
import { Playback } from "../lib/audio";
import { Renderer, type Loaded } from "../lib/renderer";
import { BLUEPRINTS, BLUEPRINT_BY_ID } from "../runtime/blueprints";
import type { Format, VideoSpec } from "../runtime/types";
import { Player } from "./Player";

/** Video templates to start from: a card per template with a poster and a playable preview. */
export function TemplateGrid(p: { value: string | null; onPick: (id: string | null) => void; onPreview: (id: string) => void; compact?: boolean }) {
  return (
    <div className={`tpl-grid ${p.compact ? "compact" : ""}`}>
      <button type="button" className={`tpl-card auto ${!p.value ? "on" : ""}`} onClick={() => p.onPick(null)}>
        <div className="tpl-poster auto">
          <span>✦</span>
        </div>
        <div className="tpl-meta">
          <strong>Let Claude choose</strong>
          <span className="muted small">Claude picks the template that fits your brief and says which.</span>
        </div>
      </button>
      {BLUEPRINTS.map((b) => (
        <div key={b.id} className={`tpl-card ${p.value === b.id ? "on" : ""}`} onClick={() => p.onPick(b.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && p.onPick(b.id)}>
          <div className="tpl-poster">
            <img src={`/templates/${b.id}.jpg`} alt="" loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
            <button
              type="button"
              className="tpl-play"
              title="Watch a sample"
              onClick={(e) => {
                e.stopPropagation();
                p.onPreview(b.id);
              }}
            >
              ▶ Preview
            </button>
          </div>
          <div className="tpl-meta">
            <strong>{b.name}</strong>
            <span className="muted small">{b.tagline}</span>
            {!p.compact && (
              <span className="small tpl-facts">
                {b.length[0]}–{b.length[1]}s · {b.format} · needs {b.needs.split(/[.;]/)[0].toLowerCase()}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Plays a template's sample video (TaxStreem content) in the browser. */
export function TemplatePreview(p: { id: string; onClose: () => void; onUse?: (id: string) => void }) {
  const b = BLUEPRINT_BY_ID.get(p.id)!;
  const renderer = useMemo(() => new Renderer(), []);
  const playback = useMemo(() => new Playback(), []);
  const tRef = useRef(0);
  const [spec, setSpec] = useState<VideoSpec | null>(null);
  const [format, setFormat] = useState<Format>(b.format);
  const [info, setInfo] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const raw = (await (await fetch(`/templates/${p.id}.json`)).json()) as VideoSpec & { assets?: Record<string, string> };
        const images: Record<string, ImageBitmap> = {};
        await Promise.all(
          Object.entries(raw.assets ?? {}).map(async ([key, url]) => {
            images[key] = await createImageBitmap(await (await fetch(url)).blob());
          }),
        );
        if (Object.keys(images).length) renderer.sendImages(images);
        const { assets: _a, ...clean } = raw;
        setSpec(clean as VideoSpec);
      } catch (e) {
        setErr(`Couldn't load the sample: ${(e as Error).message}`);
      }
    })();
    return () => renderer.destroy();
  }, [renderer, p.id]);
  useEffect(() => {
    if (spec) renderer.load(spec, format, { t: tRef.current, scale: 0.6 }).then(setInfo, (e) => setErr(String(e?.message ?? e)));
  }, [spec, format, renderer]);
  return (
    <div className="modal-back" onClick={p.onClose}>
      <div className="modal wide stack tpl-preview" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div>
            <h2 style={{ margin: 0 }}>{b.name}</h2>
            <span className="muted small">{b.tagline}</span>
          </div>
          <div className="row">
            <div className="seg-ctl">
              {(["9:16", "1:1", "16:9"] as Format[]).map((f) => (
                <button key={f} className={format === f ? "on" : ""} onClick={() => setFormat(f)}>{f}</button>
              ))}
            </div>
            <button className="btn ghost small" onClick={p.onClose}>Close</button>
          </div>
        </div>
        <div className="tpl-stage">
          <Player renderer={renderer} duration={info?.duration ?? 0} timings={info?.timings ?? []} format={format} playback={playback} busy={spec ? null : "Loading the sample"} tRef={tRef} />
        </div>
        {err && <p className="error">{err}</p>}
        <div className="tpl-about small">
          <p style={{ margin: 0 }}>
            <strong>Best for:</strong> {b.bestFor} <strong>Length:</strong> {b.length[0]}–{b.length[1]}s. <strong>Style:</strong> {b.look}. <strong>Music:</strong> {b.music}
          </p>
          <p style={{ margin: "6px 0 0" }}>
            <strong>You'll need:</strong> {b.needs} <span className="muted">Modelled on {b.inspiredBy}. The sample uses TaxStreem content; your video uses your brief, screenshots and footage.</span>
          </p>
        </div>
        {p.onUse && (
          <div className="row end">
            <button className="btn primary" onClick={() => p.onUse!(p.id)}>Use this template</button>
          </div>
        )}
      </div>
    </div>
  );
}
