// Background job (up to 15 minutes): Claude designs or edits the video, or reviews rendered frames.
import type { Config } from "@netlify/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, download } from "./_lib/db";
import { getKey } from "./_lib/keys";
import { callTool, MODEL, type Block, type Msg } from "./_lib/claude";
import { GENERATE_SYSTEM, REVIEW_SYSTEM, REVIEW_TOOL, UPDATE_TOOL } from "./_lib/prompts";
import { checkSpec } from "../../src/runtime/validate";
import type { Format, VideoSpec } from "../../src/runtime/types";

export const config: Config = { background: true };

interface Asset {
  id: string;
  project_id: string | null;
  kind: "image" | "audio" | "voice";
  name: string;
  path: string;
  mime: string;
  meta: any;
}

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
    await update({ status: "running", message: job.kind === "review" ? "Looking at the rendered frames" : `Designing with ${MODEL()}` });
    const key = await getKey(db, "anthropic");
    const { data: project } = await db.from("motion_projects").select("*").eq("id", job.project_id).single();
    if (!project) throw new Error("Video not found");
    const { data: assetRows } = await db.from("motion_assets").select("*").or(`project_id.eq.${project.id},project_id.is.null`).order("created_at");
    const assets = (assetRows ?? []) as Asset[];
    const ids = {
      imageIds: new Set(assets.filter((a) => a.kind === "image").map((a) => a.id)),
      audioIds: new Set(assets.filter((a) => a.kind !== "image").map((a) => a.id)),
      format: project.format as Format,
    };

    if (job.kind === "generate") {
      const { data: msgs } = await db.from("motion_messages").select("role, content, data, id").eq("project_id", project.id).order("id", { ascending: false }).limit(18);
      const history = (msgs ?? []).reverse();
      const attachIds: string[] = job.input?.attachments ?? [];
      // which screenshots Claude should see this turn
      const inSpec = new Set<string>(((project.spec?.scenes ?? []) as any[]).filter((s) => s.type === "screenshot").map((s) => String(s.props?.image)));
      const show = assets.filter((a) => a.kind === "image" && (attachIds.includes(a.id) || inSpec.has(a.id) || (!project.spec?.scenes?.length && a.project_id === project.id))).slice(-6);
      const images: Block[] = [];
      for (const a of show) {
        try {
          const buf = await download(db, a.meta?.preview || a.path);
          images.push({ type: "text", text: `Image asset "${a.id}" (${a.name}, ${a.meta?.width ?? "?"}×${a.meta?.height ?? "?"}):` });
          images.push({ type: "image", source: { type: "base64", media_type: a.meta?.preview ? "image/jpeg" : a.mime || "image/png", data: buf.toString("base64") } });
        } catch (e) {
          console.warn("image skipped", a.id, (e as Error).message);
        }
      }
      const context = [
        `Project format: ${project.format}. Title: ${project.title}.`,
        `Assets you can use:\n${describeAssets(assets) || "(none uploaded yet)"}`,
        project.spec?.scenes?.length ? `Current spec (version ${project.version}):\n${JSON.stringify(project.spec)}` : "There is no video yet: build the first cut.",
      ].join("\n\n");
      const messages = toMessages(history, context, images);
      await update({ message: "Writing the video" });
      let out = await callTool<{ reply: string; title?: string; spec?: VideoSpec }>({ key, system: GENERATE_SYSTEM, messages, tool: UPDATE_TOOL as any, maxTokens: 20000 });
      let usage = out.usage;
      let saved: number | null = null;
      let notes: string[] = [];
      if (out.input.spec) {
        let checked = checkSpec(out.input.spec, ids);
        if (checked.errors.length) {
          await update({ message: "Fixing a few problems in the draft" });
          const retry = await callTool<{ reply: string; title?: string; spec?: VideoSpec }>({
            key,
            system: GENERATE_SYSTEM,
            messages: [
              ...messages,
              { role: "assistant", content: `Draft spec:\n${JSON.stringify(out.input.spec)}` },
              { role: "user", content: `The renderer rejected that draft:\n- ${checked.errors.join("\n- ")}\nCall update_video again with the corrected complete spec and the same reply.` },
            ],
            tool: UPDATE_TOOL as any,
            maxTokens: 20000,
          });
          usage = { input: usage.input + retry.usage.input, output: usage.output + retry.usage.output };
          if (retry.input.spec) {
            out = retry;
            checked = checkSpec(retry.input.spec, ids);
          }
          if (checked.errors.length) throw new Error(`Claude's video had problems it couldn't fix: ${checked.errors.join(" ")}`);
        }
        notes = checked.notes;
        const spec = checked.spec;
        if (out.input.title) spec.title = String(out.input.title).slice(0, 120);
        saved = await saveVersion(db, project, spec, "ai", firstLine(job.input?.text) || "Claude edit");
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
        { type: "text", text: `Spec:\n${JSON.stringify(project.spec)}\n\nRenderer warnings:\n${(r.warnings ?? []).map((w: string) => `- ${w}`).join("\n") || "(none)"}\n\nAssets:\n${describeAssets(assets)}` },
      ];
      const out = await callTool<{ inspected: string[]; issues: any[]; verdict: string; summary: string; spec?: VideoSpec }>({
        key,
        system: REVIEW_SYSTEM,
        messages: [{ role: "user", content }],
        tool: REVIEW_TOOL as any,
        maxTokens: 20000,
      });
      let saved: number | null = null;
      if (out.input.spec && out.input.verdict !== "ready") {
        const checked = checkSpec(out.input.spec, ids);
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
      if (a.kind === "image") return `- "${a.id}" · image · ${a.name} · ${m.width ?? "?"}×${m.height ?? "?"}${scope}`;
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
    else if (m.role === "assistant") push("assistant", m.content + (m.data?.version ? ` [saved as version ${m.data.version}]` : ""));
  }
  while (out.length && out[0].role !== "user") out.shift();
  const last = out[out.length - 1];
  const latest = last && last.role === "user" ? (out.pop()!.content as string) : "Continue.";
  out.push({ role: "user", content: [...images, { type: "text", text: `${context}\n\n---\nThe team's latest message:\n${latest}` }] });
  return out;
}
