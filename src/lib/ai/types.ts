/** Quién pide la llamada y para qué: lo que el ledger necesita para atribuir el costo (siempre un tenant). */
export type AiUsageContext = {
  organizationId: string;
  /** inbox:<canal> | pipeline | probador */
  agentKey: string;
  /** draft | auto_reply | pipeline | probe */
  operation: string;
  /** whatsapp | instagram | crm | pipeline | web | automation | admin … */
  origin: string;
  conversationId?: string | null;
  automationId?: string | null;
  executionId?: string | null;
  /** Llave de idempotencia de la llamada lógica; si no se da, se genera una. */
  requestId?: string;
  traceId?: string | null;
  correlationId?: string | null;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Tokens normalizados: así se calcula el costo igual sin importar cómo los reporte cada proveedor. */
export type NormalizedUsage = {
  /** Entrada que NO vino de caché. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Razonamiento reportado aparte (si el proveedor no lo separa, ya va dentro de outputTokens). */
  reasoningTokens: number;
};

export type ProviderCall = { system: string; messages: ChatTurn[]; model: string; maxOutputTokens: number };

export type ProviderResult =
  | { refused: true; modelServed: string; usage: NormalizedUsage; externalId?: string }
  | { refused?: false; text: string; modelServed: string; usage: NormalizedUsage; externalId?: string };

/** Un proveedor de IA. Agregar otro es implementar esto y registrarlo; el gateway no cambia. */
export interface AiProvider {
  readonly name: string;
  /** Modelo por defecto de este proveedor (se puede cambiar por variable de entorno sin tocar código). */
  defaultModel(): string;
  isConfigured(): boolean;
  call(input: ProviderCall): Promise<ProviderResult>;
}
