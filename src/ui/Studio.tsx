import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bitmapFor, removeAsset, uploadAudio, uploadImage, type AssetRow } from "../lib/assets";
import { decodeUrl, mix, Playback } from "../lib/audio";
import { DOC_ACCEPT, isDocument, uploadDocument } from "../lib/documents";
import { assetBlob, ensurePreview, uploadSample, uploadVideo } from "../lib/media";
import { deleteProject } from "../lib/projects";
import { Renderer, type Loaded } from "../lib/renderer";
import { api, check, fileUrl, sb, upload } from "../lib/supabase";
import { clipSounds, mediaIds } from "../runtime/audioplan";
import { getLook } from "../runtime/looks";
import type { Format, PaletteSpec, Script, VideoSpec } from "../runtime/types";
import { checkSpec } from "../runtime/validate";
import { TopBar, type Me } from "./App";
import { Chat, type MessageRow } from "./Chat";
import { EnvatoModal, ImageModal, StockModal, StyleModal, type EnvatoItem, type EnvatoType, type StockItem } from "./MediaModals";
import { ExportModal, JsonModal, VoiceModal } from "./Modals";
import { Player } from "./Player";
import { SceneDirector, type Direction } from "./SceneDirector";
import { ScriptEditor } from "./ScriptEditor";

export interface ProjectRow {
  id: string;
  title: string;
  format: Format;
  spec: VideoSpec | null;
  version: number;
  thumb_path: string | null;
  script: Script | null;
  stage: "script" | "video";
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
  kind: "generate" | "review" | "script" | "import" | "imagegen";
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
const VIDEO_FILE = /\.(mp4|mov|m4v|webm|mkv)$/i;
const AUDIO_FILE = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;

/** Polls a background job until it finishes. */
async function waitJob(id: string, onMessage?: (m: string) => void): Promise<JobRow> {
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await sb.from("motion_jobs").select("*").eq("id", id).single();
    if (!data) continue;
    onMessage?.(data.message);
    if (data.status === "done") return data as JobRow;
    if (data.status === "error") throw new Error(data.message || "The task failed");
  }
}

export function Studio({ projectId, me }: { projectId: string; me: Me }) {
  const renderer = useMemo(() => new Renderer(), []);
  const playback = useMemo(() => new Playback(), []);
  useEffect(() => () => renderer.destroy(), [renderer]);
  const tRef = useRef(0);

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [mode, setMode] = useState<"script" | "video">("video");
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
  const [modal, setModal] = useState<null | "voice" | "export" | "json" | "style" | "stock" | "image" | "envato">(null);
  const [director, setDirector] = useState<{ sceneId: string; index: number; mode: "script" | "video" } | null>(null);
  const [envatoAsk, setEnvatoAsk] = useState<{ query?: string; type?: EnvatoType; sceneId?: string; request?: string } | null>(null);
  const [pexelsOn, setPexelsOn] = useState(false);
  const [voiceText, setVoiceText] = useState<{ text: string; direction?: string } | null>(null);
  const [autoReview, setAutoReview] = useState(() => localStorage.getItem("motion.autoReview") !== "off");
  const [pendingAttach, setPendingAttach] = useState<string[]>([]);
  const [stage, setStage] = useState<string | null>(null);
  const reviewFor = useRef<number | null>(null);
  const thumbedVersion = useRef<number>(-1);
  const modeSet = useRef(false);

  renderer.onWarnings = setWarnings;

  // ------------------------------------------------------------ data
  const loadProject = useCallback(async () => {
    const p = check(await sb.from("motion_projects").select("id, title, format, spec, version, thumb_path, script, stage").eq("id", projectId).single()) as ProjectRow;
    setProject(p);
    if (!modeSet.current) {
      modeSet.current = true;
      setMode(p.stage === "script" || (!p.spec?.scenes?.length && p.script) ? "script" : "video");
    }
    return p;
  }, [projectId]);
  const loadMessages = useCallback(async () => setMessages(check(await sb.from("motion_messages").select("*").eq("project_id", projectId).order("id")) as MessageRow[]), [projectId]);
  const loadAssets = useCallback(async () => {
    const rows = check(await sb.from("motion_assets").select("*").or(`project_id.eq.${projectId},project_id.is.null`).order("created_at")) as AssetRow[];
    setAssets(rows);
    return rows;
  }, [projectId]);
  const loadVersions = useCallback(async () => setVersions(check(await sb.from("motion_versions").select("id, n, note, source, created_at").eq("project_id", projectId).order("n", { ascending: false }).limit(60)) as VersionRow[]), [projectId]);
  const loadRenders = useCallback(async () => setRenders(check(await sb.from("motion_renders").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(40)) as RenderRow[]), [projectId]);

  useEffect(() => {
    api<Record<string, { set: boolean }>>("motion-keys").then((k) => setPexelsOn(!!k.pexels?.set), () => {});
  }, []);

  useEffect(() => {
    Promise.all([loadProject(), loadMessages(), loadAssets(), loadVersions(), loadRenders()]).catch((e) => setErr(e.message));
    // pick up a Claude job that was running when the page was closed
    sb.from("motion_jobs")
      .select("*")
      .eq("project_id", projectId)
      .in("status", ["queued", "running"])
      .in("kind", ["generate", "review", "script"])
      .gte("created_at", new Date(Date.now() - 16 * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .then((r) => r.data?.[0] && setJob(r.data[0] as JobRow));
  }, [projectId, loadProject, loadMessages, loadAssets, loadVersions, loadRenders]);

  // server-made images (AI images) get the small preview Claude looks at
  useEffect(() => {
    const todo = assets.filter((a) => a.kind === "image" && a.project_id === projectId && !a.meta?.preview);
    if (!todo.length) return;
    Promise.all(todo.map((a) => ensurePreview(a).catch(() => null))).then((rows) => {
      const done = rows.filter(Boolean) as AssetRow[];
      if (done.length) setAssets((x) => x.map((a) => done.find((d) => d.id === a.id) ?? a));
    });
  }, [assets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // poll the active Claude job
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const timer = setInterval(async () => {
      const { data } = await sb.from("motion_jobs").select("*").eq("id", job.id).single();
      if (!data) return;
      setJob(data as JobRow);
      if (data.status === "done" || data.status === "error") {
        clearInterval(timer);
        const p = await loadProject();
        await Promise.all([loadMessages(), loadVersions(), loadAssets()]);
        if (data.status === "done" && data.kind === "generate" && data.result?.version && autoReview) reviewFor.current = data.result.version;
        if (data.status === "done" && data.kind === "generate" && data.result?.version) setMode("video");
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
      // hand the renderer every image and clip this spec uses
      const wanted = mediaIds(spec);
      for (const s of spec.scenes) if (s.type === "custom" && typeof s.props?.code === "string") for (const a of assets) if ((a.kind === "image" || a.kind === "video") && s.props.code.includes(a.id)) wanted.add(a.id);
      const imgs = [...wanted].filter((id) => byId.get(id)?.kind === "image" && !renderer.hasImage(id));
      const clips = [...wanted].filter((id) => byId.get(id)?.kind === "video" && !renderer.hasVideo(id));
      if (imgs.length || clips.length) setStage(clips.length ? "Loading clips" : "Loading images");
      if (imgs.length) {
        const out: Record<string, ImageBitmap> = {};
        await Promise.all(imgs.map(async (id) => (out[id] = await bitmapFor(byId.get(id)!).catch(() => null as any))));
        Object.keys(out).forEach((k) => !out[k] && delete out[k]);
        renderer.sendImages(out, tRef.current);
      }
      for (const id of clips) {
        const r = await renderer.sendVideo(id, await assetBlob(byId.get(id)!), tRef.current);
        if (!r.ok && live) setErr(`${byId.get(id)?.name}: ${r.message}`);
      }
      setStage(null);
      const info = await renderer.load(spec, format, { words: voice?.meta?.words, beats: music?.meta?.beats, t: tRef.current, scale: 0.7 });
      if (!live) return;
      setLoaded({ ...info, key: `${shownVersion}:${format}:${viewing ? "v" : "c"}` });
      setWarnings(info.warnings);
    })().catch((e) => {
      if (e.message !== "superseded") setErr(e.message);
      setStage(null);
    });
    return () => {
      live = false;
    };
  }, [spec, format, assets]); // eslint-disable-line react-hooks/exhaustive-deps

  // audio mix for preview and export: voice, music and any clip sound
  const sounds = useMemo(() => (spec && loaded ? clipSounds(spec, loaded.timings, (id) => byId.get(id)?.kind === "video") : []), [spec, loaded?.timings, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    const dur = loaded?.duration ?? 0;
    if (!spec || dur <= 0 || (!voice && !music && !sounds.length)) {
      setMixed(null);
      playback.buffer = null;
      return;
    }
    (async () => {
      const [v, m] = await Promise.all([voice ? decodeUrl(voice.id, await fileUrl(voice.path)) : null, music ? decodeUrl(music.id, await fileUrl(music.path)) : null]);
      const clips = await Promise.all(
        sounds.map(async (c) => {
          const a = byId.get(c.asset);
          const buffer = a ? await decodeUrl(`clip:${a.id}`, await fileUrl(a.path)).catch(() => null) : null;
          return { ...c, buffer };
        }),
      );
      const buf = await mix({ duration: dur, voice: v, music: m, voiceVolume: spec.audio?.voiceVolume, voiceDelay: spec.audio?.voiceDelay, musicVolume: spec.audio?.musicVolume, musicStart: spec.audio?.musicStart, duck: spec.audio?.duck, clips });
      if (!live) return;
      setMixed(buf);
      playback.buffer = buf;
    })().catch((e) => setErr(`Audio: ${e.message}`));
    return () => {
      live = false;
    };
  }, [loaded?.duration, JSON.stringify(spec?.audio ?? null), voice?.id, music?.id, JSON.stringify(sounds)]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /** Stock imports and AI images run in the background without blocking the chat. */
  const mediaJob = async (payload: Record<string, unknown>, label: string) => {
    const r = await api<{ jobId: string }>("motion-start", { projectId, ...payload });
    setStage(label);
    try {
      const done = await waitJob(r.jobId, (m) => setStage(`${label}: ${m}`));
      await loadAssets();
      const id = done.result?.assetId;
      if (id) setPendingAttach((p) => (p.includes(id) ? p : [...p, id]));
    } finally {
      setStage(null);
    }
  };

  const send = async (text: string) => {
    try {
      const attachments = pendingAttach;
      setPendingAttach([]);
      await startJob({ kind: mode === "script" ? "script" : "generate", text, attachments });
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

  /** Uploads one file as the right kind of asset. */
  const uploadOne = async (f: File, kind?: "audio" | "voice" | "sample"): Promise<AssetRow> => {
    setStage(`Uploading ${f.name}`);
    const isVideo = f.type.startsWith("video/") || VIDEO_FILE.test(f.name);
    if (kind === "sample") {
      if (!isVideo) throw new Error("A sample should be a video file (MP4, MOV or WebM).");
      return uploadSample(projectId, f, setStage);
    }
    if (!kind && isDocument(f)) return uploadDocument(projectId, f);
    if (isVideo) return uploadVideo(projectId, f, setStage);
    if (f.type.startsWith("image/")) return uploadImage(projectId, f);
    if (f.type.startsWith("audio/") || AUDIO_FILE.test(f.name)) return uploadAudio(projectId, f, kind === "voice" || kind === "audio" ? kind : /voice|vo\b|narration/i.test(f.name) ? "voice" : "audio");
    throw new Error("Use images, video clips, audio, or Word, PDF and text documents.");
  };

  const onFiles = async (files: File[], kind?: "audio" | "voice" | "sample") => {
    setErr(null);
    for (const f of files) {
      try {
        const row = await uploadOne(f, kind);
        setAssets((a) => [...a, row]);
        setPendingAttach((p) => [...p, row.id]);
      } catch (e) {
        setErr(`${f.name}: ${(e as Error).message}`);
      }
    }
    setStage(null);
  };

  /** A file downloaded from Envato: upload it, keep the item's link with it, and fill the script's request. */
  const addEnvato = async (item: EnvatoItem, file: File) => {
    try {
      const row = await uploadOne(file, item.type === "music" || item.type === "sfx" ? "audio" : undefined);
      const meta = { ...row.meta, source: "envato", title: item.title, credit: item.author, pageUrl: item.url, licensedFor: project?.title ?? "" };
      const saved = check(await sb.from("motion_assets").update({ meta, name: row.name || item.title }).eq("id", row.id).select("*").single()) as AssetRow;
      setAssets((a) => [...a, saved]);
      setPendingAttach((p) => [...p, saved.id]);
      const ask = envatoAsk;
      if (ask?.sceneId && ask.request && project?.script) {
        const script = { ...project.script, scenes: project.script.scenes.map((sc) => (sc.id === ask.sceneId ? { ...sc, media: (sc.media ?? []).map((m) => (m === ask.request ? saved.id : m)) } : sc)) };
        await saveScript(script);
        setEnvatoAsk(null);
      }
    } finally {
      setStage(null);
    }
  };

  const idsFor = () => ({
    imageIds: new Set(assets.filter((a) => a.kind === "image").map((a) => a.id)),
    videoIds: new Set(assets.filter((a) => a.kind === "video").map((a) => a.id)),
    audioIds: new Set(assets.filter((a) => a.kind === "audio" || a.kind === "voice").map((a) => a.id)),
    format: project!.format,
  });

  const saveManual = async (next: VideoSpec, note: string, source: "manual" | "restore") => {
    if (!project) return;
    const c = checkSpec(next, idsFor());
    if (c.errors.length) throw new Error(c.errors.join(" "));
    const n = project.version + 1;
    check(await sb.from("motion_versions").insert({ project_id: project.id, n, spec: c.spec, note, source }));
    check(await sb.from("motion_projects").update({ spec: c.spec, version: n, title: c.spec.title || project.title }).eq("id", project.id));
    await sb.from("motion_messages").insert({ project_id: project.id, role: "system", content: `${me.name} ${source === "restore" ? "restored" : "edited"} the video: ${note}`, data: { version: n } });
    setViewing(null);
    await Promise.all([loadProject(), loadVersions(), loadMessages()]);
  };

  const saveScript = async (s: Script) => {
    if (!project) return;
    check(await sb.from("motion_projects").update({ script: s }).eq("id", project.id));
    setProject((p) => (p ? { ...p, script: s } : p));
  };

  /** Saves the team's direction for one scene; in the video it also asks Claude to rebuild just that scene. */
  const applyDirection = async (dir: { sceneId: string; index: number; mode: "script" | "video" }, d: Direction) => {
    if (!project) return;
    const script = project.script;
    if (script?.scenes.some((x) => x.id === dir.sceneId)) {
      const scenes = script.scenes.map((x) => (x.id === dir.sceneId ? { ...x, media: d.media, motion: d.motion || undefined, focus: d.focus.length ? d.focus : undefined } : x));
      // In the script this is an edit like any other (it needs approving again); in the video it records what was asked.
      await saveScript({ ...script, scenes, approvedAt: dir.mode === "script" ? undefined : script.approvedAt });
    }
    if (dir.mode === "video") {
      const name = (id: string) => assets.find((a) => a.id === id)?.name ?? id;
      const pics = d.media.filter((m) => assets.some((a) => a.id === m));
      const lines = [
        `Rework scene ${dir.index + 1} (id ${dir.sceneId}) only. Keep every other scene exactly as it is.`,
        pics.length ? `Pictures, in this order: ${pics.map((id) => `"${id}" (${name(id)})`).join(", ")}.` : "No pictures in this scene: keep it to words and graphics.",
        ...(d.focus.length
          ? [`Camera marks, in the order to visit them (fractions of the picture): ${d.focus.map((f, i) => `${i + 1}) on "${f.asset}" x ${f.x}, y ${f.y}, w ${f.w}, h ${f.h}${f.label ? `, label "${f.label}"` : ""}`).join("; ")}.`]
          : []),
        `How it should move: ${d.motion || "your call, make it lively and clear"}`,
      ];
      await startJob({ kind: "generate", text: lines.join("\n"), attachments: pics });
      setDirector(null);
      return;
    }
    setDirector(null);
  };

  const approve = async (s: Script) => {
    if (!project) return;
    try {
      const approved = { ...s, approvedAt: new Date().toISOString() };
      check(await sb.from("motion_projects").update({ script: approved, format: s.format, title: s.title || project.title }).eq("id", project.id));
      setProject({ ...project, script: approved, format: s.format });
      await startJob({ kind: "generate", fromScript: true, text: "Build the video from the approved script." });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const applyStyle = async (look: string, palette: PaletteSpec) => {
    if (!spec) return;
    const name = getLook(look).name;
    await saveManual({ ...spec, look, palette }, `Style: ${name}${palette === "look" ? " in its own colours" : typeof palette === "object" ? " in custom colours" : ""}`, "manual");
    setModal(null);
  };

  const viewVersion = async (n: number) => {
    setMode("video");
    if (project && n === project.version) return setViewing(null);
    const row = check(await sb.from("motion_versions").select("*").eq("project_id", projectId).eq("n", n).single()) as VersionRow;
    setViewing(row);
  };

  const renameProject = async (title: string) => {
    if (!project || !title.trim() || title === project.title) return;
    await sb.from("motion_projects").update({ title: title.trim() }).eq("id", project.id);
    setProject({ ...project, title: title.trim() });
  };

  const switchMode = async (m: "script" | "video") => {
    setMode(m);
    if (project && project.stage !== m && (m === "script" || project.spec?.scenes?.length)) {
      await sb.from("motion_projects").update({ stage: m }).eq("id", project.id);
      setProject({ ...project, stage: m });
    }
  };

  const busyJob = job && (job.status === "queued" || job.status === "running") ? job : null;
  const canDelete = me.role === "admin" || me.role === "producer";
  const removeVideo = async () => {
    if (!project || !confirm(`Delete "${project.title}"?\n\nThis removes the video with its script, every version, the chat, renders and uploaded files. It can't be undone.`)) return;
    try {
      setStage("Deleting the video");
      await deleteProject(project.id);
      location.hash = "#/";
    } catch (e) {
      setErr((e as Error).message);
      setStage(null);
    }
  };
  const hasVideo = !!project?.spec?.scenes?.length;

  if (!project) return <div className="center muted">{err ?? "Loading…"}</div>;
  return (
    <div className="studio">
      <TopBar me={me}>
        <a href="#/" className="btn ghost small">← Videos</a>
        <input className="title-input" defaultValue={project.title} onBlur={(e) => renameProject(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <div className="seg-ctl" role="tablist" aria-label="Script or video">
          <button className={mode === "script" ? "on" : ""} onClick={() => switchMode("script")}>Script</button>
          <button className={mode === "video" ? "on" : ""} onClick={() => switchMode("video")}>Video</button>
        </div>
        {mode === "video" && (
          <>
            <div className="seg-ctl" role="tablist" aria-label="Preview format">
              {FORMATS.map((f) => (
                <button key={f} className={format === f ? "on" : ""} onClick={() => setViewFormat(f)}>{f}</button>
              ))}
            </div>
            <button className="btn small" disabled={!spec || !!viewing} onClick={() => setModal("style")} title="Style and colours">
              Style: {getLook(spec?.look).name}
            </button>
            <button className="btn primary small" disabled={!loaded} onClick={() => setModal("export")}>Export</button>
          </>
        )}
      </TopBar>
      <div className="studio-body">
        <Chat
          mode={mode}
          messages={messages}
          job={busyJob}
          lastError={job?.status === "error" ? job.message : null}
          assets={byId}
          pending={pendingAttach}
          setPending={setPendingAttach}
          empty={mode === "script" ? !project.script : !hasVideo}
          onSend={send}
          onFiles={onFiles}
          onVoice={() => {
            setVoiceText(null);
            setModal("voice");
          }}
          onViewVersion={viewVersion}
          currentVersion={project.version}
          disabled={!!busyJob}
        />
        <section className="stage">
          {err && (
            <div className="banner error-banner">
              {err}
              <button className="btn ghost small" onClick={() => setErr(null)}>Dismiss</button>
            </div>
          )}
          {mode === "script" ? (
            <ScriptEditor
              script={project.script}
              assets={assets}
              onDirect={(sceneId) => setDirector({ sceneId, index: Math.max(0, project.script?.scenes.findIndex((x) => x.id === sceneId) ?? 0), mode: "script" })}
              onFindEnvato={(sceneId, request) => {
                const m = request.match(/^envato:(?:(video|clip|photo|image|music|sfx|sound):)?(.*)$/i);
                const t = (m?.[1] ?? "video").toLowerCase();
                setEnvatoAsk({ sceneId, request, query: (m?.[2] ?? "").trim(), type: t === "clip" ? "video" : t === "image" ? "photo" : t === "sound" ? "sfx" : (t as EnvatoType) });
                setModal("envato");
              }}
              busy={!!busyJob}
              hasVideo={hasVideo}
              onSave={saveScript}
              onApprove={approve}
              onVoiceover={(text, direction) => {
                setVoiceText({ text, direction });
                setModal("voice");
              }}
            />
          ) : (
            <>
              {viewing && (
                <div className="banner">
                  Viewing version {viewing.n}{viewing.note ? ` · ${viewing.note}` : ""}
                  <span className="row">
                    <button className="btn small" onClick={() => saveManual(viewing.spec!, `Restored version ${viewing.n}`, "restore").catch((e) => setErr(e.message))}>Restore this version</button>
                    <button className="btn ghost small" onClick={() => setViewing(null)}>Back to latest</button>
                  </span>
                </div>
              )}
              {!hasVideo && project.script && (
                <div className="banner">
                  The script is ready for review.
                  <button className="btn small" onClick={() => switchMode("script")}>Open the script</button>
                </div>
              )}
              <Player renderer={renderer} duration={loaded?.duration ?? 0} timings={loaded?.timings ?? []} format={format} playback={playback} busy={stage} directBusy={!!busyJob} tRef={tRef} onDirect={viewing ? undefined : (sceneId, index) => setDirector({ sceneId, index, mode: "video" })} />
              {warnings.length > 0 && (
                <ul className="warnings">
                  {warnings.slice(0, 6).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {mode === "script" && stage && <div className="banner"><span><span className="spinner" /> {stage}</span></div>}
        </section>
        <aside className="side">
          <div className="tabs">
            {(["assets", "versions", "renders"] as const).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "assets" ? "Assets" : t === "versions" ? `Versions${project.version ? ` (${project.version})` : ""}` : "Renders"}
              </button>
            ))}
          </div>
          {tab === "assets" && (
            <AssetsPanel
              assets={assets.filter((a) => a.project_id === projectId)}
              spec={spec}
              script={project.script}
              canDelete={canDelete}
              onUse={(id) => setPendingAttach((p) => (p.includes(id) ? p : [...p, id]))}
              onDelete={async (a) => {
                await removeAsset(a).catch((e) => setErr(e.message));
                await loadAssets();
              }}
              onVoice={() => {
                setVoiceText(null);
                setModal("voice");
              }}
              onStock={pexelsOn ? () => setModal("stock") : undefined}
              onEnvato={() => {
                setEnvatoAsk(null);
                setModal("envato");
              }}
              onImage={() => setModal("image")}
              onFiles={onFiles}
            />
          )}
          {tab === "versions" && (
            <div className="list">
              {versions.length === 0 && <p className="muted small pad">No versions yet.</p>}
              {versions.map((v) => (
                <button key={v.id} className={`item ${mode === "video" && shownVersion === v.n ? "on" : ""}`} onClick={() => viewVersion(v.n)}>
                  <strong>v{v.n}</strong> <span className={`tag ${v.source}`}>{v.source === "ai" ? "Claude" : v.source === "review" ? "Review fix" : v.source === "script" ? "From script" : v.source}</span>
                  <div className="small muted">{v.note || "—"}</div>
                  <div className="small muted">{new Date(v.created_at).toLocaleString()}</div>
                </button>
              ))}
              {canDelete && (
                <div className="pad">
                  <button className="link small danger" onClick={removeVideo}>Delete this video</button>
                </div>
              )}
            </div>
          )}
          {tab === "renders" && <RendersPanel renders={renders} />}
          {mode === "video" && (
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
          )}
        </aside>
      </div>
      {director && project && (() => {
        const sc = project.script?.scenes.find((x) => x.id === director.sceneId);
        const specScene = spec?.scenes.find((x) => x.id === director.sceneId);
        const fromSpec = specScene && spec ? [...mediaIds({ ...spec, scenes: [specScene] })] : [];
        const p: any = specScene?.props ?? {};
        const words = sc?.onScreen || [p.title, p.headline, p.label, ...(Array.isArray(p.lines) ? p.lines.map((l: any) => (typeof l === "string" ? l : l?.text)) : [])].filter(Boolean).join(" / ");
        return (
          <SceneDirector
            title={`scene ${director.index + 1}`}
            words={words}
            assets={assets}
            mode={director.mode}
            initial={{ media: sc?.media?.length ? sc.media : fromSpec, motion: sc?.motion ?? "", focus: sc?.focus ?? [] }}
            onUpload={async (f) => {
              const row = await uploadOne(f);
              setAssets((a) => [...a, row]);
              setStage(null);
              return row;
            }}
            onClose={() => setDirector(null)}
            onApply={(d) => applyDirection(director, d)}
          />
        );
      })()}
      {modal === "voice" && (
        <VoiceModal
          projectId={projectId}
          initialText={voiceText?.text}
          direction={voiceText?.direction}
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
      {modal === "style" && spec && <StyleModal look={spec.look ?? "taxstreem"} palette={spec.palette} onClose={() => setModal(null)} onApply={(l, p) => applyStyle(l, p).catch((e) => setErr(e.message))} />}
      {modal === "stock" && <StockModal format={project.format} onClose={() => setModal(null)} onImport={(item: StockItem) => mediaJob({ kind: "import", item }, "Importing stock")} />}
      {modal === "envato" && <EnvatoModal initial={envatoAsk ?? undefined} onClose={() => { setModal(null); setEnvatoAsk(null); }} onAdd={addEnvato} />}
      {modal === "image" && (
        <ImageModal
          format={project.format}
          onClose={() => setModal(null)}
          onGenerate={async (prompt, aspect, model) => {
            setModal(null);
            await mediaJob({ kind: "imagegen", prompt, aspect, model }, "Making the image").catch((e) => setErr(e.message));
          }}
        />
      )}
    </div>
  );
}

function AssetsPanel(p: {
  assets: AssetRow[];
  spec: VideoSpec | null;
  script: Script | null;
  canDelete: boolean;
  onUse: (id: string) => void;
  onDelete: (a: AssetRow) => void;
  onVoice: () => void;
  onStock?: () => void;
  onEnvato: () => void;
  onImage: () => void;
  onFiles: (f: File[], kind?: "audio" | "voice" | "sample") => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    p.assets.forEach((a) => {
      if (urls[a.id]) return;
      const path = a.kind === "image" ? a.meta?.preview || a.path : a.kind === "video" ? a.meta?.poster : a.kind === "reference" ? a.meta?.sheet : a.path;
      if (path) fileUrl(path).then((u) => setUrls((x) => ({ ...x, [a.id]: u })), () => {});
    });
  }, [p.assets]); // eslint-disable-line react-hooks/exhaustive-deps
  const used = new Set<string>([p.spec?.audio?.voice, p.spec?.audio?.music, ...(p.spec ? mediaIds(p.spec) : []), ...(p.script?.scenes ?? []).flatMap((s) => s.media ?? [])].filter(Boolean) as string[]);
  const pick = (accept: string, kind?: "audio" | "voice" | "sample") => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = accept;
    i.multiple = kind !== "sample";
    i.onchange = () => p.onFiles([...(i.files ?? [])], kind);
    i.click();
  };
  const label = (a: AssetRow) => {
    const m = a.meta ?? {};
    const src = m.source === "elevenlabs" ? " · AI image" : "";
    if (a.kind === "image") return `${m.width ?? "?"}×${m.height ?? "?"}${src}`;
    if (a.kind === "video") return `Clip · ${Number(m.duration ?? 0).toFixed(1)}s${m.hasAudio ? " · sound" : ""}${src}`;
    if (a.kind === "document") {
      const what = m.format === "pdf" ? "PDF" : m.format === "word" ? "Word document" : "Text";
      const bytes = Number(m.size ?? 0);
      const size = m.words ? `${Number(m.words).toLocaleString()} words` : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
      return `${what} · ${size}${m.truncated ? " · first 120,000 characters" : ""} · for Claude to read`;
    }
    if (a.kind === "reference") return `Sample · ${Number(m.duration ?? 0).toFixed(1)}s · ${(m.shots ?? []).length} shots${m.bpm ? ` · ${Math.round(m.bpm)} BPM` : ""}`;
    return `${Number(m.duration ?? 0).toFixed(1)}s${m.bpm ? ` · ${Math.round(m.bpm)} BPM` : ""}${a.kind === "voice" ? (m.words?.length ? " · timed" : " · no timings") : ""}`;
  };
  return (
    <div className="list">
      <div className="row wrap pad">
        <button className="btn small" onClick={() => pick("image/*")}>+ Image</button>
        <button className="btn small" onClick={() => pick("video/*,.mov,.mp4,.webm,.m4v")}>+ Clip</button>
        <button className="btn small" onClick={() => pick("audio/*", "audio")}>+ Music</button>
        <button className="btn small" onClick={p.onVoice}>Voiceover</button>
        <button className="btn small" onClick={p.onEnvato} title="Search Envato Elements">Envato</button>
        {p.onStock && <button className="btn small" onClick={p.onStock}>Pexels</button>}
        <button className="btn small" onClick={p.onImage}>AI image</button>
        <button className="btn small" onClick={() => pick("video/*,.mov,.mp4,.webm,.m4v", "sample")} title="A motion design for Claude to replicate or learn from">+ Sample</button>
        <button className="btn small" onClick={() => pick(DOC_ACCEPT)} title="A brief, notes or an article for Claude to work from: Word, PDF or text">+ Document</button>
      </div>
      {p.assets.length === 0 && <p className="muted small pad">Upload product screenshots, footage or screen recordings, or make a voiceover. Add a Word, PDF or text document (a brief, notes, an article) and Claude works from it. Search Envato for clips, photos and music, or generate an image. Add a sample video and ask Claude to replicate or tweak it; for a YouTube example, paste the link in the chat.</p>}
      {p.assets.map((a) => (
        <div key={a.id} className="asset">
          {a.kind === "image" || a.kind === "video" || a.kind === "reference" ? (
            <div className="thumb-wrap">
              {urls[a.id] ? <img src={urls[a.id]} alt="" /> : <div className="audio-ico">…</div>}
              {a.kind === "video" && <span className="badge">▶</span>}
              {a.kind === "reference" && <span className="badge">Sample</span>}
            </div>
          ) : (
            <div className={`audio-ico ${a.kind === "document" ? "doc" : ""}`}>{a.kind === "voice" ? "VO" : a.kind === "document" ? (a.meta?.format === "pdf" ? "PDF" : "DOC") : "♪"}</div>
          )}
          <div className="asset-meta">
            <div className="small ellipsis" title={a.name}>{a.name}</div>
            <div className="small muted">
              {label(a)}
              {used.has(a.id) ? " · in use" : ""}
            </div>
            {(a.kind === "audio" || a.kind === "voice") && urls[a.id] && <audio controls preload="none" src={urls[a.id]} />}
            {a.kind === "document" && urls[a.id] && <a className="small" href={urls[a.id]} target="_blank" rel="noreferrer">Open file</a>}
            {a.meta?.pageUrl && (a.meta?.source === "pexels" || a.meta?.source === "envato") && (
              <a className="small muted" href={a.meta.pageUrl} target="_blank" rel="noreferrer">{a.meta.source === "envato" ? "Envato" : "Pexels"} · {a.meta.credit}</a>
            )}
            <div className="row">
              <button className="link small" onClick={() => p.onUse(a.id)}>Mention in chat</button>
              {p.canDelete && <button className="link small danger" onClick={() => confirm(`Delete ${a.name}?`) && p.onDelete(a)}>Delete</button>}
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
