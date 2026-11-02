import { useEffect, useState } from "react";
import { api, sb } from "../lib/supabase";
import { TopBar, type Me } from "./App";

type Status = Record<string, { set: boolean; last4: string; source: string }>;
type SaveResult = { status: Status; message: string; ok: boolean };

const KEYS = [
  { name: "anthropic", label: "Anthropic (Claude)", help: "Writes the scripts, then designs, edits and reviews the videos. Create a key at platform.claude.com/settings/keys. A key made for one workspace works on its own; a key that works across workspaces also needs the workspace ID below." },
  { name: "elevenlabs", label: "ElevenLabs", help: "Voiceovers with word timings, transcribing uploaded recordings, and AI images (the key needs the Image & Video permission)." },
  { name: "pexels", label: "Pexels", help: "Free stock photos and clips in the studio, and stock Claude can fetch for a scene. Get a free key at pexels.com/api." },
];

export function Settings({ me }: { me: Me }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Status>("motion-keys").then(setStatus, (e) => setErr(e.message));
  }, []);
  return (
    <div className="page">
      <TopBar me={me} />
      <main className="container narrowish">
        <h1 style={{ margin: "28px 0 6px" }}>Settings</h1>
        <p className="muted" style={{ marginTop: 0 }}>Signed in as {me.email} ({me.role}).</p>
        <section className="panel stack">
          <h2 style={{ margin: 0 }}>API keys</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Keys are encrypted before they're stored and are only decrypted on the server. {me.role === "admin" ? "" : "Only admins can change them."}
          </p>
          {err && <p className="error">{err}</p>}
          {KEYS.map((k) => (
            <div key={k.name} className="stack">
              <KeyRow name={k.name} label={k.label} help={k.help} st={status?.[k.name]} admin={me.role === "admin"} onSaved={setStatus} />
              {k.name === "anthropic" && <WorkspaceRow st={status?.anthropic_workspace} admin={me.role === "admin"} onSaved={setStatus} />}
            </div>
          ))}
        </section>
        <section className="panel stack" style={{ marginTop: 16 }}>
          <h2 style={{ margin: 0 }}>How it works</h2>
          <p className="small" style={{ margin: 0 }}>
            You start with the idea; Claude writes an editable script (voiceover, words on screen, visuals, timing). When you approve it, Claude builds the video as a list of scenes from reviewed templates (titles, stats, screenshots and screen recordings with a moving camera, photos and clips, collages, kinetic type, native product UI, steps, charts, calls to action) in the style you pick. Your browser draws every frame from that list, so edits are instant. After each new version, Claude looks at a sheet of rendered frames and fixes what it can before you review it.
          </p>
          <p className="small muted" style={{ margin: 0 }}>Exports are made in your browser. Use Chrome or Edge on a laptop or desktop for MP4.</p>
        </section>
        <div style={{ margin: "20px 0" }}>
          <button className="btn" onClick={() => sb.auth.signOut()}>Sign out</button>
        </div>
      </main>
    </div>
  );
}

function KeyRow({ name, label, help, st, admin, onSaved }: { name: string; label: string; help: string; st?: { set: boolean; last4: string; source: string }; admin: boolean; onSaved: (s: Status) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<SaveResult>("motion-keys", { action: "save", name, value });
      onSaved(r.status);
      setValue("");
      setMsg(r.message);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg((await api<{ message: string }>("motion-keys", { action: "test", name })).message);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className="keyrow">
      <div>
        <strong>{label}</strong>
        <div className="muted small">{help}</div>
        <div className="small" style={{ marginTop: 4 }}>
          {st ? (st.set ? <span className="ok">Set · ends in {st.last4} · {st.source === "environment" ? "from Netlify's environment variables" : "saved here"}</span> : <span className="warn">Not set</span>) : "…"}
        </div>
      </div>
      {admin && (
        <div className="row wrap">
          <input type="password" placeholder={st?.set ? "Replace key" : "Paste key"} value={value} onChange={(e) => setValue(e.target.value)} style={{ minWidth: 220 }} />
          <button className="btn primary small" disabled={busy || !value.trim()} onClick={save}>Save</button>
          <button className="btn small" disabled={busy || !st?.set} onClick={test}>Test</button>
        </div>
      )}
      {msg && <div className="small">{msg}</div>}
    </div>
  );
}

function WorkspaceRow({ st, admin, onSaved }: { st?: { set: boolean; last4: string }; admin: boolean; onSaved: (s: Status) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (v: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<SaveResult>("motion-keys", { action: "save", name: "anthropic_workspace", value: v });
      onSaved(r.status);
      setValue("");
      setMsg(r.message);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className="keyrow sub">
      <div>
        <strong>Anthropic workspace ID</strong>
        <div className="muted small">Only for a key that works across workspaces. Find it in the ID column at platform.claude.com/settings/workspaces; it starts with wrkspc_.</div>
        <div className="small" style={{ marginTop: 4 }}>{st ? (st.set ? <span className="ok">{st.last4}</span> : <span className="muted">Not set</span>) : "…"}</div>
      </div>
      {admin && (
        <div className="row wrap">
          <input placeholder="wrkspc_…" value={value} onChange={(e) => setValue(e.target.value)} style={{ minWidth: 220 }} />
          <button className="btn primary small" disabled={busy || !value.trim()} onClick={() => save(value)}>Save</button>
          <button className="btn small" disabled={busy || !st?.set} onClick={() => save("")}>Remove</button>
        </div>
      )}
      {msg && <div className="small">{msg}</div>}
    </div>
  );
}
