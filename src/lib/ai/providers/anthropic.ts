import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, ProviderCall, ProviderResult } from "../types";

/** Modelo que usa Reymen por defecto. Se puede cambiar con AI_DRAFT_MODEL sin tocar código. */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

type AnthropicClient = Pick<Anthropic, "beta">;
let injectedClient: AnthropicClient | null = null;
/** Solo para pruebas: reemplaza el cliente de Claude. */
export function setAnthropicClientForTests(client: AnthropicClient | null) {
  injectedClient = client;
}

export const anthropicProvider: AiProvider = {
  name: "anthropic",
  defaultModel: () => process.env.AI_DRAFT_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
  isConfigured: () => !!process.env.ANTHROPIC_API_KEY,
  async call({ system, messages, model, maxOutputTokens }: ProviderCall): Promise<ProviderResult> {
    const client = injectedClient ?? new Anthropic({ maxRetries: 1, timeout: 60_000 });
    const response = await client.beta.messages.create({
      model,
      max_tokens: maxOutputTokens,
      // Si un filtro de seguridad rechaza la solicitud, la API la reintenta sola con el modelo de respaldo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Un borrador corto no necesita razonar mucho: esfuerzo bajo = más rápido y barato.
      output_config: { effort: "low" },
      // Las instrucciones del negocio cambian poco: se cachean para las siguientes respuestas.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: messages as Anthropic.Beta.BetaMessageParam[],
    });
    const u = response.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
    // En Anthropic la entrada NO incluye lo leído ni lo escrito en caché (se cobran aparte) y el razonamiento va dentro de la salida.
    const usage = { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, cacheReadTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0, reasoningTokens: 0 };
    if (response.stop_reason === "refusal") return { refused: true, modelServed: response.model, usage, externalId: response.id };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { text, modelServed: response.model, usage, externalId: response.id };
  },
};
