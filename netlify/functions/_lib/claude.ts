// Minimal Anthropic Messages client with a forced tool call, so replies are always structured.
import { env } from "./http";

export const MODEL = () => env("MOTION_MODEL") || "claude-opus-5-5";

export type Block =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface Msg {
  role: "user" | "assistant";
  content: string | Block[];
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export async function callTool<T>(o: { key: string; system: string; messages: Msg[]; tool: Tool; maxTokens?: number }): Promise<{ input: T; usage: { input: number; output: number } }> {
  // Opus 5.5 doesn't accept a forced tool_choice, so the tool is offered ("auto") and the
  // system prompt says to call it; if Claude answers in prose instead, it is asked once more.
  let messages = o.messages;
  const usage = { input: 0, output: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await post(o.key, {
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

async function post(key: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload),
  });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = out?.error?.message || res.statusText;
    if (res.status === 401 || res.status === 403) throw new Error(`Anthropic refused the API key (${res.status}): ${msg}. An admin can update it in Settings.`);
    if (res.status === 429 || res.status === 529) throw new Error(`Claude is busy right now (${res.status}). Try again in a minute.`);
    throw new Error(`Claude: ${msg}`);
  }
  return out;
}
