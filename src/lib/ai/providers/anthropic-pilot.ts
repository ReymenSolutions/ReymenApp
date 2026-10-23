import Anthropic from "@anthropic-ai/sdk";
import type { ProviderCall, ProviderResult } from "../types";

/** Private pilot only: explicit model/key, one HTTP attempt, no beta fallback or caching. */
export async function callAnthropicPilot(input: ProviderCall): Promise<ProviderResult> {
  const apiKey = process.env.AI_MARK_PILOT_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("pilot_provider_not_configured");
  const proxy = process.env.AI_MARK_PILOT_PROXY_URL;
  if (proxy && (process.env.REYMEN_STAGING !== "true" || proxy !== "http://ingress:8081")) throw new Error("pilot_proxy_invalid");
  const client = new Anthropic({ apiKey, baseURL: proxy || "https://api.anthropic.com", maxRetries: 0, timeout: 5000, logLevel: "off" });
  const response = await client.messages.create({
    model: input.model, system: input.system, messages: input.messages,
    max_tokens: input.maxOutputTokens, stream: false,
  });
  const u = response.usage;
  if (!u || !Number.isSafeInteger(u.input_tokens) || !Number.isSafeInteger(u.output_tokens)) throw new Error("pilot_usage_missing");
  const usage = {
    inputTokens: u.input_tokens, outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0, reasoningTokens: 0,
  };
  if (response.stop_reason === "refusal") return { refused: true, modelServed: response.model, usage, externalId: response.id };
  return { text: response.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim(), modelServed: response.model, usage, externalId: response.id };
}
