// Media from outside the studio: Pexels stock (photos and clips), ElevenLabs AI images, and
// YouTube reference links (title and thumbnail only; videos are never downloaded).
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "./db";
import { HttpError } from "./http";

export interface StockItem {
  source: "pexels";
  type: "photo" | "video";
  id: number;
  width: number;
  height: number;
  duration?: number;
  /** Small preview for the picker. */
  thumb: string;
  /** What gets imported. */
  url: string;
  /** Smaller still Claude looks at (photo) or the poster frame (video). */
  preview: string;
  alt: string;
  credit: string;
  creditUrl: string;
  pageUrl: string;
}

const PEXELS = "https://api.pexels.com";

export async function pexelsSearch(key: string, q: { query: string; type?: "photo" | "video"; orientation?: string; page?: number; perPage?: number }): Promise<{ items: StockItem[]; total: number }> {
  const type = q.type === "video" ? "video" : "photo";
  const params = new URLSearchParams({ query: q.query.slice(0, 120), per_page: String(Math.min(40, q.perPage ?? 24)), page: String(q.page ?? 1) });
  if (q.orientation && ["portrait", "landscape", "square"].includes(q.orientation)) params.set("orientation", q.orientation);
  const res = await fetch(`${PEXELS}${type === "video" ? "/videos/search" : "/v1/search"}?${params}`, { headers: { Authorization: key } });
  if (res.status === 401 || res.status === 403) throw new HttpError(400, "Pexels refused the API key. An admin can check it in Settings.");
  if (res.status === 429) throw new HttpError(429, "Pexels rate limit reached (200 searches an hour). Try again later.");
  if (!res.ok) throw new HttpError(502, `Pexels search failed (${res.status}).`);
  const out: any = await res.json();
  if (type === "photo") {
    return {
      total: out.total_results ?? 0,
      items: (out.photos ?? []).map((p: any) => ({
        source: "pexels",
        type: "photo",
        id: p.id,
        width: p.width,
        height: p.height,
        thumb: p.src?.medium ?? p.src?.small,
        url: p.src?.large2x ?? p.src?.original,
        preview: p.src?.large ?? p.src?.medium,
        alt: p.alt ?? "",
        credit: p.photographer ?? "Pexels",
        creditUrl: p.photographer_url ?? "https://www.pexels.com",
        pageUrl: p.url ?? "https://www.pexels.com",
      })),
    };
  }
  return {
    total: out.total_results ?? 0,
    items: (out.videos ?? [])
      .map((v: any) => {
        const file = pickVideoFile(v.video_files ?? []);
        if (!file) return null;
        return {
          source: "pexels",
          type: "video",
          id: v.id,
          width: file.width ?? v.width,
          height: file.height ?? v.height,
          duration: v.duration,
          thumb: v.image,
          url: file.link,
          preview: v.image,
          alt: (v.url ?? "").split("/").filter(Boolean).pop()?.replace(/-\d+$/, "").replace(/-/g, " ") ?? "",
          credit: v.user?.name ?? "Pexels",
          creditUrl: v.user?.url ?? "https://www.pexels.com",
          pageUrl: v.url ?? "https://www.pexels.com",
        } as StockItem;
      })
      .filter(Boolean) as StockItem[],
  };
}

/** The best MP4 for the studio: up to 1920 on the long side, the largest such file. */
function pickVideoFile(files: any[]) {
  const mp4 = files.filter((f) => (f.file_type ?? "").includes("mp4") && f.link && f.width && f.height);
  const ok = mp4.filter((f) => Math.max(f.width, f.height) <= 1920).sort((a, b) => b.width * b.height - a.width * a.height);
  return ok[0] ?? mp4.sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? null;
}

export async function fetchBuffer(url: string, maxBytes = 80 * 1024 * 1024): Promise<{ buf: Buffer; mime: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > maxBytes) throw new Error(`The file is too big (${Math.round(len / 1e6)} MB).`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, mime: res.headers.get("content-type")?.split(";")[0] || "application/octet-stream" };
}

const uid = () => crypto.randomUUID().slice(0, 8);
const extFor = (mime: string, fallback: string) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm" })[mime] ?? fallback;

export interface StoredAsset {
  id: string;
  kind: string;
  name: string;
  path: string;
  mime: string;
  meta: Record<string, any>;
  project_id: string | null;
}

/** Saves a file under media/motion/ and records it as a project asset (as the signed-in user). */
export async function storeAsset(db: SupabaseClient, o: { projectId: string | null; kind: "image" | "video"; name: string; buf: Buffer; mime: string; meta: Record<string, any>; preview?: { buf: Buffer; mime: string } }): Promise<StoredAsset> {
  const folder = `motion/${o.projectId ?? "library"}`;
  const id = uid();
  const path = `${folder}/${o.kind === "video" ? "clip" : "img"}-${id}.${extFor(o.mime, o.kind === "video" ? "mp4" : "jpg")}`;
  const up = await db.storage.from(BUCKET).upload(path, o.buf, { contentType: o.mime, upsert: true });
  if (up.error) throw new Error(`Couldn't store the file: ${up.error.message}`);
  const meta = { ...o.meta };
  if (o.preview) {
    const ppath = `${folder}/${o.kind === "video" ? "clip" : "img"}-${id}-${o.kind === "video" ? "poster" : "preview"}.${extFor(o.preview.mime, "jpg")}`;
    const pu = await db.storage.from(BUCKET).upload(ppath, o.preview.buf, { contentType: o.preview.mime, upsert: true });
    if (!pu.error) meta[o.kind === "video" ? "poster" : "preview"] = ppath;
  }
  const { data, error } = await db.from("motion_assets").insert({ project_id: o.projectId, kind: o.kind, name: o.name.slice(0, 120), path, mime: o.mime, meta }).select("*").single();
  if (error) throw new Error(error.message);
  return data as StoredAsset;
}

export async function importStock(db: SupabaseClient, item: StockItem, projectId: string | null): Promise<StoredAsset> {
  if (item.source !== "pexels" || !/^https:\/\/(images|videos)\.pexels\.com\//.test(item.url)) throw new HttpError(400, "Only Pexels media can be imported.");
  const main = await fetchBuffer(item.url);
  let preview: { buf: Buffer; mime: string } | undefined;
  if (item.preview && item.preview !== item.url) preview = await fetchBuffer(item.preview, 8 * 1024 * 1024).catch(() => undefined);
  const name = `${item.alt || (item.type === "video" ? "Stock clip" : "Stock photo")} (Pexels, ${item.credit})`;
  return storeAsset(db, {
    projectId,
    kind: item.type === "video" ? "video" : "image",
    name,
    buf: main.buf,
    mime: main.mime.startsWith(item.type === "video" ? "video/" : "image/") ? main.mime : item.type === "video" ? "video/mp4" : "image/jpeg",
    meta: { width: item.width, height: item.height, ...(item.duration ? { duration: item.duration } : {}), source: "pexels", credit: item.credit, creditUrl: item.creditUrl, pageUrl: item.pageUrl, stockId: item.id, alt: item.alt },
    preview,
  });
}

// ---------------------------------------------------------------- ElevenLabs images

const ASPECTS: Record<string, string> = { "9:16": "9:16", "1:1": "1:1", "16:9": "16:9", "4:5": "4:5", "3:4": "3:4", "4:3": "4:3" };

export async function generateImage(key: string, prompt: string, aspect = "9:16", model?: string, onWait?: (s: string) => Promise<void>): Promise<{ buf: Buffer; mime: string; model: string }> {
  const model_id = model || "gemini-3.1-flash-image";
  const res = await fetch("https://api.elevenlabs.io/v1/flows/image", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ model_id, prompt: prompt.slice(0, 2000), aspect_ratio: ASPECTS[aspect] ?? "16:9" }),
  });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = out?.detail?.message || out?.detail || out?.message || res.statusText;
    if (res.status === 401 || res.status === 403) throw new HttpError(400, `ElevenLabs refused the image request (${res.status}). The key needs the Image & Video permission, and image generation may need a paid plan. ${typeof why === "string" ? why : ""}`.trim());
    throw new HttpError(502, `ElevenLabs couldn't start the image (${res.status}): ${typeof why === "string" ? why : JSON.stringify(why)}`);
  }
  const id = out.id;
  const started = Date.now();
  while (Date.now() - started < 5 * 60_000) {
    await new Promise((r) => setTimeout(r, 2500));
    const g = await fetch(`https://api.elevenlabs.io/v1/flows/image/${encodeURIComponent(id)}`, { headers: { "xi-api-key": key } });
    const st: any = await g.json().catch(() => ({}));
    if (st.status === "completed" && st.content_url) {
      const file = await fetchBuffer(st.content_url, 30 * 1024 * 1024);
      return { buf: file.buf, mime: st.content_mime_type || file.mime || "image/png", model: model_id };
    }
    if (st.status === "failed") throw new HttpError(502, `ElevenLabs couldn't make that image: ${st.error_message || st.failure_reason || "failed"}`);
    await onWait?.(st.status === "generating" ? "Generating the image" : "Waiting for ElevenLabs");
  }
  throw new HttpError(504, "The image took too long. Try again.");
}

// ---------------------------------------------------------------- YouTube references

export interface YouTubeRef {
  url: string;
  title: string;
  author: string;
  thumb?: Buffer;
}

export function youtubeLinks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/g)) out.add(`https://www.youtube.com/watch?v=${m[1]}`);
  return [...out].slice(0, 6);
}

export async function youtubeRef(url: string): Promise<YouTubeRef | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const o: any = await res.json();
    let thumb: Buffer | undefined;
    if (o.thumbnail_url) thumb = (await fetchBuffer(o.thumbnail_url, 4 * 1024 * 1024).catch(() => null))?.buf;
    return { url, title: o.title ?? "", author: o.author_name ?? "", thumb };
  } catch {
    return null;
  }
}
