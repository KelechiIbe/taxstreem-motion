import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bitmapFor, removeAsset, uploadAudio, uploadImage, type AssetRow } from "../lib/assets";
import { decodeUrl, mix, Playback } from "../lib/audio";
import { Renderer, type Loaded } from "../lib/renderer";
import { api, check, fileUrl, sb, upload } from "../lib/supabase";
import type { Format, VideoSpec } from "../runtime/types";
import { checkSpec } from "../runtime/validate";
import { TopBar, type Me } from "./App";
import { Chat, type MessageRow } from "./Chat";
import { ExportModal, JsonModal, VoiceModal } from "./Modals";
import { Player } from "./Player";

export interface ProjectRow {
  id: string;
  title: string;
  format: Format;
  spec: VideoSpec | null;
  version: number;
  thumb_path: string | null;
}
interface VersionRow {
  id: number;
  n: number;
  note: string;
  source: string;
  created_at: string;
  spec?: VideoSpec;
}
interface JobRow {
  id: string;
  kind: "generate" | "review";
  status: "queued" | "running" | "done" | "error";
  message: string;
  result: any;
  created_at: string;
}
export interface RenderRow {
  id: string;
  version: number;
  format: string;
  path: string;
  size: number;
  created_at: string;
}

const FORMATS: Format[] = ["9:16", "1:1", "16:9"];

export function Studio({ projectId, me }: { projectId: string; me: Me }) {
  const renderer = useMemo(() => new Renderer(), []);
  const playback = useMemo(() => new Playback(), []);
  useEffect(() => () => renderer.destroy(), [renderer]);
  const tRef = useRef(0);

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [renders, setRenders] = useState<RenderRow[]>([]);
  const [job, setJob] = useState<JobRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [viewFormat, setViewFormat] = useState<Format | null>(null);
  const [viewing, setViewing] = useState<VersionRow | null>(null);
  const [loaded, setLoaded] = useState<(Loaded & { key: string }) | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mixed, setMixed] = useState<AudioBuffer | null>(null);
  const [tab, setTab] = useState<"assets" | "versions" | "renders">("assets");
  const [modal, setModal] = useState<null | "voice" | "export" | "json">(null);
  const [autoReview, setAutoReview] = useState(() => localStorage.getItem("motion.autoReview") !== "off");
  const [pendingAttach, setPendingAttach] = useState<string[]>([]);
  const [stage, setStage] = useState<string | null>(null);
  const reviewFor = useRef<number | null>(null);
  const thumbedVersion = useRef<number>(-1);

  renderer.onWarnings = setWarnings;

  // ------------------------------------------------------------ data
  const loadProject = useCallback(async () => {
    const p = check(await sb.from("motion_projects").select("id, title, format, spec, version, thumb_path").eq("id", projectId).single()) as ProjectRow;
    setProject(p);
    return p;
  }, [projectId]);
  const loadMessages = useCallback(async () => setMessages(check(await sb.from("motion_messages").select("*").eq("project_id", projectId).order("id")) as MessageRow[]), [projectId]);
  const loadAssets = useCallback(async () => setAssets(check(await sb.from("motion_assets").select("*").or(`project_id.eq.${projectId},project_id.is.null`).order("created_at")) as AssetRow[]), [projectId]);
  const loadVersions = useCallback(async () => setVersions(check(await sb.from("motion_versions").select("id, n, note, source, created_at").eq("project_id", projectId).order("n", { ascending: false }).limit(60)) as VersionRow[]), [projectId]);
  const loadRenders = useCallback(async () => setRenders(check(await sb.from("motion_renders").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(40)) as RenderRow[]), [projectId]);

  useEffect(() => {
    Promise.all([loadProject(), loadMessages(), loadAssets(), loadVersions(), loadRenders()]).catch((e) => setErr(e.message));
    // pick up a job that was running when the page was closed
    sb.from("motion_jobs")
      .select("*")
      .eq("project_id", projectId)
      .in("status", ["queued", "running"])
      .gte("created_at", new Date(Date.now() - 16 * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .then((r) => r.data?.[0] && setJob(r.data[0] as JobRow));
  }, [projectId, loadProject, loadMessages, loadAssets, loadVersions, loadRenders]);

  // poll the active job
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const timer = setInterval(async () => {
      const { data } = await sb.from("motion_jobs").select("*").eq("id", job.id).single();
      if (!data) return;
      setJob(data as JobRow);
      if (data.status === "done" || data.status === "error") {
        clearInterval(timer);
        const p = await loadProject();
        await Promise.all([loadMessages(), loadVersions()]);
        if (data.status === "done" && data.kind === "generate" && data.result?.version && autoReview) reviewFor.current = data.result.version;
        if (data.status === "done" && p) setViewing(null);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ what's on screen
  const spec: VideoSpec | null = viewing?.spec ?? project?.spec ?? null;
  const format: Format = viewFormat ?? project?.format ?? "9:16";
  const shownVersion = viewing?.n ?? project?.version ?? 0;
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const voice = spec?.audio?.voice ? byId.get(spec.audio.voice) : undefined;
  const music = spec?.audio?.music ? byId.get(spec.audio.music) : undefined;

  useEffect(() => {
    if (!spec || !spec.scenes?.length) {
      setLoaded(null);
      return;
    }
    let live = true;
    (async () => {
      // send the screenshots this spec uses to the renderer
      const wanted = new Set<string>();
      for (const s of spec.scenes) {
        if (s.type === "screenshot" && s.props?.image) wanted.add(String(s.props.image));
        if (s.type === "custom" && typeof s.props?.code === "string") for (const a of assets) if (a.kind === "image" && s.props.code.includes(a.id)) wanted.add(a.id);
      }
      const need = [...wanted].filter((id) => !renderer.hasImage(id) && byId.get(id)?.kind === "image");
      if (need.length) {
        setStage("Loading screenshots");
        const imgs: Record<string, ImageBitmap> = {};
        await Promise.all(need.map(async (id) => (imgs[id] = await bitmapFor(byId.get(id)!).catch(() => null as any))));
        Object.keys(imgs).forEach((k) => !imgs[k] && delete imgs[k]);
        renderer.sendImages(imgs, tRef.current);
      }
      setStage(null);
      const info = await renderer.load(spec, format, { words: voice?.meta?.words, beats: music?.meta?.beats, t: tRef.current, scale: 0.7 });
      if (!live) return;
      setLoaded({ ...info, key: `${shownVersion}:${format}:${viewing ? "v" : "c"}` });
      setWarnings(info.warnings);
    })().catch((e) => {
      if (e.message !== "superseded") setErr(e.message);
    });
    return () => {
      live = false;
    };
  }, [spec, format, assets]); // eslint-disable-line react-hooks/exhaustive-deps

  // audio mix for preview and export
  useEffect(() => {
    let live = true;
    const dur = loaded?.duration ?? 0;
    if (!spec || dur <= 0 || (!voice && !music)) {
      setMixed(null);
      playback.buffer = null;
      return;
    }
    (async () => {
      const [v, m] = await Promise.all([voice ? decodeUrl(voice.id, await fileUrl(voice.path)) : null, music ? decodeUrl(music.id, await fileUrl(music.path)) : null]);
      const buf = await mix({ duration: dur, voice: v, music: m, voiceVolume: spec.audio?.voiceVolume, voiceDelay: spec.audio?.voiceDelay, musicVolume: spec.audio?.musicVolume, musicStart: spec.audio?.musicStart, duck: spec.audio?.duck });
      if (!live) return;
      setMixed(buf);
      playback.buffer = buf;
    })().catch((e) => setErr(`Audio: ${e.message}`));
    return () => {
      live = false;
    };
  }, [loaded?.duration, JSON.stringify(spec?.audio ?? null), voice?.id, music?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // after each new current version: poster thumbnail, then (once per AI version) the frame review
  useEffect(() => {
    if (!project || !loaded || viewing || !project.spec?.scenes?.length) return;
    if (!loaded.key.startsWith(`${project.version}:`)) return;
    const v = project.version;
    (async () => {
      if (thumbedVersion.current !== v) {
        thumbedVersion.current = v;
        const { blob } = await renderer.still(Math.min(loaded.duration * 0.25, 2.8), 0.35);
        const path = `motion/${project.id}/thumb.jpg`;
        await upload(path, blob, "image/jpeg");
        await sb.from("motion_projects").update({ thumb_path: path }).eq("id", project.id);
      }
      if (reviewFor.current === v && (!job || job.status === "done" || job.status === "error")) {
        reviewFor.current = null;
        await runReview(v);
      }
    })().catch((e) => console.warn(e));
  }, [loaded?.key, project?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------ actions
  const startJob = async (payload: Record<string, unknown>) => {
    setErr(null);
    const r = await api<{ jobId: string }>("motion-start", { projectId, ...payload });
    setJob({ id: r.jobId, kind: payload.kind as any, status: "queued", message: "Starting", result: null, created_at: new Date().toISOString() });
    await loadMessages();
  };

  const send = async (text: string) => {
    try {
      const attachments = pendingAttach;
      setPendingAttach([]);
      await startJob({ kind: "generate", text, attachments });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const runReview = async (v: number) => {
    setStage("Rendering frames for review");
    try {
      const sheet = await renderer.sheet();
      const path = `motion/${projectId}/review-v${v}-${format.replace(":", "x")}.jpg`;
      await upload(path, sheet.blob, "image/jpeg");
      await startJob({ kind: "review", review: { version: v, sheetPath: path, warnings: sheet.warnings, format } });
    } catch (e) {
      setErr(`Review: ${(e as Error).message}`);
    } finally {
      setStage(null);
    }
  };

  const onFiles = async (files: File[], kind?: "audio" | "voice") => {
    setErr(null);
    for (const f of files) {
      try {
        setStage(`Uploading ${f.name}`);
        let row: AssetRow;
        if (f.type.startsWith("image/")) row = await uploadImage(projectId, f);
        else if (f.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name)) row = await uploadAudio(projectId, f, kind ?? (/voice|vo\b|narration/i.test(f.name) ? "voice" : "audio"));
        else {
          setErr(`${f.name}: only images and audio files are supported.`);
          continue;
        }
        setAssets((a) => [...a, row]);
        setPendingAttach((p) => [...p, row.id]);
      } catch (e) {
        setErr(`${f.name}: ${(e as Error).message}`);
      }
    }
    setStage(null);
  };

  const saveManual = async (next: VideoSpec, note: string, source: "manual" | "restore") => {
    if (!project) return;
    const ids = { imageIds: new Set(assets.filter((a) => a.kind === "image").map((a) => a.id)), audioIds: new Set(assets.filter((a) => a.kind !== "image").map((a) => a.id)), format: project.format };
    const c = checkSpec(next, ids);
    if (c.errors.length) throw new Error(c.errors.join(" "));
    const n = project.version + 1;
    check(await sb.from("motion_versions").insert({ project_id: project.id, n, spec: c.spec, note, source }));
    check(await sb.from("motion_projects").update({ spec: c.spec, version: n, title: c.spec.title || project.title }).eq("id", project.id));
    await sb.from("motion_messages").insert({ project_id: project.id, role: "system", content: `${me.name} ${source === "restore" ? "restored" : "edited"} the video: ${note}`, data: { version: n } });
    setViewing(null);
    await Promise.all([loadProject(), loadVersions(), loadMessages()]);
  };

  const viewVersion = async (n: number) => {
    if (project && n === project.version) return setViewing(null);
    const row = check(await sb.from("motion_versions").select("*").eq("project_id", projectId).eq("n", n).single()) as VersionRow;
    setViewing(row);
  };

  const renameProject = async (title: string) => {
    if (!project || !title.trim() || title === project.title) return;
    await sb.from("motion_projects").update({ title: title.trim() }).eq("id", project.id);
    setProject({ ...project, title: title.trim() });
  };

  const busyJob = job && (job.status === "queued" || job.status === "running") ? job : null;
  const canDelete = me.role === "admin" || me.role === "producer";

  if (!project) return <div className="center muted">{err ?? "Loading…"}</div>;
  return (
    <div className="studio">
      <TopBar me={me}>
        <a href="#/" className="btn ghost small">← Videos</a>
        <input className="title-input" defaultValue={project.title} onBlur={(e) => renameProject(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <div className="seg-ctl" role="tablist" aria-label="Preview format">
          {FORMATS.map((f) => (
            <button key={f} className={format === f ? "on" : ""} onClick={() => setViewFormat(f)}>{f}</button>
          ))}
        </div>
        <button className="btn primary small" disabled={!loaded} onClick={() => setModal("export")}>Export</button>
      </TopBar>
      <div className="studio-body">
        <Chat
          messages={messages}
          job={busyJob}
          lastError={job?.status === "error" ? job.message : null}
          assets={byId}
          pending={pendingAttach}
          setPending={setPendingAttach}
          empty={!project.spec?.scenes?.length}
          onSend={send}
          onFiles={onFiles}
          onVoice={() => setModal("voice")}
          onViewVersion={viewVersion}
          currentVersion={project.version}
          disabled={!!busyJob}
        />
        <section className="stage">
          {viewing && (
            <div className="banner">
              Viewing version {viewing.n}{viewing.note ? ` · ${viewing.note}` : ""}
              <span className="row">
                <button className="btn small" onClick={() => saveManual(viewing.spec!, `Restored version ${viewing.n}`, "restore").catch((e) => setErr(e.message))}>Restore this version</button>
                <button className="btn ghost small" onClick={() => setViewing(null)}>Back to latest</button>
              </span>
            </div>
          )}
          {err && (
            <div className="banner error-banner">
              {err}
              <button className="btn ghost small" onClick={() => setErr(null)}>Dismiss</button>
            </div>
          )}
          <Player renderer={renderer} duration={loaded?.duration ?? 0} timings={loaded?.timings ?? []} format={format} playback={playback} busy={stage} tRef={tRef} />
          {warnings.length > 0 && (
            <ul className="warnings">
              {warnings.slice(0, 6).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </section>
        <aside className="side">
          <div className="tabs">
            {(["assets", "versions", "renders"] as const).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "assets" ? "Assets" : t === "versions" ? `Versions${project.version ? ` (${project.version})` : ""}` : "Renders"}
              </button>
            ))}
          </div>
          {tab === "assets" && <AssetsPanel assets={assets.filter((a) => a.project_id === projectId)} spec={spec} canDelete={canDelete} onUse={(id) => setPendingAttach((p) => (p.includes(id) ? p : [...p, id]))} onDelete={async (a) => { await removeAsset(a).catch((e) => setErr(e.message)); await loadAssets(); }} onVoice={() => setModal("voice")} onFiles={onFiles} />}
          {tab === "versions" && (
            <div className="list">
              {versions.length === 0 && <p className="muted small pad">No versions yet.</p>}
              {versions.map((v) => (
                <button key={v.id} className={`item ${shownVersion === v.n ? "on" : ""}`} onClick={() => viewVersion(v.n)}>
                  <strong>v{v.n}</strong> <span className={`tag ${v.source}`}>{v.source === "ai" ? "Claude" : v.source === "review" ? "Review fix" : v.source}</span>
                  <div className="small muted">{v.note || "—"}</div>
                  <div className="small muted">{new Date(v.created_at).toLocaleString()}</div>
                </button>
              ))}
            </div>
          )}
          {tab === "renders" && <RendersPanel renders={renders} />}
          <div className="side-foot stack">
            <label className="row small">
              <input type="checkbox" checked={autoReview} onChange={(e) => { setAutoReview(e.target.checked); localStorage.setItem("motion.autoReview", e.target.checked ? "on" : "off"); }} />
              Claude reviews rendered frames after each version
            </label>
            <div className="row wrap">
              <button className="btn small" disabled={!loaded || !!busyJob || !!viewing} onClick={() => runReview(project.version)}>Review frames now</button>
              <button className="btn small" disabled={!spec} onClick={() => setModal("json")}>Edit spec</button>
            </div>
          </div>
        </aside>
      </div>
      {modal === "voice" && (
        <VoiceModal
          projectId={projectId}
          onClose={() => setModal(null)}
          onCreated={(a) => {
            setAssets((x) => [...x, a]);
            setPendingAttach((p) => [...p, a.id]);
            setModal(null);
          }}
          onUpload={(f) => {
            setModal(null);
            onFiles([f], "voice");
          }}
        />
      )}
      {modal === "export" && spec && <ExportModal renderer={renderer} spec={spec} project={project} version={shownVersion} mixed={mixed} defaultFormat={format} onClose={() => setModal(null)} onSaved={loadRenders} />}
      {modal === "json" && spec && <JsonModal spec={spec} onClose={() => setModal(null)} onSave={async (s, note) => { await saveManual(s, note, "manual"); setModal(null); }} />}
    </div>
  );
}

function AssetsPanel({ assets, spec, canDelete, onUse, onDelete, onVoice, onFiles }: { assets: AssetRow[]; spec: VideoSpec | null; canDelete: boolean; onUse: (id: string) => void; onDelete: (a: AssetRow) => void; onVoice: () => void; onFiles: (f: File[], kind?: "audio" | "voice") => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    assets.forEach((a) => {
      if (urls[a.id]) return;
      fileUrl(a.kind === "image" ? a.meta?.preview || a.path : a.path).then((u) => setUrls((x) => ({ ...x, [a.id]: u })), () => {});
    });
  }, [assets]); // eslint-disable-line react-hooks/exhaustive-deps
  const used = new Set<string>([spec?.audio?.voice, spec?.audio?.music, ...(spec?.scenes ?? []).map((s) => s.props?.image)].filter(Boolean) as string[]);
  const pick = (accept: string, kind?: "audio" | "voice") => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = accept;
    i.multiple = true;
    i.onchange = () => onFiles([...(i.files ?? [])], kind);
    i.click();
  };
  return (
    <div className="list">
      <div className="row wrap pad">
        <button className="btn small" onClick={() => pick("image/*")}>+ Screenshot</button>
        <button className="btn small" onClick={() => pick("audio/*", "audio")}>+ Music</button>
        <button className="btn small" onClick={onVoice}>+ Voiceover</button>
      </div>
      {assets.length === 0 && <p className="muted small pad">Upload product screenshots (PNG), music from Envato, or make a voiceover. Claude sees screenshots and times scenes to your audio.</p>}
      {assets.map((a) => (
        <div key={a.id} className="asset">
          {a.kind === "image" ? <img src={urls[a.id]} alt="" /> : <div className="audio-ico">{a.kind === "voice" ? "VO" : "♪"}</div>}
          <div className="asset-meta">
            <div className="small ellipsis" title={a.name}>{a.name}</div>
            <div className="small muted">
              {a.kind === "image" ? `${a.meta.width}×${a.meta.height}` : `${Number(a.meta.duration ?? 0).toFixed(1)}s`}
              {a.meta.bpm ? ` · ${Math.round(a.meta.bpm)} BPM` : ""}
              {a.kind === "voice" ? (a.meta.words?.length ? " · timed" : " · no timings") : ""}
              {used.has(a.id) ? " · in video" : ""}
            </div>
            {a.kind !== "image" && urls[a.id] && <audio controls preload="none" src={urls[a.id]} />}
            <div className="row">
              <button className="link small" onClick={() => onUse(a.id)}>Mention in chat</button>
              {canDelete && <button className="link small danger" onClick={() => confirm(`Delete ${a.name}?`) && onDelete(a)}>Delete</button>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RendersPanel({ renders }: { renders: RenderRow[] }) {
  const open = async (r: RenderRow) => window.open(await fileUrl(r.path), "_blank");
  return (
    <div className="list">
      {renders.length === 0 && <p className="muted small pad">Exports you save appear here for the whole team.</p>}
      {renders.map((r) => (
        <button key={r.id} className="item" onClick={() => open(r)}>
          <strong>v{r.version} · {r.format}</strong>
          <div className="small muted">{(r.size / 1e6).toFixed(1)} MB · {new Date(r.created_at).toLocaleString()}</div>
        </button>
      ))}
    </div>
  );
}
