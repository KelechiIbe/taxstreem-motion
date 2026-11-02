import { useEffect, useState } from "react";
import { deleteProject } from "../lib/projects";
import { check, fileUrl, sb } from "../lib/supabase";
import type { Format } from "../runtime/types";
import { go, TopBar, type Me } from "./App";

interface ProjectRow {
  id: string;
  title: string;
  format: Format;
  version: number;
  thumb_path: string | null;
  updated_at: string;
}

const FORMATS: { f: Format; label: string; hint: string }[] = [
  { f: "9:16", label: "Vertical 9:16", hint: "Reels, TikTok, Shorts, Status" },
  { f: "1:1", label: "Square 1:1", hint: "Feeds, LinkedIn, X" },
  { f: "16:9", label: "Landscape 16:9", hint: "YouTube, website, decks" },
];

export function Projects({ me }: { me: Me }) {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const canDelete = me.role === "admin" || me.role === "producer";

  const remove = async (p: ProjectRow) => {
    if (!confirm(`Delete "${p.title}"?\n\nThis removes the video with its script, every version, the chat, renders and uploaded files. It can't be undone.`)) return;
    setErr(null);
    setDeleting(p.id);
    try {
      await deleteProject(p.id);
      setRows((r) => (r ?? []).filter((x) => x.id !== p.id));
    } catch (e) {
      setErr((e as Error).message);
      if (/was deleted/.test((e as Error).message)) setRows((r) => (r ?? []).filter((x) => x.id !== p.id));
    }
    setDeleting(null);
  };

  useEffect(() => {
    sb.from("motion_projects")
      .select("id, title, format, version, thumb_path, updated_at")
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .then(async (r) => {
        if (r.error) return setErr(r.error.message);
        setRows(r.data as ProjectRow[]);
        const out: Record<string, string> = {};
        await Promise.all((r.data as ProjectRow[]).filter((p) => p.thumb_path).map(async (p) => (out[p.id] = await fileUrl(p.thumb_path!).catch(() => ""))));
        setThumbs(out);
      });
  }, []);

  return (
    <div className="page">
      <TopBar me={me} />
      <main className="container">
        <div className="row between" style={{ margin: "28px 0 20px" }}>
          <div>
            <h1 style={{ margin: 0 }}>Videos</h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>Every video the team is working on. Open one to keep chatting with Claude.</p>
          </div>
          <button className="btn primary" onClick={() => setCreating(true)}>New video</button>
        </div>
        {err && <p className="error">{err}</p>}
        {rows === null ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="empty">
            <img src="/brand/icon-brand.svg" alt="" style={{ height: 40 }} />
            <h3>No videos yet</h3>
            <p className="muted">Start one, describe what it should say, and drop in screenshots, a voiceover or a track.</p>
            <button className="btn primary" onClick={() => setCreating(true)}>New video</button>
          </div>
        ) : (
          <div className="grid">
            {rows.map((p) => (
              <a key={p.id} href={`#/p/${p.id}`} className="card project">
                <div className={`thumb f${p.format.replace(":", "x")}`}>{thumbs[p.id] ? <img src={thumbs[p.id]} alt="" /> : <span className="muted small">No preview yet</span>}</div>
                <div className="pad row between top">
                  <div style={{ minWidth: 0 }}>
                    <strong>{p.title}</strong>
                    <div className="muted small">
                      {p.format} · {p.version ? `version ${p.version}` : "not started"} · {new Date(p.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  {canDelete && (
                    <button
                      className="link small danger"
                      disabled={deleting === p.id}
                      title="Delete this video"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        remove(p);
                      }}
                    >
                      {deleting === p.id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
      {creating && <NewProject onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<Format>("9:16");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    try {
      const row = check(await sb.from("motion_projects").insert({ title: title.trim() || "Untitled video", format, stage: "script" }).select("id").single()) as { id: string };
      go(`p/${row.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>New video</h2>
        <label className="field">
          <span>Working title</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. VAT filing in 3 steps" onKeyDown={(e) => e.key === "Enter" && create()} />
        </label>
        <div className="field">
          <span>Main format</span>
          <div className="formats">
            {FORMATS.map((x) => (
              <button key={x.f} type="button" className={`format ${format === x.f ? "on" : ""}`} onClick={() => setFormat(x.f)}>
                <span className={`shape f${x.f.replace(":", "x")}`} />
                <strong>{x.label}</strong>
                <span className="muted small">{x.hint}</span>
              </button>
            ))}
          </div>
          <span className="muted small">You can export the same video in all three formats later.</span>
        </div>
        {err && <p className="error">{err}</p>}
        <div className="row end">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create"}</button>
        </div>
      </div>
    </div>
  );
}
