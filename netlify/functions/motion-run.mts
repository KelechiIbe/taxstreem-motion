// Background job (up to 15 minutes): Claude writes the script, designs or edits the video, or
// reviews rendered frames; stock imports and AI images run here too because they can be slow.
import type { Config } from "@netlify/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, download } from "./_lib/db";
import { env } from "./_lib/http";
import { getClaude, getKey } from "./_lib/keys";
import { callTool, MODEL, type Block, type Msg } from "./_lib/claude";
import { GENERATE_SYSTEM, REVIEW_SYSTEM, REVIEW_TOOL, SCRIPT_SYSTEM, SCRIPT_TOOL, UPDATE_TOOL } from "./_lib/prompts";
import { generateImage, importStock, pexelsSearch, storeAsset, youtubeLinks, youtubeRef, type StoredAsset } from "./_lib/media";
import { checkSpec } from "../../src/runtime/validate";
import { mediaIds } from "../../src/runtime/audioplan";
import { LOOK_BY_ID } from "../../src/runtime/looks";
import type { Format, Script, ScriptScene, VideoSpec } from "../../src/runtime/types";

export const config: Config = { background: true };

interface Asset {
  id: string;
  project_id: string | null;
  kind: "image" | "audio" | "voice" | "video" | "reference";
  name: string;
  path: string;
  mime: string;
  meta: any;
}

const ORIENT: Record<string, string> = { "9:16": "portrait", "16:9": "landscape", "1:1": "square" };

export default async (req: Request) => {
  let jobId = "";
  let db: SupabaseClient | null = null;
  const update = (fields: Record<string, unknown>) => db!.from("motion_jobs").update(fields).eq("id", jobId);
  try {
    const b: any = await req.json();
    jobId = b.jobId;
    const me = await requireUser(req);
    db = me.db;
    const { data: job } = await db.from("motion_jobs").select("*").eq("id", jobId).single();
    if (!job) throw new Error("Job not found");
    const { data: project } = await db.from("motion_projects").select("*").eq("id", job.project_id).single();
    if (!project) throw new Error("Video not found");
    const target = job.input?.library ? null : project.id;

    // ---------------------------------------------------------- media jobs
    if (job.kind === "import") {
      await update({ status: "running", message: "Downloading from Pexels" });
      const key = await getKey(db, "pexels");
      void key;
      const asset = await importStock(db, job.input.item, target);
      await update({ status: "done", message: "Imported", result: { assetId: asset.id } });
      return;
    }
    if (job.kind === "imagegen") {
      await update({ status: "running", message: "Asking ElevenLabs for the image" });
      const key = await getKey(db, "elevenlabs");
      const prompt = String(job.input.prompt ?? "").trim();
      const img = await generateImage(key, prompt, job.input.aspect || project.format, job.input.model || env("MOTION_IMAGE_MODEL") || undefined, async (m) => void (await update({ message: m })));
      const asset = await storeAsset(db, { projectId: target, kind: "image", name: `AI image: ${prompt.slice(0, 60)}`, buf: img.buf, mime: img.mime, meta: { source: "elevenlabs", model: img.model, prompt } });
      await update({ status: "done", message: "Image ready", result: { assetId: asset.id } });
      return;
    }

    // ---------------------------------------------------------- Claude jobs
    await update({ status: "running", message: job.kind === "review" ? "Looking at the rendered frames" : job.kind === "script" ? `Writing with ${MODEL()}` : `Designing with ${MODEL()}` });
    const cred = await getClaude(db);
    const loadAssets = async () => ((await db!.from("motion_assets").select("*").or(`project_id.eq.${project.id},project_id.is.null`).order("created_at")).data ?? []) as Asset[];
    let assets = await loadAssets();
    const idsFor = (list: Asset[]) => ({
      imageIds: new Set(list.filter((a) => a.kind === "image").map((a) => a.id)),
      videoIds: new Set(list.filter((a) => a.kind === "video").map((a) => a.id)),
      audioIds: new Set(list.filter((a) => a.kind === "audio" || a.kind === "voice").map((a) => a.id)),
      format: project.format as Format,
    });

    if (job.kind === "generate" || job.kind === "script") {
      const isScript = job.kind === "script";
      const fromScript = !!job.input?.fromScript;
      const { data: msgs } = await db.from("motion_messages").select("role, content, data, id").eq("project_id", project.id).order("id", { ascending: false }).limit(18);
      const history = (msgs ?? []).reverse();
      const attachIds: string[] = job.input?.attachments ?? [];
      const latestText = String(job.input?.text ?? "");
      const visuals = await visualBlocks(db, assets, project, attachIds, latestText);
      const script: Script | null = project.script ?? null;
      const pexelsOn = await getKey(db, "pexels").then(() => true, () => false);
      const waiting = (script?.scenes ?? []).flatMap((sc) => (sc.media ?? []).filter((m) => /^envato:/i.test(m)).map((m) => `${sc.id}: ${m}`));
      const context = [
        `Project format: ${project.format}. Title: ${project.title}.`,
        `Pexels stock is ${pexelsOn ? "on: stock: requests in a spec are fetched automatically" : "off: don't use stock: requests; ask for envato: files in the script instead"}.`,
        ...(waiting.length && !isScript ? [`Envato files the script asks for that haven't been added yet (build those scenes without them): ${waiting.join("; ")}.`] : []),
        `Assets you can use:\n${describeAssets(assets) || "(none uploaded yet)"}`,
        isScript
          ? script
            ? `Current script:\n${JSON.stringify(script)}`
            : "There is no script yet: write the first one from the team's idea and context."
          : fromScript && script
            ? `APPROVED SCRIPT to build from:\n${JSON.stringify(script)}${project.spec?.scenes?.length ? `\n\nThe previous video (replace it with one built from this script, reusing scene ids where scenes match):\n${JSON.stringify(project.spec)}` : ""}`
            : project.spec?.scenes?.length
              ? `Current spec (version ${project.version}):\n${JSON.stringify(project.spec)}${script?.approvedAt ? `\n\nIt was built from this approved script; keep on-screen words consistent with it unless the team asks otherwise:\n${JSON.stringify(script)}` : ""}`
              : "There is no video yet: build the first cut.",
      ].join("\n\n");
      const messages = toMessages(history, context, visuals);

      if (isScript) {
        await update({ message: "Writing the script" });
        const out = await callTool<{ reply: string; script?: Script }>({ cred, system: SCRIPT_SYSTEM, messages, tool: SCRIPT_TOOL as any, maxTokens: 12000 });
        let saved = false;
        if (out.input.script) {
          const clean = cleanScript(out.input.script, project.format);
          await db.from("motion_projects").update({ script: clean, stage: "script", title: clean.title || project.title }).eq("id", project.id);
          saved = true;
        }
        await db.from("motion_messages").insert({ project_id: project.id, role: "assistant", content: out.input.reply || "Done.", data: { script: saved, model: MODEL(), usage: out.usage } });
        await update({ status: "done", message: saved ? "Script ready" : "Answered", result: { script: saved, usage: out.usage } });
        return;
      }

      await update({ message: fromScript ? "Building the video from the script" : "Writing the video" });
      let out = await callTool<{ reply: string; title?: string; spec?: VideoSpec }>({ cred, system: GENERATE_SYSTEM, messages, tool: UPDATE_TOOL as any, maxTokens: 24000 });
      let usage = out.usage;
      let saved: number | null = null;
      let notes: string[] = [];
      if (out.input.spec) {
        const fetched = await resolveMedia(db, out.input.spec, project, target, (m) => update({ message: m }));
        if (fetched.added) assets = await loadAssets();
        let checked = checkSpec(out.input.spec, idsFor(assets));
        const problems = [...fetched.problems, ...checked.errors];
        if (problems.length) {
          await update({ message: "Fixing a few problems in the draft" });
          const retry = await callTool<{ reply: string; title?: string; spec?: VideoSpec }>({
            cred,
            system: GENERATE_SYSTEM,
            messages: [
              ...messages,
              { role: "assistant", content: `Draft spec:\n${JSON.stringify(out.input.spec)}` },
              {
                role: "user",
                content: `The renderer rejected that draft:\n- ${problems.join("\n- ")}\n${fetched.added ? `\nThese media were fetched for you and are now assets:\n${describeAssets(assets.filter((a) => fetched.ids.includes(a.id)))}\n` : ""}Call update_video again with the corrected complete spec and the same reply.`,
              },
            ],
            tool: UPDATE_TOOL as any,
            maxTokens: 24000,
          });
          usage = { input: usage.input + retry.usage.input, output: usage.output + retry.usage.output };
          if (retry.input.spec) {
            out = retry;
            const again = await resolveMedia(db, retry.input.spec, project, target, (m) => update({ message: m }));
            if (again.added) assets = await loadAssets();
            checked = checkSpec(retry.input.spec, idsFor(assets));
            checked.errors.push(...again.problems);
          }
          if (checked.errors.length) throw new Error(`Claude's video had problems it couldn't fix: ${checked.errors.join(" ")}`);
        }
        notes = [...checked.notes, ...fetched.notes];
        const spec = checked.spec;
        if (out.input.title) spec.title = String(out.input.title).slice(0, 120);
        saved = await saveVersion(db, project, spec, fromScript ? "script" : "ai", fromScript ? "Built from the script" : firstLine(job.input?.text) || "Claude edit");
        if (fromScript || project.stage !== "video") await db.from("motion_projects").update({ stage: "video" }).eq("id", project.id);
      }
      await db.from("motion_messages").insert({ project_id: project.id, role: "assistant", content: out.input.reply || "Done.", data: { version: saved, notes, model: MODEL(), usage } });
      await update({ status: "done", message: saved ? `Version ${saved} ready` : "Answered", result: { version: saved, usage } });
      return;
    }

    if (job.kind === "review") {
      const r = job.input?.review ?? {};
      if (r.version !== project.version) {
        await update({ status: "done", message: "Skipped: a newer version exists", result: { skipped: true } });
        return;
      }
      const sheet = await download(db, r.sheetPath);
      const content: Block[] = [
        { type: "text", text: `Contact sheet of version ${project.version}, rendered at ${r.format || project.format}:` },
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: sheet.toString("base64") } },
        {
          type: "text",
          text: `Spec:\n${JSON.stringify(project.spec)}\n\nRenderer warnings:\n${(r.warnings ?? []).map((w: string) => `- ${w}`).join("\n") || "(none)"}\n\nAssets:\n${describeAssets(assets)}${project.script?.approvedAt ? `\n\nApproved script:\n${JSON.stringify(project.script)}` : ""}`,
        },
      ];
      const out = await callTool<{ inspected: string[]; issues: any[]; verdict: string; summary: string; spec?: VideoSpec }>({
        cred,
        system: REVIEW_SYSTEM,
        messages: [{ role: "user", content }],
        tool: REVIEW_TOOL as any,
        maxTokens: 24000,
      });
      let saved: number | null = null;
      if (out.input.spec && out.input.verdict !== "ready") {
        const checked = checkSpec(out.input.spec, idsFor(assets));
        if (!checked.errors.length) saved = await saveVersion(db, project, checked.spec, "review", "Frame review fixes");
      }
      await db.from("motion_messages").insert({
        project_id: project.id,
        role: "assistant",
        content: out.input.summary || "Frame review finished.",
        data: { review: { inspected: out.input.inspected, issues: out.input.issues, verdict: out.input.verdict, sheetPath: r.sheetPath }, version: saved, usage: out.usage },
      });
      await update({ status: "done", message: saved ? `Review fixed issues: version ${saved}` : `Review: ${out.input.verdict}`, result: { version: saved, verdict: out.input.verdict } });
      return;
    }
    throw new Error("Unknown task");
  } catch (e) {
    console.error(e);
    if (jobId && db) await update({ status: "error", message: (e as Error).message || "The task failed" });
  }
};

// ------------------------------------------------------------------ what Claude sees

/** Images Claude looks at this turn: attachments, media in use, clip posters, sample frame sheets and YouTube thumbnails. */
async function visualBlocks(db: SupabaseClient, assets: Asset[], project: any, attachIds: string[], text: string): Promise<Block[]> {
  const inSpec = project.spec ? mediaIds(project.spec as VideoSpec) : new Set<string>();
  for (const sc of (project.script?.scenes ?? []) as ScriptScene[]) for (const m of sc.media ?? []) inSpec.add(m);
  const fresh = !project.spec?.scenes?.length && !project.script;
  const visual = assets.filter((a) => (a.kind === "image" || a.kind === "video") && (attachIds.includes(a.id) || inSpec.has(a.id) || (fresh && a.project_id === project.id)));
  const refs = assets.filter((a) => a.kind === "reference" && (attachIds.includes(a.id) || a.project_id === project.id)).slice(-2);
  const out: Block[] = [];
  const push = async (label: string, path: string | undefined, mime: string) => {
    if (!path) return;
    try {
      const buf = await download(db, path);
      if (buf.length > 4.5 * 1024 * 1024) return; // over the API's image size limit; Claude still gets the description
      out.push({ type: "text", text: label });
      out.push({ type: "image", source: { type: "base64", media_type: mime as any, data: buf.toString("base64") } });
    } catch (e) {
      console.warn("visual skipped", path, (e as Error).message);
    }
  };
  for (const r of refs) await push(`Sample "${r.id}" (${r.name}): frame sheet, ${Number(r.meta?.duration ?? 0).toFixed(1)}s. Cuts at ${(r.meta?.cuts ?? []).map((x: number) => x.toFixed(2)).join(", ") || "none detected"}.`, r.meta?.sheet, "image/jpeg");
  for (const a of visual.slice(-8)) {
    if (a.kind === "image") await push(`Image asset "${a.id}" (${a.name}, ${a.meta?.width ?? "?"}×${a.meta?.height ?? "?"}):`, a.meta?.preview || a.path, a.meta?.preview ? "image/jpeg" : a.mime || "image/png");
    else await push(`Video asset "${a.id}" (${a.name}, ${Number(a.meta?.duration ?? 0).toFixed(1)}s): poster frame`, a.meta?.poster, "image/jpeg");
  }
  for (const url of youtubeLinks(text)) {
    const y = await youtubeRef(url);
    if (!y) continue;
    out.push({ type: "text", text: `YouTube sample ${url}: "${y.title}" by ${y.author}. You can only see its thumbnail, not the video.` });
    if (y.thumb) out.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: y.thumb.toString("base64") } });
  }
  return out;
}

// ------------------------------------------------------------------ stock and AI media requests

const MEDIA_KEYS = ["media", "video", "image"];

/** Replaces "stock:..." and "generate:..." requests in a spec with imported asset ids. */
async function resolveMedia(db: SupabaseClient, spec: VideoSpec, project: any, target: string | null, say: (m: string) => unknown) {
  const problems: string[] = [];
  const notes: string[] = [];
  const ids: string[] = [];
  const cache = new Map<string, string | null>();
  const requests: { holder: Record<string, any>; key: string; value: string }[] = [];
  for (const sc of spec?.scenes ?? []) {
    const p = sc?.props ?? {};
    const scan = (o: Record<string, any>) => MEDIA_KEYS.forEach((k) => typeof o?.[k] === "string" && /^(stock|generate):/i.test(o[k]) && requests.push({ holder: o, key: k, value: o[k] }));
    scan(p);
    if (Array.isArray(p.items)) p.items.forEach((it: any) => it && typeof it === "object" && scan(it));
  }
  if (!requests.length) return { problems, notes, ids, added: 0 };
  let stockLeft = 6;
  let genLeft = 3;
  let pexelsKey: string | null | undefined;
  let elevenKey: string | null | undefined;
  for (const r of requests) {
    if (cache.has(r.value)) {
      const hit = cache.get(r.value);
      if (hit) r.holder[r.key] = hit;
      continue;
    }
    let id: string | null = null;
    try {
      if (/^stock:/i.test(r.value)) {
        if (stockLeft-- <= 0) throw new Error("only 6 stock requests are fetched per answer");
        pexelsKey ??= await getKey(db, "pexels").catch(() => null);
        if (!pexelsKey) throw new Error("no Pexels key is set, so stock can't be fetched (an admin can add one in Settings)");
        const m = r.value.match(/^stock:(?:(photo|video|image|clip):)?(.+)$/i)!;
        const type = /video|clip/i.test(m[1] ?? "") ? "video" : "photo";
        const query = m[2].trim();
        await say(`Finding stock: ${query}`);
        const found = await pexelsSearch(pexelsKey, { query, type, orientation: ORIENT[project.format], perPage: 5 });
        const pick = found.items.find((x) => type === "photo" || (x.duration ?? 0) >= 3) ?? found.items[0];
        if (!pick) throw new Error(`Pexels has nothing for "${query}"`);
        const asset: StoredAsset = await importStock(db, pick, target);
        id = asset.id;
        notes.push(`Stock ${type} "${query}" from Pexels (${pick.credit}).`);
      } else {
        if (genLeft-- <= 0) throw new Error("only 3 AI images are made per answer");
        elevenKey ??= await getKey(db, "elevenlabs").catch(() => null);
        if (!elevenKey) throw new Error("no ElevenLabs key is set, so images can't be generated");
        const prompt = r.value.replace(/^generate:/i, "").trim();
        await say("Generating an image");
        const img = await generateImage(elevenKey, prompt, project.format, env("MOTION_IMAGE_MODEL") || undefined);
        const asset = await storeAsset(db, { projectId: target, kind: "image", name: `AI image: ${prompt.slice(0, 60)}`, buf: img.buf, mime: img.mime, meta: { source: "elevenlabs", model: img.model, prompt } });
        id = asset.id;
        notes.push(`AI image: ${prompt.slice(0, 80)}.`);
      }
    } catch (e) {
      problems.push(`Couldn't get "${r.value}": ${(e as Error).message}. Use an uploaded asset or a template without media for that scene.`);
    }
    cache.set(r.value, id);
    if (id) {
      r.holder[r.key] = id;
      ids.push(id);
    }
  }
  return { problems, notes, ids, added: ids.length };
}

// ------------------------------------------------------------------ helpers

function cleanScript(raw: any, format: Format): Script {
  const seen = new Set<string>();
  const scenes: ScriptScene[] = (Array.isArray(raw?.scenes) ? raw.scenes : []).slice(0, 24).map((s: any, i: number) => {
    let id = String(s?.id || `s${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
    while (seen.has(id)) id += "-b";
    seen.add(id);
    return {
      id,
      vo: String(s?.vo ?? "").slice(0, 600),
      onScreen: String(s?.onScreen ?? "").slice(0, 300),
      visual: String(s?.visual ?? "").slice(0, 500),
      seconds: Math.min(30, Math.max(0.8, Math.round((Number(s?.seconds) || 3) * 10) / 10)),
      media: Array.isArray(s?.media) ? s.media.map(String).slice(0, 5) : [],
    };
  });
  const formats: Format[] = ["9:16", "1:1", "16:9"];
  return {
    title: String(raw?.title ?? "Untitled video").slice(0, 120),
    idea: String(raw?.idea ?? "").slice(0, 2000),
    audience: raw?.audience ? String(raw.audience).slice(0, 300) : undefined,
    platform: raw?.platform ? String(raw.platform).slice(0, 120) : undefined,
    format: formats.includes(raw?.format) ? raw.format : format,
    look: LOOK_BY_ID.has(String(raw?.look)) ? String(raw.look) : "taxstreem",
    palette: raw?.palette === "look" || (raw?.palette && typeof raw.palette === "object") ? raw.palette : "brand",
    length: Math.round(scenes.reduce((a, s) => a + s.seconds, 0) * 10) / 10 || Number(raw?.length) || 30,
    music: raw?.music ? String(raw.music).slice(0, 300) : "",
    voiceDirection: raw?.voiceDirection ? String(raw.voiceDirection).slice(0, 300) : "",
    scenes,
    notes: raw?.notes ? String(raw.notes).slice(0, 1000) : undefined,
  };
}

async function saveVersion(db: SupabaseClient, project: any, spec: VideoSpec, source: string, note: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: cur } = await db.from("motion_projects").select("version").eq("id", project.id).single();
    const n = (cur?.version ?? 0) + 1;
    const { error } = await db.from("motion_versions").insert({ project_id: project.id, n, spec, note: note.slice(0, 140), source });
    if (error) {
      if (/duplicate/.test(error.message)) continue;
      throw new Error(error.message);
    }
    await db.from("motion_projects").update({ spec, version: n, title: spec.title || project.title }).eq("id", project.id);
    return n;
  }
  throw new Error("Couldn't save the new version; try again.");
}

function firstLine(s: unknown): string {
  return String(s ?? "").split("\n")[0].slice(0, 120);
}

function describeAssets(assets: Asset[]): string {
  return assets
    .map((a) => {
      const m = a.meta ?? {};
      const scope = a.project_id ? "" : " [team library]";
      if (a.kind === "image") return `- "${a.id}" · image · ${a.name} · ${m.width ?? "?"}×${m.height ?? "?"}${m.source ? ` · from ${m.source}` : ""}${scope}`;
      if (a.kind === "video") return `- "${a.id}" · video clip · ${a.name} · ${m.width ?? "?"}×${m.height ?? "?"} · ${Number(m.duration ?? 0).toFixed(1)}s${m.hasAudio ? " · has sound" : ""}${m.source ? ` · from ${m.source}` : ""}${scope}`;
      if (a.kind === "reference") {
        const shots: number[] = m.shots ?? [];
        const avg = shots.length ? shots.reduce((x, y) => x + y, 0) / shots.length : 0;
        return `- "${a.id}" · SAMPLE to learn from (not for use in the video) · ${a.name} · ${Number(m.duration ?? 0).toFixed(1)}s · ${m.width ?? "?"}×${m.height ?? "?"} · ${shots.length || "?"} shots${avg ? `, average ${avg.toFixed(2)}s` : ""}${m.bpm ? ` · music about ${Math.round(m.bpm)} BPM` : ""}${m.colors?.length ? ` · main colours ${m.colors.join(", ")}` : ""}${m.source ? ` · ${m.source}` : ""}`;
      }
      if (a.kind === "audio") {
        const beat = m.bpm ? ` · ${Math.round(m.bpm)} BPM (beat every ${(60 / m.bpm).toFixed(3)}s; first beats ${(m.beats ?? []).slice(0, 6).map((x: number) => x.toFixed(2)).join(", ")})` : "";
        return `- "${a.id}" · music · ${a.name} · ${Number(m.duration ?? 0).toFixed(1)}s${beat}${scope}`;
      }
      return `- "${a.id}" · voiceover · ${a.name} · ${Number(m.duration ?? 0).toFixed(1)}s${m.voiceName ? ` · voice ${m.voiceName}` : ""}\n  sentences (seconds from voice start):\n${sentences(m.words ?? []).map((s) => `    [${s.start.toFixed(2)}–${s.end.toFixed(2)}] ${s.text}`).join("\n") || (m.text ? `    (no timings) ${m.text}` : "    (no transcript)")}`;
    })
    .join("\n");
}

function sentences(words: { text: string; start: number; end: number }[]) {
  const out: { text: string; start: number; end: number }[] = [];
  let cur: typeof words = [];
  for (const w of words) {
    cur.push(w);
    if (/[.!?]$/.test(w.text)) {
      out.push({ text: cur.map((x) => x.text).join(" "), start: cur[0].start, end: w.end });
      cur = [];
    }
  }
  if (cur.length) out.push({ text: cur.map((x) => x.text).join(" "), start: cur[0].start, end: cur[cur.length - 1].end });
  return out;
}

/** Chat history as alternating Claude turns; the latest user turn carries the context and images. */
function toMessages(history: { role: string; content: string; data: any }[], context: string, images: Block[]): Msg[] {
  const out: Msg[] = [];
  const push = (role: "user" | "assistant", text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${text}`;
    else out.push({ role, content: text });
  };
  for (const m of history) {
    if (m.role === "user") push("user", m.content || "(attached files)");
    else if (m.role === "assistant") push("assistant", m.content + (m.data?.version ? ` [saved as version ${m.data.version}]` : m.data?.script ? " [script updated]" : ""));
  }
  while (out.length && out[0].role !== "user") out.shift();
  const last = out[out.length - 1];
  const latest = last && last.role === "user" ? (out.pop()!.content as string) : "Continue.";
  out.push({ role: "user", content: [...images, { type: "text", text: `${context}\n\n---\nThe team's latest message:\n${latest}` }] });
  return out;
}
