// Records the team's message and a job, then hands the slow Claude work to motion-run.
import { body, handle, HttpError, json } from "./_lib/http";
import { requireUser } from "./_lib/db";
import { getKey } from "./_lib/keys";

type Kind = "generate" | "review" | "script" | "import" | "imagegen";

interface StartBody {
  projectId: string;
  kind: Kind;
  text?: string;
  attachments?: string[];
  /** Build the video from the approved script. */
  fromScript?: boolean;
  review?: { version: number; sheetPath: string; warnings?: string[]; format?: string };
  /** import: a stock item from motion-stock. */
  item?: unknown;
  /** imagegen: prompt and aspect ratio. */
  prompt?: string;
  aspect?: string;
  model?: string;
  /** import/imagegen: save to the team library instead of this video. */
  library?: boolean;
}

const KINDS: Kind[] = ["generate", "review", "script", "import", "imagegen"];
const LABELS: Record<Kind, string> = { generate: "Designing", review: "Reviewing frames", script: "Writing the script", import: "Importing stock", imagegen: "Making the image" };

export default handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const me = await requireUser(req);
  const b = await body<StartBody>(req);
  if (!b.projectId) throw new HttpError(400, "Missing project");
  if (!KINDS.includes(b.kind)) throw new HttpError(400, "Unknown task");
  // fail fast when the key the task needs is missing
  await getKey(me.db, b.kind === "import" ? "pexels" : b.kind === "imagegen" ? "elevenlabs" : "anthropic");
  if (b.kind === "imagegen" && !String(b.prompt ?? "").trim()) throw new HttpError(400, "Describe the image first.");
  if (b.kind === "import" && !b.item) throw new HttpError(400, "Pick something to import.");
  const { data: project } = await me.db.from("motion_projects").select("id").eq("id", b.projectId).maybeSingle();
  if (!project) throw new HttpError(404, "Video not found");
  let messageId: number | null = null;
  if (b.kind === "generate" || b.kind === "script") {
    const text = String(b.text ?? "").trim() || (b.fromScript ? "Build the video from the approved script." : "");
    if (!text && !b.attachments?.length) throw new HttpError(400, "Write a message or attach something first.");
    const { data: m, error } = await me.db
      .from("motion_messages")
      .insert({ project_id: b.projectId, role: "user", content: text, data: { attachments: b.attachments ?? [], by: me.name, ...(b.kind === "script" ? { script: true } : {}), ...(b.fromScript ? { fromScript: true } : {}) } })
      .select("id")
      .single();
    if (error) throw new HttpError(500, error.message);
    messageId = m.id;
  }
  const { data: job, error } = await me.db
    .from("motion_jobs")
    .insert({ project_id: b.projectId, kind: b.kind, status: "queued", message: LABELS[b.kind], input: { ...b, messageId } })
    .select("id")
    .single();
  if (error) throw new HttpError(500, error.message);
  const origin = new URL(req.url).origin;
  const res = await fetch(`${origin}/.netlify/functions/motion-run`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: req.headers.get("authorization") ?? "" },
    body: JSON.stringify({ jobId: job.id }),
  });
  if (res.status >= 400) {
    await me.db.from("motion_jobs").update({ status: "error", message: `Couldn't start the background task (${res.status}).` }).eq("id", job.id);
    throw new HttpError(502, "Couldn't start the background task.");
  }
  return json({ jobId: job.id, messageId });
});
