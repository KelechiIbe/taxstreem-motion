import { body, handle, HttpError, json } from "./_lib/http";
import { requireUser } from "./_lib/db";
import { getClaude, getKey, keyStatus, saveKey, type KeyName, type ServiceKey } from "./_lib/keys";
import { claudeFetch, MODEL } from "./_lib/claude";

const NAMES: KeyName[] = ["anthropic", "anthropic_workspace", "elevenlabs", "pexels"];

async function test(db: any, name: ServiceKey): Promise<string> {
  if (name === "anthropic") {
    // A one-word call to the model the studio uses, so a missing workspace, credit or model access shows up here.
    const cred = await getClaude(db);
    await claudeFetch(cred, "/v1/messages", { body: { model: MODEL(), max_tokens: 1, messages: [{ role: "user", content: "Hi" }] } });
    return `The key works with ${MODEL()}${cred.workspace ? ` in workspace ${cred.workspace}` : ""}.`;
  }
  const key = await getKey(db, name);
  const res =
    name === "pexels"
      ? await fetch("https://api.pexels.com/v1/search?query=office&per_page=1", { headers: { Authorization: key } })
      : await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
  if (!res.ok) {
    const out: any = await res.json().catch(() => ({}));
    const why = out?.detail?.message || out?.detail || out?.error || res.statusText;
    throw new HttpError(400, `${name === "pexels" ? "Pexels" : "ElevenLabs"} refused the key (${res.status}): ${typeof why === "string" ? why : JSON.stringify(why)}`);
  }
  return "The key works.";
}

export default handle(async (req) => {
  if (req.method === "GET") {
    const me = await requireUser(req);
    return json(await keyStatus(me.db));
  }
  const me = await requireUser(req, ["admin"]);
  const b = await body<{ action?: "save" | "test"; name: KeyName; value?: string }>(req);
  if (!NAMES.includes(b.name)) throw new HttpError(400, "Unknown key");
  const target: ServiceKey = b.name === "anthropic_workspace" ? "anthropic" : b.name;
  if (b.action === "test") {
    try {
      return json({ message: await test(me.db, target) });
    } catch (e) {
      throw e instanceof HttpError ? e : new HttpError(400, (e as Error).message);
    }
  }
  await saveKey(me.db, b.name, b.value ?? "");
  const status = await keyStatus(me.db);
  // Test straight after saving so a bad key shows up now rather than in the middle of a build.
  let message = b.value?.trim() ? "Saved." : "Removed.";
  let ok = true;
  if (status[target]?.set) {
    try {
      message = `Saved. ${await test(me.db, target)}`;
    } catch (e) {
      ok = false;
      message = `Saved, but the test failed: ${(e as Error).message}`;
    }
  }
  return json({ status, message, ok });
});
