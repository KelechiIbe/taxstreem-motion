import { useEffect, useRef, useState } from "react";
import type { AssetRow } from "../lib/assets";
import { fileUrl } from "../lib/supabase";
import type { FocusMark } from "../runtime/types";

/** What the team decided for one scene: which pictures, where the camera goes, how it moves. */
export interface Direction {
  media: string[];
  motion: string;
  focus: FocusMark[];
}

const IDEAS = [
  "Slow push-in on the picture",
  "Zoom into each marked area in order, with its label",
  "A cursor moves to the first marked area and clicks it",
  "The screen slides in from the right with a slight 3D tilt, then flattens",
  "Picture on one side, the words on the other",
  "The photos slide together into a collage",
  "Quick cuts between the pictures on the beat",
];

const isAsset = (assets: AssetRow[], id: string) => assets.some((a) => a.id === id);
const round = (n: number) => Math.round(n * 1000) / 1000;

export function SceneDirector(p: {
  title: string;
  words?: string;
  assets: AssetRow[];
  initial: Direction;
  mode: "script" | "video";
  onUpload: (f: File) => Promise<AssetRow | null>;
  onClose: () => void;
  onApply: (d: Direction) => Promise<void>;
}) {
  const pickable = p.assets.filter((a) => a.kind === "image" || a.kind === "video");
  const others = p.initial.media.filter((m) => !isAsset(p.assets, m));
  const [media, setMedia] = useState<string[]>(p.initial.media.filter((m) => pickable.some((a) => a.id === m)));
  const [motion, setMotion] = useState(p.initial.motion);
  const [focus, setFocus] = useState<FocusMark[]>(p.initial.focus.filter((f) => media.includes(f.asset)));
  const [active, setActive] = useState<string | null>(media[0] ?? null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    for (const a of pickable) {
      if (urls[a.id]) continue;
      const path = a.kind === "image" ? a.meta?.preview || a.path : a.meta?.poster;
      if (path) fileUrl(path).then((u) => setUrls((x) => ({ ...x, [a.id]: u })), () => {});
    }
  }, [p.assets]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    if (media.includes(id)) {
      setMedia(media.filter((m) => m !== id));
      setFocus(focus.filter((f) => f.asset !== id));
      if (active === id) setActive(media.find((m) => m !== id) ?? null);
    } else {
      setMedia([...media, id].slice(-5));
      setActive(id);
    }
  };

  const upload = () => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = "image/*,video/*,.mov,.mp4,.webm,.m4v";
    i.onchange = async () => {
      const f = i.files?.[0];
      if (!f) return;
      setBusy(`Uploading ${f.name}`);
      setErr(null);
      try {
        const row = await p.onUpload(f);
        if (row) {
          setMedia((m) => [...m, row.id].slice(-5));
          setActive(row.id);
        }
      } catch (e) {
        setErr((e as Error).message);
      }
      setBusy(null);
    };
    i.click();
  };

  // drawing a box on the active picture, in fractions of the picture
  const at = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const q = at(e);
    setDrag({ x0: q.x, y0: q.y, x: q.x, y: q.y });
  };
  const move = (e: React.PointerEvent) => drag && setDrag({ ...drag, ...at(e) });
  const up = () => {
    if (!drag || !active) return setDrag(null);
    const x = Math.min(drag.x0, drag.x);
    const y = Math.min(drag.y0, drag.y);
    const w = Math.abs(drag.x - drag.x0);
    const h = Math.abs(drag.y - drag.y0);
    setDrag(null);
    if (w < 0.02 || h < 0.02) return;
    setFocus([...focus, { asset: active, x: round(x), y: round(y), w: round(w), h: round(h) }].slice(0, 6));
  };
  const box = (b: { x: number; y: number; w: number; h: number }) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });

  const apply = async () => {
    setBusy(p.mode === "video" ? "Sending to Claude" : "Saving");
    setErr(null);
    try {
      await p.onApply({ media: [...media, ...others], motion: motion.trim(), focus });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  };

  const activeAsset = pickable.find((a) => a.id === active);
  const marks = focus.map((f, i) => ({ ...f, n: i + 1 })).filter((f) => f.asset === active);

  return (
    <div className="modal-back" onClick={p.onClose}>
      <div className="modal wide stack director" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Direct {p.title}</h2>
          <button className="btn ghost small" onClick={p.onClose}>Close</button>
        </div>
        {p.words && <p className="muted small" style={{ margin: 0 }}>On screen: {p.words}</p>}

        <div className="field">
          <span>1. Pick the pictures or clips for this scene</span>
          <div className="pick-grid">
            {pickable.map((a) => {
              const n = media.indexOf(a.id);
              return (
                <button key={a.id} type="button" className={`pick ${n >= 0 ? "on" : ""}`} onClick={() => toggle(a.id)} title={a.name}>
                  {urls[a.id] ? <img src={urls[a.id]} alt={a.name} /> : <span className="muted small">{a.name}</span>}
                  {a.kind === "video" && <span className="badge">▶</span>}
                  {n >= 0 && <span className="num">{n + 1}</span>}
                </button>
              );
            })}
            <button type="button" className="pick add" onClick={upload} disabled={!!busy}>+ Upload</button>
          </div>
          {pickable.length === 0 && <span className="muted small">No pictures yet. Upload a screenshot, photo or clip.</span>}
          {others.length > 0 && <span className="muted small">Also requested for this scene: {others.map((o) => o.replace(/^envato:(\w+:)?/, "Envato ").replace(/^stock:(\w+:)?/, "stock ").replace(/^generate:/, "AI image ")).join("; ")}</span>}
        </div>

        {media.length > 0 && (
          <div className="field">
            <span>2. Mark where the camera should go (optional)</span>
            {media.length > 1 && (
              <div className="seg-ctl">
                {media.map((id, i) => (
                  <button key={id} className={active === id ? "on" : ""} onClick={() => setActive(id)}>
                    {i + 1}. {(pickable.find((a) => a.id === id)?.name ?? "").slice(0, 22)}
                  </button>
                ))}
              </div>
            )}
            {activeAsset && urls[activeAsset.id] && (
              <div className="mark-wrap">
                <div className="mark-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
                  <img src={urls[activeAsset.id]} alt="" draggable={false} />
                  {marks.map((f) => (
                    <div key={f.n} className="mark" style={box(f)}>
                      <span>{f.n}</span>
                    </div>
                  ))}
                  {drag && <div className="mark drawing" style={box({ x: Math.min(drag.x0, drag.x), y: Math.min(drag.y0, drag.y), w: Math.abs(drag.x - drag.x0), h: Math.abs(drag.y - drag.y0) })} />}
                </div>
              </div>
            )}
            <span className="muted small">Drag a box over each part you want the camera to move to, in the order it should visit them. Give a box a label to show a callout there.</span>
            {focus.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                {focus.map((f, i) => (
                  <div key={i} className="row">
                    <span className="mark-n">{i + 1}</span>
                    <span className="small muted ellipsis" style={{ width: 120 }}>{pickable.find((a) => a.id === f.asset)?.name}</span>
                    <input placeholder="Label (optional), e.g. VAT payable" value={f.label ?? ""} onChange={(e) => setFocus(focus.map((x, k) => (k === i ? { ...x, label: e.target.value.slice(0, 40) || undefined } : x)))} style={{ flex: 1 }} />
                    <button className="link small danger" onClick={() => setFocus(focus.filter((_, k) => k !== i))}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="field">
          <span>{media.length ? "3." : "2."} How should it move?</span>
          <textarea rows={3} value={motion} placeholder="e.g. The dashboard slides up into view, then the camera zooms into the VAT total and a cursor clicks File return" onChange={(e) => setMotion(e.target.value)} />
          <div className="row wrap" style={{ gap: 6 }}>
            {IDEAS.map((idea) => (
              <button key={idea} type="button" className="chip-btn" onClick={() => setMotion((m) => (m.trim() ? `${m.trim().replace(/\.$/, "")}. ${idea}.` : `${idea}.`))}>
                {idea}
              </button>
            ))}
          </div>
        </label>

        {err && <p className="error">{err}</p>}
        <div className="row end">
          {busy && <span className="muted small"><span className="spinner" /> {busy}</span>}
          <button className="btn" onClick={p.onClose}>Cancel</button>
          <button className="btn primary" disabled={!!busy} onClick={apply}>{p.mode === "video" ? "Rebuild this scene" : "Save to scene"}</button>
        </div>
      </div>
    </div>
  );
}
