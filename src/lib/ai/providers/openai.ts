import type { AiProvider, ProviderCall, ProviderResult } from "../types";

// OpenAI por la API de Chat Completions con `fetch` (sin dependencia nueva). La llave nunca sale del servidor.
// NOTA: esta integración se probó solo con respuestas simuladas; no se ha ejecutado contra la API real.

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

type OpenAiResponse = {
  id?: string;
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number } };
};

export const openaiProvider: AiProvider = {
  name: "openai",
  // Sin modelo por defecto en código: el modelo (y su tarifa) se eligen con AI_OPENAI_MODEL.
  defaultModel: () => process.env.AI_OPENAI_MODEL?.trim() ?? "",
  isConfigured: () => !!process.env.OPENAI_API_KEY && !!process.env.AI_OPENAI_MODEL?.trim(),
  async call({ system, messages, model, maxOutputTokens }: ProviderCall): Promise<ProviderResult> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, max_completion_tokens: maxOutputTokens, messages: [{ role: "system", content: system }, ...messages] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`openai_http_${res.status}`);
    const body = (await res.json()) as OpenAiResponse;
    const u = body.usage ?? {};
    const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
    const reasoning = u.completion_tokens_details?.reasoning_tokens ?? 0;
    // En OpenAI la entrada incluye lo cacheado y la salida incluye el razonamiento: se separan para cobrar cada parte con su tarifa.
    const usage = { inputTokens: Math.max(0, (u.prompt_tokens ?? 0) - cached), outputTokens: Math.max(0, (u.completion_tokens ?? 0) - reasoning), cacheReadTokens: cached, cacheWriteTokens: 0, reasoningTokens: reasoning };
    const choice = body.choices?.[0];
    const modelServed = body.model ?? model;
    if (choice?.message?.refusal || choice?.finish_reason === "content_filter") return { refused: true, modelServed, usage, externalId: body.id };
    return { text: (choice?.message?.content ?? "").trim(), modelServed, usage, externalId: body.id };
  },
};
