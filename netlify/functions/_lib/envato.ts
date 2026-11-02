// Envato Elements search through Envato's official MCP server (https://mcp.envato.com/mcp).
// It is search only: downloading and licensing happen on Envato's site, one item at a time,
// which is what the Elements licence asks for (no automated downloads).
import { HttpError } from "./http";

export type EnvatoType = "video" | "photo" | "music" | "sfx";

const TOOLS: Record<EnvatoType, string> = { video: "search_stock_video", photo: "search_photos", music: "search_music", sfx: "search_sound_effects" };

export interface EnvatoItem {
  title: string;
  author: string;
  type: EnvatoType;
  cover: string | null;
  aspect: number;
  url: string;
}

export async function envatoSearch(q: { query: string; type: EnvatoType; page?: number; perPage?: number }): Promise<{ items: EnvatoItem[]; hasMore: boolean; total: number }> {
  const tool = TOOLS[q.type] ?? TOOLS.video;
  const res = await fetch("https://mcp.envato.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: { searchTerms: q.query.slice(0, 120), page: q.page ?? 1, perPage: Math.min(20, q.perPage ?? 20) } } }),
  });
  if (!res.ok) throw new HttpError(502, `Envato search isn't answering right now (${res.status}). Try again in a minute.`);
  const raw = await res.text();
  const data = raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
  let msg: any;
  try {
    msg = JSON.parse(data.length ? data[data.length - 1] : raw);
  } catch {
    throw new HttpError(502, "Envato sent a reply the studio couldn't read.");
  }
  if (msg.error) throw new HttpError(502, `Envato search failed: ${msg.error.message ?? "unknown error"}`);
  const text = msg.result?.content?.find((c: any) => c.type === "text")?.text ?? "{}";
  if (msg.result?.isError) throw new HttpError(502, `Envato search failed: ${String(text).slice(0, 200)}`);
  let out: any;
  try {
    out = JSON.parse(text);
  } catch {
    throw new HttpError(502, "Envato sent a reply the studio couldn't read.");
  }
  const items: EnvatoItem[] = (out.items ?? [])
    .filter((it: any) => typeof it?.item_url === "string" && /^https:\/\/elements\.envato\.com\//.test(it.item_url))
    .map((it: any) => ({
      title: String(it.title ?? "Untitled"),
      author: String(it.author ?? ""),
      type: q.type,
      cover: typeof it.cover_image === "string" ? it.cover_image : null,
      aspect: Number(it.aspect_ratio) || 1.5,
      url: it.item_url,
    }));
  return { items, hasMore: !!out.pagination?.has_next_page, total: Number(out.pagination?.total_items) || items.length };
}
