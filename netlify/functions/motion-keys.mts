import { body, handle, HttpError, json } from "./_lib/http";
import { requireUser } from "./_lib/db";
import { getKey, keyStatus, saveKey, type KeyName } from "./_lib/keys";

const NAMES: KeyName[] = ["anthropic", "elevenlabs"];

export default handle(async (req) => {
  if (req.method === "GET") {
    const me = await requireUser(req);
    return json(await keyStatus(me.db));
  }
  const me = await requireUser(req, ["admin"]);
  const b = await body<{ action?: "save" | "test"; name: KeyName; value?: string }>(req);
  if (!NAMES.includes(b.name)) throw new HttpError(400, "Unknown key");
  if (b.action === "test") {
    const key = await getKey(me.db, b.name);
    const res =
      b.name === "anthropic"
        ? await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } })
        : await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
    if (!res.ok) {
      const out: any = await res.json().catch(() => ({}));
      const why = out?.error?.message || out?.detail?.message || out?.detail || res.statusText;
      throw new HttpError(400, `${b.name === "anthropic" ? "Anthropic" : "ElevenLabs"} refused the key (${res.status}): ${typeof why === "string" ? why : JSON.stringify(why)}`);
    }
    return json({ message: "The key works." });
  }
  await saveKey(me.db, b.name, b.value ?? "");
  return json(await keyStatus(me.db));
});
