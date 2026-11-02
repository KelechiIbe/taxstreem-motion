// Voices for the voiceover picker: The Bridge's cast first, then the ElevenLabs library.
import { handle, json } from "./_lib/http";
import { requireUser } from "./_lib/db";
import { getKey } from "./_lib/keys";

export default handle(async (req) => {
  const me = await requireUser(req);
  const { data: chars } = await me.db.from("characters").select("data");
  const cast = (chars ?? [])
    .map((r: any) => r.data)
    .filter((c: any) => c?.voice?.voiceId)
    .map((c: any) => ({ id: c.voice.voiceId, name: c.name, label: `${c.name} · ${c.voice.voiceName ?? ""}`.trim(), role: c.role ?? "", settings: c.voice.settings ?? null, preview: c.voice.previewUrl ?? "", source: "bridge" }));
  let library: any[] = [];
  let note = "";
  try {
    const key = await getKey(me.db, "elevenlabs");
    const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100", { headers: { "xi-api-key": key } });
    const out: any = await res.json();
    library = (out.voices ?? []).map((v: any) => ({ id: v.voice_id, name: v.name, label: v.name, role: [v.labels?.accent, v.labels?.gender, v.labels?.use_case].filter(Boolean).join(" · "), preview: v.preview_url ?? "", source: "elevenlabs" }));
  } catch (e) {
    note = (e as Error).message;
  }
  return json({ cast, library, note });
});
