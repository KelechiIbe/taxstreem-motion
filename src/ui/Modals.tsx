import { useEffect, useRef, useState } from "react";
import type { AssetRow } from "../lib/assets";
import type { Renderer } from "../lib/renderer";
import { api, check, sb, upload } from "../lib/supabase";
import type { Format, VideoSpec } from "../runtime/types";
import type { ProjectRow } from "./Studio";

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal stack ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost small" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface Voice {
  id: string;
  name: string;
  label: string;
  role: string;
  preview: string;
  settings?: any;
  source: string;
}

export function VoiceModal({ projectId, onClose, onCreated, onUpload }: { projectId: string; onClose: () => void; onCreated: (a: AssetRow) => void; onUpload: (f: File) => void }) {
  const [voices, setVoices] = useState<{ cast: Voice[]; library: Voice[]; note: string } | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api("motion-voices").then(
      (v) => {
        setVoices(v);
        setVoiceId(v.cast[0]?.id ?? v.library[0]?.id ?? "");
      },
      (e) => setErr(e.message),
    );
  }, []);
  const all = [...(voices?.cast ?? []), ...(voices?.library ?? [])];
  const chosen = all.find((v) => v.id === voiceId);
  const make = async () => {
    setBusy(true);
    setErr(null);
    try {
      onCreated(await api<AssetRow>("motion-tts", { projectId, text, voiceId, voiceName: chosen?.name, settings: chosen?.settings }));
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  const pick = () => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = "audio/*";
    i.onchange = () => i.files?.[0] && onUpload(i.files[0]);
    i.click();
  };
  return (
    <Modal title="Voiceover" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>Generate it with ElevenLabs (word timings come back with it, so captions and cuts follow the voice), or upload a recording and it will be transcribed for timings.</p>
      <label className="field">
        <span>Script</span>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your VAT return shouldn't take a whole weekend. TaxStreem works out what you owe from every sale and purchase…" />
        <span className="muted small">{text.length} characters · about {Math.round(text.split(/\s+/).filter(Boolean).length / 2.6)}s</span>
      </label>
      <label className="field">
        <span>Voice</span>
        <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
          {voices?.cast.length ? (
            <optgroup label="The Bridge cast">
              {voices.cast.map((v) => (
                <option key={`c${v.id}${v.name}`} value={v.id}>{v.label}</option>
              ))}
            </optgroup>
          ) : null}
          {voices?.library.length ? (
            <optgroup label="ElevenLabs library">
              {voices.library.map((v) => (
                <option key={`l${v.id}`} value={v.id}>{v.label}{v.role ? ` · ${v.role}` : ""}</option>
              ))}
            </optgroup>
          ) : null}
        </select>
        {chosen?.preview && <audio controls src={chosen.preview} style={{ marginTop: 6, width: "100%" }} />}
        {voices?.note && <span className="warn small">{voices.note}</span>}
      </label>
      {err && <p className="error">{err}</p>}
      <div className="row between">
        <button className="btn ghost" onClick={pick}>Upload a recording instead</button>
        <button className="btn primary" disabled={busy || !text.trim() || !voiceId} onClick={make}>{busy ? "Generating…" : "Generate voiceover"}</button>
      </div>
    </Modal>
  );
}

const ALL: Format[] = ["9:16", "1:1", "16:9"];

export function ExportModal({ renderer, spec, project, version, mixed, defaultFormat, onClose, onSaved }: { renderer: Renderer; spec: VideoSpec; project: ProjectRow; version: number; mixed: AudioBuffer | null; defaultFormat: Format; onClose: () => void; onSaved: () => void }) {
  const [formats, setFormats] = useState<Format[]>([defaultFormat]);
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Record<string, { p: number; label: string; url?: string; name?: string; err?: string }>>({});
  const cancel = useRef<(() => void) | null>(null);
  const slug = (spec.title || project.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "taxstreem-video";
  const run = async () => {
    setBusy(true);
    const audio = mixed ? { rate: mixed.sampleRate, left: mixed.getChannelData(0), right: mixed.getChannelData(mixed.numberOfChannels > 1 ? 1 : 0) } : null;
    for (const f of formats) {
      const set = (x: Partial<{ p: number; label: string; url: string; name: string; err: string }>) => setRows((r) => ({ ...r, [f]: { ...(r[f] ?? { p: 0, label: "" }), ...x } }));
      try {
        set({ p: 0, label: "Rendering" });
        const job = renderer.export(f, audio, (p) => set({ p, label: `Rendering ${Math.round(p * 100)}%` }));
        cancel.current = job.cancel;
        const out = await job.promise;
        const blob = new Blob([out.buffer], { type: out.mime });
        const name = `${slug}-v${version}-${f.replace(":", "x")}.${out.ext}`;
        set({ p: 1, label: save ? "Saving for the team" : "Ready", url: URL.createObjectURL(blob), name });
        if (save) {
          const path = `motion/${project.id}/renders/${name.replace(`.${out.ext}`, "")}-${Date.now()}.${out.ext}`;
          await upload(path, blob, out.mime);
          check(await sb.from("motion_renders").insert({ project_id: project.id, version, format: f, path, size: blob.size, duration: out.duration }));
          set({ label: "Ready · saved" });
        }
      } catch (e) {
        set({ err: (e as Error).message, label: "Failed" });
      }
    }
    cancel.current = null;
    setBusy(false);
    onSaved();
  };
  return (
    <Modal title="Export MP4" onClose={() => { cancel.current?.(); onClose(); }}>
      <p className="muted small" style={{ margin: 0 }}>Rendered in this browser at full HD, 30 fps, with the voiceover and music mixed in. Keep this tab open until it finishes.</p>
      <div className="row wrap">
        {ALL.map((f) => (
          <label key={f} className="row small check">
            <input type="checkbox" checked={formats.includes(f)} disabled={busy} onChange={(e) => setFormats((x) => (e.target.checked ? [...x, f] : x.filter((y) => y !== f)))} />
            {f === "9:16" ? "Vertical 9:16 (1080×1920)" : f === "1:1" ? "Square 1:1 (1080×1080)" : "Landscape 16:9 (1920×1080)"}
          </label>
        ))}
      </div>
      <label className="row small">
        <input type="checkbox" checked={save} disabled={busy} onChange={(e) => setSave(e.target.checked)} /> Save to the team's renders
      </label>
      {formats.map((f) =>
        rows[f] ? (
          <div key={f} className="export-row">
            <div className="row between small">
              <strong>{f}</strong>
              <span className={rows[f].err ? "error" : "muted"}>{rows[f].err ?? rows[f].label}</span>
            </div>
            <div className="bar"><div style={{ width: `${Math.round(rows[f].p * 100)}%` }} /></div>
            {rows[f].url && <a className="btn small" href={rows[f].url} download={rows[f].name}>Download {rows[f].name}</a>}
          </div>
        ) : null,
      )}
      <div className="row end">
        {busy ? <button className="btn" onClick={() => cancel.current?.()}>Cancel</button> : <button className="btn primary" disabled={!formats.length} onClick={run}>Render {formats.length > 1 ? `${formats.length} files` : "MP4"}</button>}
      </div>
    </Modal>
  );
}

export function JsonModal({ spec, onClose, onSave }: { spec: VideoSpec; onClose: () => void; onSave: (s: VideoSpec, note: string) => Promise<void> }) {
  const [text, setText] = useState(() => JSON.stringify(spec, null, 2));
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null);
    let parsed: VideoSpec;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return setErr(`Not valid JSON: ${(e as Error).message}`);
    }
    setBusy(true);
    try {
      await onSave(parsed, note.trim() || "Edited the spec by hand");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Edit spec" onClose={onClose} wide>
      <p className="muted small" style={{ margin: 0 }}>The exact scenes, text, timings and camera moves. Changes save as a new version.</p>
      <textarea className="code" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <input placeholder="What did you change? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <p className="error">{err}</p>}
      <div className="row end">
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={save}>Save as new version</button>
      </div>
    </Modal>
  );
}
