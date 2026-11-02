// Briefs, notes and articles the team attaches as source material for Claude (never shown in the video).
// Word and text files are turned into plain text here in the browser; PDFs go to Claude as they are.
import type { AssetRow } from "./assets";
import { check, sb, upload } from "./supabase";

export const DOC_FILE = /\.(docx|doc|pdf|txt|md|markdown)$/i;
export const DOC_ACCEPT = ".docx,.doc,.pdf,.txt,.md,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain,text/markdown";
const MAX_TEXT = 120_000;
const MAX_PDF = 20 * 1024 * 1024;

export const isDocument = (f: File) => DOC_FILE.test(f.name) || f.type === "application/pdf" || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Word HTML → plain text that keeps headings, lists and tables readable. */
function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: string[] = [];
  const text = (n: Node) => (n.textContent ?? "").replace(/\s+/g, " ").trim();
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      const tag = c.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) out.push(`${"#".repeat(Number(tag[1]))} ${text(c)}`);
      else if (tag === "p") text(c) && out.push(text(c));
      else if (tag === "ul" || tag === "ol") {
        Array.from(c.children).forEach((li, i) => text(li) && out.push(`${tag === "ol" ? `${i + 1}.` : "-"} ${text(li)}`));
      } else if (tag === "table") {
        for (const tr of Array.from(c.querySelectorAll("tr"))) out.push(Array.from(tr.children).map(text).join(" | "));
      } else walk(c);
    }
  };
  walk(doc.body);
  return out.join("\n");
}

async function readText(file: File): Promise<string> {
  const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  if (ext === "doc") throw new Error("Older .doc files can't be read. In Word, choose File → Save As → Word Document (.docx), then attach that.");
  if (ext === "docx" || file.type.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return htmlToText(value);
  }
  return (await file.text()).replace(/\r\n/g, "\n");
}

export async function uploadDocument(projectId: string, file: File): Promise<AssetRow> {
  const id = crypto.randomUUID().slice(0, 8);
  const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "txt").toLowerCase();
  const path = `motion/${projectId}/doc-${id}.${ext}`;
  const isPdf = ext === "pdf" || file.type === "application/pdf";
  const meta: Record<string, unknown> = { format: isPdf ? "pdf" : ext === "docx" ? "word" : "text", size: file.size };
  if (isPdf) {
    if (file.size > MAX_PDF) throw new Error("That PDF is over 20 MB. Save a smaller copy, or paste the parts that matter into the chat.");
  } else {
    let text = (await readText(file)).trim();
    if (!text) throw new Error("No text found in that file.");
    if (text.length > MAX_TEXT) {
      text = text.slice(0, MAX_TEXT);
      meta.truncated = true;
    }
    const textPath = `motion/${projectId}/doc-${id}.txt`;
    await upload(textPath, new Blob([text], { type: "text/plain" }), "text/plain");
    Object.assign(meta, { textPath, words: text.split(/\s+/).filter(Boolean).length, excerpt: text.slice(0, 280) });
  }
  await upload(path, file, file.type || (isPdf ? "application/pdf" : "application/octet-stream"));
  return check(
    await sb.from("motion_assets").insert({ project_id: projectId, kind: "document", name: file.name, path, mime: file.type || (isPdf ? "application/pdf" : "text/plain"), meta }).select("*").single(),
  ) as AssetRow;
}
