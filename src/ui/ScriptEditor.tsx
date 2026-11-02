import { useEffect, useRef, useState } from "react";
import type { AssetRow } from "../lib/assets";
import { LOOKS } from "../runtime/looks";
import type { Format, Script, ScriptScene } from "../runtime/types";

const FORMATS: Format[] = ["9:16", "1:1", "16:9"];

/** The editable script: what is said, what is shown, for how long. Approving it builds the video. */
export function ScriptEditor(p: {
  script: Script | null;
  assets: AssetRow[];
  busy: boolean;
  hasVideo: boolean;
  onSave: (s: Script) => Promise<void>;
  onApprove: (s: Script) => void;
  onVoiceover: (text: string, direction?: string) => void;
  onFindEnvato: (sceneId: string, request: string) => void;
}) {
  const [draft, setDraft] = useState<Script | null>(p.script);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number | null>(null);
  const latest = useRef(draft);
  latest.current = draft;

  // Claude's new script replaces the draft unless the team has unsaved edits
  useEffect(() => {
    if (saved) setDraft(p.script);
  }, [JSON.stringify(p.script)]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (next: Script) => {
    setDraft(next);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(), 900);
  };
  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const s = latest.current;
    if (!s) return;
    await p.onSave({ ...s, approvedAt: undefined });
    setSaved(true);
  };
  useEffect(() => () => void (timer.current && flush()), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft) {
    return (
      <div className="script-empty">
        <h3>Start with the idea</h3>
        <p className="muted">Tell Claude the core idea and the context in the chat: what the video should say, who it's for, where it'll be posted, how long, and the style you want. Attach screenshots, footage or a sample video to replicate. Claude writes an editable script here; once you approve it, the video is built from it.</p>
        {p.busy && <p className="small"><span className="spinner" /> Writing…</p>}
      </div>
    );
  }

  const scenes = draft.scenes;
  const total = Math.round(scenes.reduce((a, s) => a + (Number(s.seconds) || 0), 0) * 10) / 10;
  const words = scenes.reduce((a, s) => a + s.vo.split(/\s+/).filter(Boolean).length, 0);
  const setScene = (i: number, patch: Partial<ScriptScene>) => change({ ...draft, scenes: scenes.map((s, k) => (k === i ? { ...s, ...patch } : s)), length: total });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= scenes.length) return;
    const next = [...scenes];
    [next[i], next[j]] = [next[j], next[i]];
    change({ ...draft, scenes: next });
  };
  const add = (i: number) => {
    const used = new Set(scenes.map((s) => s.id));
    let n = scenes.length + 1;
    while (used.has(`s${n}`)) n++;
    const next = [...scenes];
    next.splice(i + 1, 0, { id: `s${n}`, vo: "", onScreen: "", visual: "", seconds: 3, media: [] });
    change({ ...draft, scenes: next });
  };
  const remove = (i: number) => change({ ...draft, scenes: scenes.filter((_, k) => k !== i) });
  const media = p.assets.filter((a) => a.kind === "image" || a.kind === "video");
  const vo = scenes.map((s) => s.vo.trim()).filter(Boolean).join(" ");

  return (
    <div className="script">
      <div className="script-head">
        <input className="script-title" value={draft.title} onChange={(e) => change({ ...draft, title: e.target.value })} aria-label="Title" />
        <span className={`small ${saved ? "muted" : ""}`}>{saved ? "Saved" : "Saving…"}</span>
      </div>
      <label className="field">
        <span>Core idea</span>
        <textarea rows={2} value={draft.idea} onChange={(e) => change({ ...draft, idea: e.target.value })} />
      </label>
      <div className="script-meta">
        <label className="field">
          <span>Style</span>
          <select value={draft.look} onChange={(e) => change({ ...draft, look: e.target.value })}>
            {LOOKS.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Colours</span>
          <select value={typeof draft.palette === "string" ? draft.palette : "custom"} onChange={(e) => change({ ...draft, palette: e.target.value === "custom" ? draft.palette : (e.target.value as "brand" | "look") })}>
            <option value="brand">TaxStreem</option>
            <option value="look">The style's own</option>
            {typeof draft.palette === "object" && <option value="custom">Custom</option>}
          </select>
        </label>
        <label className="field">
          <span>Format</span>
          <select value={draft.format} onChange={(e) => change({ ...draft, format: e.target.value as Format })}>
            {FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Platform</span>
          <input value={draft.platform ?? ""} onChange={(e) => change({ ...draft, platform: e.target.value })} placeholder="Instagram Reels" />
        </label>
      </div>
      <div className="script-meta two">
        <label className="field">
          <span>Voiceover direction</span>
          <input value={draft.voiceDirection ?? ""} onChange={(e) => change({ ...draft, voiceDirection: e.target.value })} placeholder="Leave empty for no voiceover" />
        </label>
        <label className="field">
          <span>Music</span>
          <input value={draft.music ?? ""} onChange={(e) => change({ ...draft, music: e.target.value })} placeholder="Mood and tempo" />
        </label>
      </div>
      <div className="row between script-stats">
        <span className="small muted">
          {scenes.length} scenes · {total}s{words ? ` · voiceover about ${Math.round(words / 2.5)}s for ${words} words` : ""}
        </span>
        {words > 0 && <button className="btn small" onClick={() => p.onVoiceover(vo, draft.voiceDirection)}>Make voiceover from script</button>}
      </div>
      <ol className="script-scenes">
        {scenes.map((s, i) => {
          const tight = s.vo && s.vo.split(/\s+/).filter(Boolean).length / Math.max(0.5, s.seconds) > 3.2;
          return (
            <li key={s.id + i} className="scene-card">
              <div className="scene-top">
                <strong>{i + 1}</strong>
                <span className="small muted">{s.id}</span>
                <label className="secs">
                  <input type="number" min={0.8} max={30} step={0.1} value={s.seconds} onChange={(e) => setScene(i, { seconds: Number(e.target.value) })} />s
                </label>
                <span className="grow" />
                <button className="link small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button className="link small" onClick={() => move(i, 1)} disabled={i === scenes.length - 1} aria-label="Move down">↓</button>
                <button className="link small" onClick={() => add(i)}>Add after</button>
                <button className="link small danger" onClick={() => remove(i)} disabled={scenes.length <= 1}>Remove</button>
              </div>
              <div className="scene-grid">
                <label className="field">
                  <span>Voiceover {tight && <em className="warn small">fast for {s.seconds}s</em>}</span>
                  <textarea rows={3} value={s.vo} onChange={(e) => setScene(i, { vo: e.target.value })} placeholder="(silent)" />
                </label>
                <label className="field">
                  <span>On screen</span>
                  <textarea rows={3} value={s.onScreen} onChange={(e) => setScene(i, { onScreen: e.target.value })} />
                </label>
                <label className="field wide">
                  <span>Visual</span>
                  <textarea rows={2} value={s.visual} onChange={(e) => setScene(i, { visual: e.target.value })} />
                </label>
              </div>
              <div className="row wrap small">
                <span className="muted">Media:</span>
                {(s.media ?? []).map((m) => {
                  const a = p.assets.find((x) => x.id === m);
                  if (!a && /^envato:/i.test(m)) {
                    const words = m.replace(/^envato:(?:(video|clip|photo|image|music|sfx|sound):)?/i, "");
                    return (
                      <span key={m} className="chip envato-ask">
                        <button className="link small" title={`Find on Envato: ${words}`} onClick={() => p.onFindEnvato(s.id, m)}>Find on Envato: {words}</button>
                        <button onClick={() => setScene(i, { media: (s.media ?? []).filter((x) => x !== m) })} aria-label="Remove">×</button>
                      </span>
                    );
                  }
                  return (
                    <span key={m} className="chip">
                      {a ? a.name : m.replace(/^(stock|generate):/, (x) => (x === "stock:" ? "Stock: " : "AI image: "))}
                      <button onClick={() => setScene(i, { media: (s.media ?? []).filter((x) => x !== m) })} aria-label="Remove">×</button>
                    </span>
                  );
                })}
                {media.length > 0 && (
                  <select value="" onChange={(e) => e.target.value && setScene(i, { media: [...(s.media ?? []), e.target.value] })}>
                    <option value="">+ add</option>
                    {media.map((a) => (
                      <option key={a.id} value={a.id}>{a.kind === "video" ? "Clip" : "Image"}: {a.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="script-foot">
        <span className="small muted">Edits save as you type. Ask Claude in the chat to rewrite anything.</span>
        <button
          className="btn primary"
          disabled={p.busy || !scenes.length}
          onClick={async () => {
            await flush();
            p.onApprove({ ...draft, length: total });
          }}
        >
          {p.hasVideo ? "Approve and rebuild video" : "Approve and build video"}
        </button>
      </div>
    </div>
  );
}
