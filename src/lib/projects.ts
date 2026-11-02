// Deleting a whole video: the database row (its script, versions, chat, jobs, renders and asset
// records go with it) and every file stored under its folder.
import { BUCKET, sb } from "./supabase";

async function listFiles(dir: string, depth = 0): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(dir, { limit: 1000, offset });
    if (error) throw error;
    for (const f of data ?? []) {
      if (f.id) out.push(`${dir}/${f.name}`);
      else if (depth < 4) out.push(...(await listFiles(`${dir}/${f.name}`, depth + 1)));
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

/** Returns how many files were removed; throws if the video couldn't be deleted. */
export async function deleteProject(id: string): Promise<number> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unknown video");
  const { data, error } = await sb.from("motion_projects").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only admins and producers can delete videos.");
  // The row is gone, so the video has disappeared for everyone; now clear its files.
  const files = await listFiles(`motion/${id}`);
  for (let i = 0; i < files.length; i += 100) {
    const { error: e } = await sb.storage.from(BUCKET).remove(files.slice(i, i + 100));
    if (e) throw new Error(`The video was deleted, but some of its files couldn't be removed: ${e.message}`);
  }
  return files.length;
}
