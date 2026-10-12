import type { AiProvider } from "../types";
import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";

const PROVIDERS: Record<string, AiProvider> = { anthropic: anthropicProvider, openai: openaiProvider };

export function listProviders(): AiProvider[] {
  return Object.values(PROVIDERS);
}

/** Proveedor activo: AI_PROVIDER ("anthropic" por defecto, "openai", o "mock" para pruebas y demos locales). */
export function activeProviderName(): string {
  const name = process.env.AI_PROVIDER?.trim() || (process.env.AI_DRAFT_PROVIDER === "mock" ? "mock" : "anthropic");
  return name === "mock" || name in PROVIDERS ? name : "anthropic";
}

export function getProvider(name: string): AiProvider | null {
  return PROVIDERS[name] ?? null;
}
