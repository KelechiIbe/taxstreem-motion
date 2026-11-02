// Searches Envato Elements (photos, stock video, music, sound effects) for the studio's Envato picker.
import { body, handle, HttpError, json } from "./_lib/http";
import { requireUser } from "./_lib/db";
import { envatoSearch, type EnvatoType } from "./_lib/envato";

const TYPES: EnvatoType[] = ["video", "photo", "music", "sfx"];

export default handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "POST only");
  await requireUser(req);
  const b = await body<{ query: string; type?: EnvatoType; page?: number }>(req);
  const query = String(b.query ?? "").trim();
  if (!query) throw new HttpError(400, "Type what you're looking for.");
  const type = TYPES.includes(b.type as EnvatoType) ? (b.type as EnvatoType) : "video";
  return json(await envatoSearch({ query, type, page: Math.max(1, Number(b.page) || 1) }));
});
