// Uploading and loading project assets (screenshots, music, voiceovers).
import { decodeFile, detectBeats } from "./audio";
import { api, check, fileUrl, sb, upload } from "./supabase";

export interface AssetRow {
  id: string;
  project_id: string | null;
  kind: "image" | "audio" | "voice" | "video" | "reference" | "document";
  name: string;
  path: string;
  mime: string;
  meta: Record<string, any>;
  created_at: string;
}

const extOf = (name: string, fallback: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? fallback).toLowerCase();
const uid = () => crypto.randomUUID().slice(0, 8);

/** Uploads a screenshot plus a ≤1568px JPEG preview (what Claude looks at). */
export async function uploadImage(projectId: string, file: File): Promise<AssetRow> {
  const bmp = await createImageBitmap(file);
  const long = Math.max(bmp.width, bmp.height);
  const k = Math.min(1, 1568 / long);
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const preview = await c.convertToBlob({ type: "image/jpeg", quality: 0.86 });
  const id = uid();
  const path = `motion/${projectId}/img-${id}.${extOf(file.name, "png")}`;
  const ppath = `motion/${projectId}/img-${id}-preview.jpg`;
  await upload(path, file, file.type || "image/png");
  await upload(ppath, preview, "image/jpeg");
  const row = check(
    await sb
      .from("motion_assets")
      .insert({ project_id: projectId, kind: "image", name: file.name, path, mime: file.type || "image/png", meta: { width: bmp.width, height: bmp.height, preview: ppath } })
      .select("*")
      .single(),
  );
  bmp.close();
  return row as AssetRow;
}

/** Uploads music (with tempo and beats) or a recorded voiceover (then transcribed for timings). */
export async function uploadAudio(projectId: string, file: File, kind: "audio" | "voice"): Promise<AssetRow> {
  const buf = await decodeFile(file);
  const meta: Record<string, unknown> = { duration: Math.round(buf.duration * 100) / 100 };
  if (kind === "audio") Object.assign(meta, detectBeats(buf));
  const path = `motion/${projectId}/${kind === "audio" ? "music" : "voice"}-${uid()}.${extOf(file.name, "mp3")}`;
  await upload(path, file, file.type || "audio/mpeg");
  let row = check(await sb.from("motion_assets").insert({ project_id: projectId, kind, name: file.name, path, mime: file.type || "audio/mpeg", meta }).select("*").single()) as AssetRow;
  if (kind === "voice") {
    try {
      row = await api<AssetRow>("motion-stt", { assetId: row.id });
    } catch (e) {
      console.warn("transcription failed", e);
    }
  }
  return row;
}

const bitmaps = new Map<string, Promise<Blob>>();
/** Full-resolution image for the renderer (a fresh ImageBitmap each time; they get transferred). */
export async function bitmapFor(a: AssetRow): Promise<ImageBitmap> {
  let p = bitmaps.get(a.id);
  if (!p) {
    p = fileUrl(a.path).then((u) => fetch(u).then((r) => r.blob()));
    bitmaps.set(a.id, p);
    p.catch(() => bitmaps.delete(a.id));
  }
  return createImageBitmap(await p);
}

export async function removeAsset(a: AssetRow) {
  check(await sb.from("motion_assets").delete().eq("id", a.id));
  const paths = [...new Set([a.path, a.meta?.preview, a.meta?.poster, a.meta?.sheet, a.meta?.textPath].filter(Boolean))] as string[];
  await sb.storage.from("media").remove(paths);
}
