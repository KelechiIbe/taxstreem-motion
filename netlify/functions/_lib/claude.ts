// Minimal Anthropic Messages client with a forced tool call, so replies are always structured.
import { env } from "./http";
import type { ClaudeCred } from "./keys";

export const MODEL = () => env("MOTION_MODEL") || "claude-opus-5-5";

export type Block =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title?: string };

export interface Msg {
  role: "user" | "assistant";
  content: string | Block[];
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export async function callTool<T>(o: { cred: ClaudeCred; system: string; messages: Msg[]; tool: Tool; maxTokens?: number }): Promise<{ input: T; usage: { input: number; output: number } }> {
  // Opus 5.5 doesn't accept a forced tool_choice, so the tool is offered ("auto") and the
  // system prompt says to call it; if Claude answers in prose instead, it is asked once more.
  let messages = o.messages;
  const usage = { input: 0, output: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await post(o.cred, {
      model: MODEL(),
      max_tokens: o.maxTokens ?? 16000,
      system: [{ type: "text", text: `${o.system}\n\nAlways answer by calling the ${o.tool.name} tool exactly once.`, cache_control: { type: "ephemeral" } }],
      messages,
      tools: [o.tool],
      tool_choice: { type: "auto" },
    });
    usage.input += out.usage?.input_tokens ?? 0;
    usage.output += out.usage?.output_tokens ?? 0;
    const block = (out.content ?? []).find((b: any) => b.type === "tool_use" && b.name === o.tool.name);
    if (block) return { input: block.input as T, usage };
    if (out.stop_reason === "max_tokens") throw new Error("Claude ran out of room writing the video. Try a shorter brief.");
    const said = (out.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    messages = [...o.messages, { role: "assistant", content: said || "(no answer)" }, { role: "user", content: `Call the ${o.tool.name} tool now with your complete answer.` }];
  }
  throw new Error("Claude didn't return a video. Try again.");
}

/** Turns Anthropic's error replies into something a non-engineer can act on. */
export function claudeError(status: number, msg: string): string {
  if (/not scoped to a workspace/i.test(msg))
    return "This Anthropic key works across workspaces, so Claude also needs a workspace ID. An admin can add it under Settings → Anthropic workspace ID (copy it from the ID column at platform.claude.com/settings/workspaces), or save a key created for a single workspace instead.";
  if (/must be a valid workspace ID/i.test(msg)) return "The Anthropic workspace ID in Settings isn't valid. Copy it again from the ID column at platform.claude.com/settings/workspaces.";
  if (status === 404 && /workspace/i.test(msg)) return "Anthropic can't find that workspace for this key. Check the workspace ID in Settings, or that the key's owner is a member of that workspace.";
  if (status === 401) return "Anthropic doesn't recognise this key. It may have been deleted, or a character went missing when it was copied. An admin can paste it again in Settings.";
  if (status === 403) return `Anthropic refused the request (403): ${msg}. The key may not be allowed to use this workspace or model.`;
  if (/credit balance/i.test(msg)) return "The Anthropic account is out of credit. Top it up at platform.claude.com/settings/billing.";
  if (status === 429 || status === 529) return `Claude is busy right now (${status}). Try again in a minute.`;
  return `Claude: ${msg}`;
}

export async function claudeFetch(cred: ClaudeCred, path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-api-key": cred.key, "anthropic-version": "2023-06-01" };
  if (cred.workspace) headers["anthropic-workspace-id"] = cred.workspace;
  const res = await fetch(`https://api.anthropic.com${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(claudeError(res.status, String(out?.error?.message || res.statusText)));
  return out;
}

async function post(cred: ClaudeCred, payload: Record<string, unknown>): Promise<any> {
  return claudeFetch(cred, "/v1/messages", { body: payload });
}
