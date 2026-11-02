// Voiceover through ElevenLabs with word timings, stored as a project asset.
import { body, handle, HttpError, json } from "./_lib/http";
import { BUCKET, requireUser } from "./_lib/db";
import { getKey } from "./_lib/keys";

export default handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const me = await requireUser(req);
  const b = await body<{ projectId: string; text: string; voiceId: string; voiceName?: string; modelId?: string; settings?: any }>(req);
  const text = String(b.text ?? "").trim();
  if (!text) throw new HttpError(400, "Write the voiceover script first.");
  if (text.length > 4500) throw new HttpError(400, "That script is too long for one take (4,500 characters). Split it.");
  if (!b.voiceId) throw new HttpError(400, "Pick a voice.");
  const key = await getKey(me.db, "elevenlabs");
  const s = b.settings ?? {};
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(b.voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "content-type": "application/json", "xi-api-key": key },
    body: JSON.stringify({
      text,
      model_id: b.modelId || "eleven_multilingual_v2",
      voice_settings: { stability: s.stability ?? 0.5, similarity_boost: s.similarity ?? 0.8, style: s.style ?? 0.15, use_speaker_boost: s.speakerBoost ?? true, speed: s.speed ?? 1 },
    }),
  });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof out?.detail === "string" ? out.detail : out?.detail?.message ?? res.statusText;
    throw new HttpError(res.status === 401 ? 400 : 502, `ElevenLabs: ${msg}`);
  }
  if (!out.audio_base64) throw new HttpError(502, "ElevenLabs returned no audio.");
  const words = toWords(out.alignment ?? out.normalized_alignment);
  const duration = words.length ? words[words.length - 1].end : 0;
  const path = `motion/${b.projectId}/voice-${Date.now()}.mp3`;
  const up = await me.db.storage.from(BUCKET).upload(path, Buffer.from(out.audio_base64, "base64"), { contentType: "audio/mpeg", upsert: false });
  if (up.error) throw new HttpError(500, up.error.message);
  const name = `${b.voiceName || "Voiceover"}: ${text.slice(0, 48)}${text.length > 48 ? "…" : ""}`;
  const { data: asset, error } = await me.db
    .from("motion_assets")
    .insert({ project_id: b.projectId, kind: "voice", name, path, mime: "audio/mpeg", meta: { words, text, duration, voiceId: b.voiceId, voiceName: b.voiceName ?? "" } })
    .select("*")
    .single();
  if (error) throw new HttpError(500, error.message);
  return json(asset);
});

function toWords(al: any): { text: string; start: number; end: number }[] {
  if (!al?.characters) return [];
  const chars: string[] = al.characters;
  const st: number[] = al.character_start_times_seconds;
  const en: number[] = al.character_end_times_seconds;
  const out: { text: string; start: number; end: number }[] = [];
  let cur = "";
  let s0 = 0;
  let e0 = 0;
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) out.push({ text: cur, start: s0, end: e0 });
      cur = "";
      return;
    }
    if (!cur) s0 = st[i];
    cur += ch;
    e0 = en[i];
  });
  if (cur) out.push({ text: cur, start: s0, end: e0 });
  return out;
}
