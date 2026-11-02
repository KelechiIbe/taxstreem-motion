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
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": o.key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: o.maxTokens ?? 16000,
      system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }],
      messages: o.messages,
      tools: [o.tool],
      tool_choice: { type: "tool", name: o.tool.name },
    }),
  });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = out?.error?.message || res.statusText;
    if (res.status === 401) throw new Error("Claude rejected the API key. An admin can update it in Settings.");
    if (res.status === 429 || res.status === 529) throw new Error(`Claude is busy right now (${res.status}). Try again in a minute.`);
    throw new Error(`Claude: ${msg}`);
  }
  const block = (out.content ?? []).find((b: any) => b.type === "tool_use");
  if (!block) throw new Error(out.stop_reason === "max_tokens" ? "Claude ran out of room writing the video. Try a shorter brief." : "Claude didn't return a video.");
  return { input: block.input as T, usage: { input: out.usage?.input_tokens ?? 0, output: out.usage?.output_tokens ?? 0 } };
}
