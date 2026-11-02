import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

export const BUCKET = "media";

/**
 * Supabase stamps sign-ins with an expiry in server time; a computer whose clock is off makes
 * every token look expired. Restating the expiry in local time keeps sign-in stable (as in The Bridge).
 */
const clockSafeFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!res.ok || !/\/auth\/v1\/(token|verify|callback)/.test(u) || !(res.headers.get("content-type") ?? "").includes("json")) return res;
  try {
    const body = await res.clone().json();
    if (body && typeof body.expires_in === "number" && typeof body.expires_at === "number") {
      body.expires_at = Math.floor(Date.now() / 1000) + body.expires_in;
      const headers = new Headers(res.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      return new Response(JSON.stringify(body), { status: res.status, statusText: res.statusText, headers });
    }
  } catch {
    /* leave it */
  }
  return res;
};

export const sb = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: clockSafeFetch },
});

export async function token(): Promise<string> {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? "";
}

export async function api<T = any>(name: string, payload?: unknown, method = payload === undefined ? "GET" : "POST"): Promise<T> {
  const res = await fetch(`/.netlify/functions/${name}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
    body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
  return out as T;
}

export function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

const signed = new Map<string, { url: string; exp: number }>();
export async function fileUrl(path: string): Promise<string> {
  const hit = signed.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error(error?.message ?? "Couldn't open the file");
  signed.set(path, { url: data.signedUrl, exp: Date.now() + 3600_000 });
  return data.signedUrl;
}

export async function upload(path: string, blob: Blob, contentType?: string) {
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: contentType || blob.type, upsert: true });
  if (error) throw new Error(error.message);
  signed.delete(path);
}
