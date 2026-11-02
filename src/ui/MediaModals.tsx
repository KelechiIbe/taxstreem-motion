import { useEffect, useState } from "react";
import { api } from "../lib/supabase";
import { BRAND_COLORS, LOOKS, colorwayFor } from "../runtime/looks";
import type { Format, PaletteSpec } from "../runtime/types";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
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

const HEX = /^#[0-9a-f]{6}$/i;

/** Pick the style (look) and colours for the video. */
export function StyleModal({ look, palette, onClose, onApply }: { look: string; palette?: PaletteSpec; onClose: () => void; onApply: (look: string, palette: PaletteSpec) => Promise<void> | void }) {
  const [sel, setSel] = useState(look || "taxstreem");
  const [mode, setMode] = useState<"brand" | "look" | "custom">(typeof palette === "object" ? "custom" : palette === "look" ? "look" : "brand");
  const [custom, setCustom] = useState<Record<string, string>>(() => ({ ...BRAND_COLORS, ...(typeof palette === "object" ? palette : {}) }));
  const [busy, setBusy] = useState(false);
  const chosen = LOOKS.find((l) => l.id === sel) ?? LOOKS[0];
  const pal: PaletteSpec = mode === "custom" ? Object.fromEntries(Object.entries(custom).filter(([, v]) => HEX.test(v))) : mode;
  const colors = colorwayFor(chosen, pal as any);
  return (
    <Modal title="Style" onClose={onClose} wide>
      <p className="muted small" style={{ margin: 0 }}>A style changes fonts, backgrounds, cards and how things move. Colours stay TaxStreem's unless you choose otherwise.</p>
      <div className="look-grid">
        {LOOKS.map((l) => {
          const c = mode === "look" ? l.colors : colorwayFor(l, pal as any);
          return (
            <button key={l.id} className={`look-card ${sel === l.id ? "on" : ""}`} onClick={() => setSel(l.id)}>
              <span className="look-sample" style={{ fontFamily: `"${l.fonts.display}", Inter, sans-serif`, fontWeight: l.type.displayWeight, textTransform: l.type.upper ? "uppercase" : undefined, letterSpacing: `${l.type.tracking}em`, color: c.ink, background: l.defaultTheme === "dark" ? "#0b0b0d" : c.paper }}>
                <span style={{ color: l.defaultTheme === "dark" ? "#fff" : c.ink }}>File </span>
                <span style={{ color: c.primary, fontStyle: l.fonts.italicAccent ? "italic" : undefined }}>faster</span>
              </span>
              <strong>{l.name}</strong>
              <span className="small muted">{l.blurb}</span>
              <span className="swatches">
                {[c.primary, c.secondary, c.tertiary, c.ink, c.paper].map((x, i) => (
                  <i key={i} style={{ background: x }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="row wrap">
        <span className="small"><strong>Colours</strong></span>
        <div className="seg-ctl">
          <button className={mode === "brand" ? "on" : ""} onClick={() => setMode("brand")}>TaxStreem</button>
          <button className={mode === "look" ? "on" : ""} onClick={() => setMode("look")}>{chosen.name}'s own</button>
          <button className={mode === "custom" ? "on" : ""} onClick={() => setMode("custom")}>Custom</button>
        </div>
      </div>
      {mode === "custom" && (
        <div className="row wrap">
          {(["primary", "secondary", "tertiary", "ink", "paper"] as const).map((k) => (
            <label key={k} className="colorfield small">
              <input type="color" value={HEX.test(custom[k]) ? custom[k] : "#000000"} onChange={(e) => setCustom({ ...custom, [k]: e.target.value.toUpperCase() })} />
              <span>{k}</span>
              <input value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} style={{ width: 86 }} />
            </label>
          ))}
        </div>
      )}
      <div className="row between">
        <span className="swatches big">
          {[colors.primary, colors.secondary, colors.tertiary, colors.ink, colors.paper].map((x, i) => (
            <i key={i} style={{ background: x }} />
          ))}
        </span>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onApply(sel, pal);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Applying…" : "Apply"}
        </button>
      </div>
    </Modal>
  );
}

export interface StockItem {
  source: "pexels";
  type: "photo" | "video";
  id: number;
  width: number;
  height: number;
  duration?: number;
  thumb: string;
  url: string;
  preview: string;
  alt: string;
  credit: string;
  creditUrl: string;
  pageUrl: string;
}

const ORIENT: Record<Format, string> = { "9:16": "portrait", "16:9": "landscape", "1:1": "square" };

/** Search Pexels and import photos or clips into the video's assets. */
export function StockModal({ format, onClose, onImport }: { format: Format; onClose: () => void; onImport: (item: StockItem) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"photo" | "video">("video");
  const [orientation, setOrientation] = useState(ORIENT[format]);
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const search = async (pg = 1) => {
    if (!query.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ items: StockItem[] }>("motion-stock", { query, type, orientation: orientation || undefined, page: pg });
      setItems(pg === 1 ? r.items : [...(items ?? []), ...r.items]);
      setPage(pg);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  const take = async (it: StockItem) => {
    setImporting((s) => new Set(s).add(it.id));
    setErr(null);
    try {
      await onImport(it);
      setDone((s) => new Set(s).add(it.id));
    } catch (e) {
      setErr((e as Error).message);
    }
    setImporting((s) => {
      const n = new Set(s);
      n.delete(it.id);
      return n;
    });
  };
  return (
    <Modal title="Stock photos and clips" onClose={onClose} wide>
      <div className="row wrap">
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search(1)} placeholder="e.g. lagos market traders, woman laptop office" style={{ flex: 1, minWidth: 220 }} />
        <div className="seg-ctl">
          <button className={type === "video" ? "on" : ""} onClick={() => setType("video")}>Clips</button>
          <button className={type === "photo" ? "on" : ""} onClick={() => setType("photo")}>Photos</button>
        </div>
        <select value={orientation} onChange={(e) => setOrientation(e.target.value)}>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
          <option value="square">Square</option>
          <option value="">Any shape</option>
        </select>
        <button className="btn primary small" disabled={busy || !query.trim()} onClick={() => search(1)}>{busy ? "Searching…" : "Search"}</button>
      </div>
      {err && <p className="error small" style={{ margin: 0 }}>{err}</p>}
      {items && items.length === 0 && <p className="muted small">Nothing found. Try simpler words.</p>}
      {items && items.length > 0 && (
        <div className="stock-grid">
          {items.map((it) => (
            <button key={`${it.type}${it.id}`} className={`stock ${done.has(it.id) ? "done" : ""}`} disabled={importing.has(it.id) || done.has(it.id)} onClick={() => take(it)} title={`${it.alt || "Untitled"} · ${it.credit}`}>
              <img src={it.thumb} alt={it.alt} loading="lazy" />
              {it.type === "video" && <span className="dur">{it.duration}s</span>}
              <span className="credit">{importing.has(it.id) ? "Importing…" : done.has(it.id) ? "Added" : it.credit}</span>
            </button>
          ))}
        </div>
      )}
      <div className="row between">
        <span className="small muted">
          Photos and videos provided by{" "}
          <a href="https://www.pexels.com" target="_blank" rel="noreferrer">Pexels</a>. Free to use; credit is kept with each file.
        </span>
        {items && items.length >= 20 * page && <button className="btn small" disabled={busy} onClick={() => search(page + 1)}>More</button>}
      </div>
    </Modal>
  );
}

const MODELS = [
  { id: "gemini-3.1-flash-image", label: "Fast (Gemini Flash)" },
  { id: "gemini-3-pro-image", label: "Best detail (Gemini Pro)" },
  { id: "gpt-image-2", label: "GPT Image 2" },
];

/** Generate an image with ElevenLabs (it lands in the video's assets). */
export function ImageModal({ format, onClose, onGenerate }: { format: Format; onClose: () => void; onGenerate: (prompt: string, aspect: string, model: string) => Promise<void> }) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<string>(format);
  const [model, setModel] = useState(MODELS[0].id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onGenerate(prompt.trim(), aspect, model);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="AI image" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>Made with ElevenLabs. Describe the subject, setting, light and style. Avoid real people's names, logos and readable documents.</p>
      <label className="field">
        <span>Prompt</span>
        <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A Nigerian shop owner at a bright market stall checking her phone, warm morning light, shallow depth of field, photographic" />
      </label>
      <div className="row wrap">
        <label className="field">
          <span>Shape</span>
          <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
            {["9:16", "1:1", "16:9", "4:5", "4:3", "3:4"].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>
      {err && <p className="error small" style={{ margin: 0 }}>{err}</p>}
      <div className="row between">
        <span className="small muted">{busy ? "This usually takes 10 to 40 seconds. It'll appear in Assets." : ""}</span>
        <button className="btn primary" disabled={busy || prompt.trim().length < 8} onClick={go}>{busy ? "Generating…" : "Generate"}</button>
      </div>
    </Modal>
  );
}

export type EnvatoType = "video" | "photo" | "music" | "sfx";

export interface EnvatoItem {
  title: string;
  author: string;
  type: EnvatoType;
  cover: string | null;
  aspect: number;
  url: string;
}

const ENVATO_TABS: { id: EnvatoType; label: string; accept: string }[] = [
  { id: "video", label: "Clips", accept: "video/*,.mov,.mp4,.webm,.m4v" },
  { id: "photo", label: "Photos", accept: "image/*" },
  { id: "music", label: "Music", accept: "audio/*,.mp3,.wav,.m4a,.aac" },
  { id: "sfx", label: "Sound effects", accept: "audio/*,.mp3,.wav,.m4a,.aac" },
];

/**
 * Search Envato Elements from the studio. Envato has no download API (and its licence asks for
 * each download to be registered to a project), so items open on Envato to download and license,
 * then the file comes back here with the item's link kept for the record.
 */
export function EnvatoModal({ initial, onClose, onAdd }: { initial?: { query?: string; type?: EnvatoType }; onClose: () => void; onAdd: (item: EnvatoItem, file: File) => Promise<void> }) {
  const [query, setQuery] = useState(initial?.query ?? "");
  const [type, setType] = useState<EnvatoType>(initial?.type ?? "video");
  const [items, setItems] = useState<EnvatoItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const search = async (pg = 1, t = type, q = query) => {
    if (!q.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ items: EnvatoItem[]; hasMore: boolean }>("motion-envato", { query: q, type: t, page: pg });
      setItems(pg === 1 ? r.items : [...(items ?? []), ...r.items]);
      setMore(r.hasMore);
      setPage(pg);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  // a request from the script opens with its search already run
  useEffect(() => {
    if (initial?.query) void search(1, initial.type ?? "video", initial.query);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const addFile = (it: EnvatoItem) => {
    const tab = ENVATO_TABS.find((x) => x.id === it.type) ?? ENVATO_TABS[0];
    const i = document.createElement("input");
    i.type = "file";
    i.accept = tab.accept;
    i.onchange = async () => {
      const f = i.files?.[0];
      if (!f) return;
      setAdding(it.url);
      setErr(null);
      try {
        await onAdd(it, f);
        setAdded((s) => new Set(s).add(it.url));
      } catch (e) {
        setErr(`${f.name}: ${(e as Error).message}`);
      }
      setAdding(null);
    };
    i.click();
  };
  return (
    <Modal title="Envato Elements" onClose={onClose} wide>
      <div className="row wrap">
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search(1)} placeholder="e.g. lagos market traders, african woman laptop office, upbeat corporate" style={{ flex: 1, minWidth: 240 }} />
        <div className="seg-ctl">
          {ENVATO_TABS.map((t) => (
            <button
              key={t.id}
              className={type === t.id ? "on" : ""}
              onClick={() => {
                setType(t.id);
                if (query.trim()) void search(1, t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn primary small" disabled={busy || !query.trim()} onClick={() => search(1)}>{busy ? "Searching…" : "Search"}</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Open an item on Envato, download it there and register the licence to this video's project name. Then press <strong>Add file</strong> on the same item and pick the file you downloaded. The Envato link is saved with it.
      </p>
      {err && <p className="error small" style={{ margin: 0 }}>{err}</p>}
      {items && items.length === 0 && <p className="muted small">Nothing found. Try simpler words.</p>}
      {items && items.length > 0 && (
        <div className={`stock-grid ${type === "music" || type === "sfx" ? "audio" : ""}`}>
          {items.map((it) => (
            <div key={it.url} className={`stock envato ${added.has(it.url) ? "done" : ""}`}>
              {it.cover ? <img src={it.cover} alt={it.title} loading="lazy" /> : <div className="audio-cover">♪</div>}
              <div className="envato-meta">
                <span className="ellipsis" title={it.title}>{it.title}</span>
                <span className="muted ellipsis">{it.author}</span>
                <span className="row">
                  <a className="btn small" href={it.url} target="_blank" rel="noreferrer">Open on Envato</a>
                  <button className="btn small primary" disabled={!!adding} onClick={() => addFile(it)}>{adding === it.url ? "Adding…" : added.has(it.url) ? "Added" : "Add file"}</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="row between">
        <span className="small muted">Search by Envato's official catalogue service. Needs your Envato Elements subscription to download.</span>
        {more && <button className="btn small" disabled={busy} onClick={() => search(page + 1)}>More</button>}
      </div>
    </Modal>
  );
}
