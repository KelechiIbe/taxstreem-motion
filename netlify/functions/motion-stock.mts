// Searches Pexels for stock photos and clips (the studio's stock picker).
import { body, handle, HttpError, json } from "./_lib/http";
import { requireUser } from "./_lib/db";
import { getKey } from "./_lib/keys";
import { pexelsSearch } from "./_lib/media";

export default handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  const me = await requireUser(req);
  const b = await body<{ query: string; type?: "photo" | "video"; orientation?: string; page?: number }>(req);
  const query = String(b.query ?? "").trim();
  if (!query) throw new HttpError(400, "Type what you're looking for.");
  const key = await getKey(me.db, "pexels");
  return json(await pexelsSearch(key, { query, type: b.type, orientation: b.orientation, page: b.page }));
});
