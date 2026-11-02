// Every server call acts as the signed-in team member: their Supabase session goes to the
// database, so the same row-level security as The Bridge applies (is_member / has_role).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, HttpError } from "./http";

export const BUCKET = "media";

export interface Caller {
  id: string;
  email: string;
  role: "admin" | "producer" | "reviewer";
  name: string;
  token: string;
  db: SupabaseClient;
}

export function userClient(token: string): SupabaseClient {
  const url = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const key = env("SUPABASE_PUBLISHABLE_KEY") || env("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new HttpError(500, "Supabase is not configured on the server (VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY).");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function requireUser(req: Request, roles?: Caller["role"][], tokenOverride?: string): Promise<Caller> {
  const token = tokenOverride || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sign in first.");
  const db = userClient(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");
  const { data: profile } = await db.from("profiles").select("role, full_name, email").eq("id", data.user.id).maybeSingle();
  if (!profile) throw new HttpError(403, "Your account isn't on the TaxStreem studio team. Ask an admin to add you in The Bridge.");
  if (roles && !roles.includes(profile.role)) throw new HttpError(403, `This needs the ${roles.join(" or ")} role.`);
  return { id: data.user.id, email: profile.email || data.user.email || "", role: profile.role, name: profile.full_name || profile.email, token, db };
}

export async function download(db: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Couldn't read ${path}: ${error?.message ?? "missing"}`);
  return Buffer.from(await data.arrayBuffer());
}
