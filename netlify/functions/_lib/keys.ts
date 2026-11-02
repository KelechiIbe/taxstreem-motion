import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "./crypto";
import { env, HttpError } from "./http";

// Keys saved in Settings always win. A key set by hand in Netlify's environment is the
// fallback. Netlify's AI Gateway also injects ANTHROPIC_API_KEY into every function, but that
// key only works through the gateway's own address, so it is ignored here: sending it to
// api.anthropic.com is what made Anthropic reject "the key" before.
export type ServiceKey = "anthropic" | "elevenlabs" | "pexels";
export type KeyName = ServiceKey | "anthropic_workspace";
const ENV: Record<ServiceKey, string> = { anthropic: "ANTHROPIC_API_KEY", elevenlabs: "ELEVENLABS_API_KEY", pexels: "PEXELS_API_KEY" };
const LABEL: Record<KeyName, string> = { anthropic: "Anthropic (Claude)", elevenlabs: "ElevenLabs", pexels: "Pexels", anthropic_workspace: "Anthropic workspace ID" };
const ANTHROPIC = "https://api.anthropic.com";

async function saved(db: SupabaseClient, name: KeyName): Promise<string | null> {
  const { data } = await db.from("motion_secrets").select("ciphertext, iv").eq("name", name).maybeSingle();
  if (!data) return null;
  try {
    return decrypt(data.ciphertext, data.iv).trim();
  } catch {
    throw new HttpError(500, `The saved ${LABEL[name]} can't be read (APP_SECRET changed). An admin should save it again in Settings.`);
  }
}

/** A key the team set in Netlify's environment themselves (never the AI Gateway's injected one). */
function fromEnv(name: ServiceKey): string {
  const v = env(ENV[name]).trim();
  if (!v || name !== "anthropic") return v;
  const base = env("ANTHROPIC_BASE_URL").trim().replace(/\/+$/, "");
  return !base || base === ANTHROPIC ? v : "";
}

export async function getKey(db: SupabaseClient, name: ServiceKey): Promise<string> {
  const v = (await saved(db, name)) || fromEnv(name);
  if (v) return v;
  throw new HttpError(400, `No ${LABEL[name]} API key yet. An admin can add one in Settings.`);
}

export interface ClaudeCred {
  key: string;
  workspace?: string;
}

export async function getClaude(db: SupabaseClient): Promise<ClaudeCred> {
  const key = await getKey(db, "anthropic");
  const workspace = (await saved(db, "anthropic_workspace")) || env("ANTHROPIC_WORKSPACE_ID").trim();
  return workspace ? { key, workspace } : { key };
}

export async function keyStatus(db: SupabaseClient) {
  const { data } = await db.from("motion_secrets").select("name, last4, updated_at");
  const rows = new Map((data ?? []).map((r: any) => [r.name, r]));
  const out: Record<string, { set: boolean; last4: string; source: string }> = {};
  for (const n of Object.keys(ENV) as ServiceKey[]) {
    if (rows.has(n)) out[n] = { set: true, last4: (rows.get(n) as any).last4, source: "settings" };
    else if (fromEnv(n)) out[n] = { set: true, last4: fromEnv(n).slice(-4), source: "environment" };
    else out[n] = { set: false, last4: "", source: "none" };
  }
  // Workspace IDs aren't secret, so the whole ID is shown.
  const ws = rows.get("anthropic_workspace") as any;
  out.anthropic_workspace = ws ? { set: true, last4: ws.last4, source: "settings" } : { set: false, last4: "", source: "none" };
  return out;
}

/** Tidies what people paste: quotes, "Bearer ", "x-api-key:" and stray spaces. */
function tidy(name: KeyName, value: string): string {
  let v = value.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  v = v.replace(/^(x-api-key\s*:\s*|bearer\s+)/i, "").trim();
  if (name === "anthropic") {
    if (/\s/.test(v)) throw new HttpError(400, "That key has a space or line break in it. Copy it again from the Anthropic Console and paste it on its own.");
    if (/^sk-ant-admin/i.test(v)) throw new HttpError(400, "That's an Anthropic Admin key, which can't run Claude. Create a regular API key at platform.claude.com/settings/keys instead.");
    if (!/^sk-ant-/.test(v)) throw new HttpError(400, "That doesn't look like an Anthropic API key. They start with sk-ant-.");
  }
  if (name === "anthropic_workspace" && !/^wrkspc_[A-Za-z0-9]+$/.test(v)) {
    throw new HttpError(400, "A workspace ID starts with wrkspc_. Copy it from the ID column at platform.claude.com/settings/workspaces.");
  }
  return v;
}

export async function saveKey(db: SupabaseClient, name: KeyName, value: string) {
  if (!value.trim()) {
    const { error } = await db.from("motion_secrets").delete().eq("name", name);
    if (error) throw new HttpError(500, error.message);
    return;
  }
  const v = tidy(name, value);
  const { ciphertext, iv } = encrypt(v);
  const last4 = name === "anthropic_workspace" ? v : v.slice(-4);
  const { error } = await db.from("motion_secrets").upsert({ name, ciphertext, iv, last4, updated_at: new Date().toISOString() });
  if (error) throw new HttpError(500, error.message);
}
