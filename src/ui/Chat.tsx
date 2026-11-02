import { useEffect, useRef, useState } from "react";
import type { AssetRow } from "../lib/assets";

export interface MessageRow {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  data: any;
  created_at: string;
}

const STARTERS = [
  "Make a 25-second Reel showing how TaxStreem files VAT in three steps. Use my screenshots and end with Start now.",
  "Deadline reminder: October VAT and WHT returns are due on 21 November. Calm tone, 12 seconds.",
  "Turn this LinkedIn post into a 30-second square video: ",
  "A 6-second logo sting with the tagline Make taxes clearer for everyone.",
];

export function Chat(p: {
  messages: MessageRow[];
  job: { kind: string; message: string; created_at: string } | null;
  lastError: string | null;
  assets: Map<string, AssetRow>;
  pending: string[];
  setPending: (f: (x: string[]) => string[]) => void;
  empty: boolean;
  onSend: (text: string) => void;
  onFiles: (files: File[]) => void;
  onVoice: () => void;
  onViewVersion: (n: number) => void;
  currentVersion: number;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [p.messages.length, p.job?.message]);
  useEffect(() => {
    if (!p.job) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [p.job]);

  const submit = () => {
    if (p.disabled || (!text.trim() && !p.pending.length)) return;
    p.onSend(text.trim());
    setText("");
  };
  const pick = () => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = "image/*,audio/*";
    i.multiple = true;
    i.onchange = () => p.onFiles([...(i.files ?? [])]);
    i.click();
  };

  return (
    <aside
      className={`chat ${drag ? "drag" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        p.onFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="msgs">
        {p.messages.length === 0 && (
          <div className="intro">
            <h3>What are we making?</h3>
            <p className="muted small">Describe the video: the message, who it's for, where it'll be posted and how long. Drop in product screenshots, a voiceover or a track from Envato. Claude builds a first cut from TaxStreem's scene templates, checks the rendered frames, and you refine it here.</p>
            <div className="stack">
              {STARTERS.map((s) => (
                <button key={s} className="starter" onClick={() => setText(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {p.messages.map((m) => (
          <Message key={m.id} m={m} assets={p.assets} onViewVersion={p.onViewVersion} current={p.currentVersion} />
        ))}
        {p.job && (
          <div className="msg assistant working">
            <span className="spinner" />
            {p.job.message || "Working"}… <span className="muted small">{Math.max(0, Math.round((now - new Date(p.job.created_at).getTime()) / 1000))}s</span>
          </div>
        )}
        {!p.job && p.lastError && <div className="msg system error">{p.lastError}</div>}
        <div ref={end} />
      </div>
      <div className="composer">
        {p.pending.length > 0 && (
          <div className="chips">
            {p.pending.map((id) => {
              const a = p.assets.get(id);
              return (
                <span key={id} className="chip">
                  {a?.kind === "image" ? "Screenshot" : a?.kind === "voice" ? "Voiceover" : "Music"}: {a?.name ?? id}
                  <button onClick={() => p.setPending((x) => x.filter((y) => y !== id))} aria-label="Remove">×</button>
                </span>
              );
            })}
          </div>
        )}
        <textarea
          value={text}
          placeholder={p.empty ? "Describe the video you want…" : "Ask for a change: “slow scene 3 down”, “make the hook punchier”, “use the blue theme for the stat”…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
        />
        <div className="row between">
          <div className="row">
            <button className="btn ghost small" onClick={pick} title="Screenshots or music">Attach</button>
            <button className="btn ghost small" onClick={p.onVoice}>Voiceover</button>
          </div>
          <button className="btn primary small" disabled={p.disabled || (!text.trim() && !p.pending.length)} onClick={submit}>
            {p.disabled ? "Working…" : "Send"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Message({ m, assets, onViewVersion, current }: { m: MessageRow; assets: Map<string, AssetRow>; onViewVersion: (n: number) => void; current: number }) {
  const [open, setOpen] = useState(false);
  const review = m.data?.review;
  return (
    <div className={`msg ${m.role}`}>
      {m.role === "user" && m.data?.by && <div className="by small muted">{m.data.by}</div>}
      {m.content && <div className="txt">{m.content}</div>}
      {m.role === "user" && (m.data?.attachments ?? []).length > 0 && (
        <div className="chips">
          {(m.data.attachments as string[]).map((id) => (
            <span key={id} className="chip">{assets.get(id)?.name ?? "file"}</span>
          ))}
        </div>
      )}
      {review && (
        <div className="review">
          <button className="link small" onClick={() => setOpen((o) => !o)}>
            <span className={`tag ${review.verdict}`}>{review.verdict === "ready" ? "Frames look right" : review.verdict === "fixed" ? "Fixed after review" : "Needs a human look"}</span> {open ? "Hide" : "Show"} review ({(review.issues ?? []).length} issues, {(review.inspected ?? []).length} frames)
          </button>
          {open && (
            <div className="small">
              {(review.issues ?? []).map((i: any, k: number) => (
                <div key={k} className="issue">
                  <strong>{[i.scene, i.time].filter(Boolean).join(" · ") || "General"}</strong>: {i.problem} <span className="muted">→ {i.fix}</span>
                </div>
              ))}
              <div className="muted">Inspected: {(review.inspected ?? []).join(", ")}</div>
            </div>
          )}
        </div>
      )}
      {m.data?.version ? (
        <button className="vchip" onClick={() => onViewVersion(m.data.version)}>
          {m.data.version === current ? `Version ${m.data.version} (current)` : `View version ${m.data.version}`}
        </button>
      ) : null}
      {(m.data?.notes ?? []).length > 0 && <div className="small muted">{(m.data.notes as string[]).join(" ")}</div>}
    </div>
  );
}
