// Word timings for an uploaded voiceover recording (ElevenLabs Scribe), so captions and cuts can follow it.
import { body, handle, HttpError, json } from "./_lib/http";
import { BUCKET, requireUser } from "./_lib/db";
import { getKey } from "./_lib/keys";

export default handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const me = await requireUser(req);
  const b = await body<{ assetId: string }>(req);
  const { data: asset } = await me.db.from("motion_assets").select("*").eq("id", b.assetId).maybeSingle();
  if (!asset) throw new HttpError(404, "Recording not found");
  const key = await getKey(me.db, "elevenlabs");
  const file = await me.db.storage.from(BUCKET).download(asset.path);
  if (file.error || !file.data) throw new HttpError(500, file.error?.message ?? "Couldn't read the recording");
  const form = new FormData();
  form.set("model_id", "scribe_v2");
  form.set("language_code", "en");
  form.set("tag_audio_events", "false");
  form.set("timestamps_granularity", "word");
  form.set("file", file.data, asset.name || "voice.mp3");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `ElevenLabs: ${typeof out?.detail === "string" ? out.detail : out?.detail?.message ?? res.statusText}`);
  const words = (out.words ?? []).filter((w: any) => w.type === "word").map((w: any) => ({ text: w.text, start: w.start, end: w.end }));
  const meta = { ...(asset.meta ?? {}), words, text: out.text ?? "" };
  const { data, error } = await me.db.from("motion_assets").update({ meta }).eq("id", asset.id).select("*").single();
  if (error) throw new HttpError(500, error.message);
  return json(data);
});
