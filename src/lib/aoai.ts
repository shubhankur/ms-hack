// Azure OpenAI client — chat + embeddings.
// Uses the official `openai` SDK's AzureOpenAI class so we stay Azure-native.

import { AzureOpenAI } from "openai";
import type { z } from "zod";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_KEY;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21";

/** Deployment names (set in the Azure OpenAI resource). */
export const CHAT_DEPLOYMENT = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT ?? "gpt-4o";
export const MINI_DEPLOYMENT = process.env.AZURE_OPENAI_MINI_DEPLOYMENT ?? "gpt-4o-mini";
export const EMBED_DEPLOYMENT =
  process.env.AZURE_OPENAI_EMBED_DEPLOYMENT ?? "text-embedding-3-small";

let client: AzureOpenAI | null = null;

export function getClient(): AzureOpenAI {
  if (client) return client;
  if (!endpoint || !apiKey) {
    throw new Error(
      "AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY must be set (see .env.example).",
    );
  }
  client = new AzureOpenAI({ endpoint, apiKey, apiVersion });
  return client;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Plain chat completion returning text. */
export async function chat(
  messages: ChatMessage[],
  opts: { deployment?: string; temperature?: number } = {},
): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: opts.deployment ?? CHAT_DEPLOYMENT,
    temperature: opts.temperature ?? 0.4,
    messages,
  });
  return res.choices[0]?.message?.content ?? "";
}

/**
 * Chat completion constrained to JSON, validated against a Zod schema.
 * Retries once on validation failure with the error fed back to the model.
 */
export async function chatJSON<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  opts: { deployment?: string; temperature?: number } = {},
): Promise<T> {
  const run = async (extra: ChatMessage[]) => {
    const res = await getClient().chat.completions.create({
      model: opts.deployment ?? CHAT_DEPLOYMENT,
      temperature: opts.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [...messages, ...extra],
    });
    return res.choices[0]?.message?.content ?? "{}";
  };

  let raw = await run([]);
  let parsed = schema.safeParse(safeJson(raw));
  if (parsed.success) return parsed.data;

  raw = await run([
    { role: "assistant", content: raw },
    {
      role: "user",
      content: `That did not match the required schema (${parsed.error.message}). Return ONLY valid JSON matching the schema.`,
    },
  ]);
  parsed = schema.safeParse(safeJson(raw));
  if (parsed.success) return parsed.data;
  throw new Error(`chatJSON: model output failed schema: ${parsed.error.message}`);
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

/** Embed a batch of texts (single API call). Returns one vector per input. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getClient().embeddings.create({
    model: EMBED_DEPLOYMENT,
    input: texts,
  });
  return res.data.map((d) => d.embedding as number[]);
}
