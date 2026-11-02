import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "./crypto";
import { env, HttpError } from "./http";

export type KeyName = "anthropic" | "elevenlabs" | "pexels";
const ENV: Record<KeyName, string> = { anthropic: "ANTHROPIC_API_KEY", elevenlabs: "ELEVENLABS_API_KEY", pexels: "PEXELS_API_KEY" };
const LABEL: Record<KeyName, string> = { anthropic: "Anthropic (Claude)", elevenlabs: "ElevenLabs", pexels: "Pexels" };

export async function getKey(db: SupabaseClient, name: KeyName): Promise<string> {
  const fromEnv = env(ENV[name]);
  if (fromEnv) return fromEnv;
  const { data } = await db.from("motion_secrets").select("ciphertext, iv").eq("name", name).maybeSingle();
  if (data) {
    try {
      return decrypt(data.ciphertext, data.iv);
    } catch {
      throw new HttpError(500, `The saved ${LABEL[name]} key can't be read (APP_SECRET changed). An admin should save it again in Settings.`);
    }
  }
  throw new HttpError(400, `No ${LABEL[name]} API key yet. An admin can add one in Settings.`);
}

export async function keyStatus(db: SupabaseClient) {
  const { data } = await db.from("motion_secrets").select("name, last4, updated_at");
  const rows = new Map((data ?? []).map((r: any) => [r.name, r]));
  const out: Record<string, { set: boolean; last4: string; source: string }> = {};
  for (const n of Object.keys(ENV) as KeyName[]) {
    if (env(ENV[n])) out[n] = { set: true, last4: env(ENV[n]).slice(-4), source: "environment" };
    else if (rows.has(n)) out[n] = { set: true, last4: (rows.get(n) as any).last4, source: "settings" };
    else out[n] = { set: false, last4: "", source: "none" };
  }
  return out;
}

export async function saveKey(db: SupabaseClient, name: KeyName, value: string) {
  const v = value.trim();
  if (!v) {
    const { error } = await db.from("motion_secrets").delete().eq("name", name);
    if (error) throw new HttpError(500, error.message);
    return;
  }
  const { ciphertext, iv } = encrypt(v);
  const { error } = await db.from("motion_secrets").upsert({ name, ciphertext, iv, last4: v.slice(-4), updated_at: new Date().toISOString() });
  if (error) throw new HttpError(500, error.message);
}
