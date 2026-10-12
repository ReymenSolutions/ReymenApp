import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMxnPerUsdRate } from "@/lib/exchange-rate";
import { computeCost, toMxn } from "./cost";
import { activeProviderName, getProvider } from "./providers";
import { AiBudgetError, estimateCallCostMxn, getBudgetState, releaseReservation, reserveBudget, type Estimate } from "./budget";
import { evaluateBudgetAlerts } from "./budget-alerts";
import type { AiUsageContext, ChatTurn, NormalizedUsage, ProviderResult } from "./types";

// ── Gateway de IA ────────────────────────────────────────────────────────────────────────────────────────────────
// Toda llamada a un modelo pasa por aquí: se identifica el tenant, se elige proveedor/modelo, se llama y se registra el
// uso (tokens, costo con la tarifa vigente, tipo de cambio) en el ledger por tenant. Antes de llamar RESERVA presupuesto del
// tenant (budget.ts): sin presupuesto (o sin forma de calcular el costo) la llamada NO se hace y queda registrada como BLOCKED.
//
// El ledger NO guarda prompts, respuestas ni datos personales.

export type AiCallInput = { system: string; messages: ChatTurn[]; maxOutputTokens: number; model?: string };

export type AiCallResult =
  | { text: string; model: string; inputTokens: number; outputTokens: number }
  | { refused: true; model: string };

const ZERO: NormalizedUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };

/** Tarifa vigente de un modelo en una fecha, o null si no hay (el costo queda como "sin tarifa", no inventado). */
export async function findRate(provider: string, model: string, at: Date) {
  return prisma.aiRate.findFirst({ where: { provider, model, effectiveFrom: { lte: at } }, orderBy: { effectiveFrom: "desc" } });
}

/** Cierra el registro de una llamada: tokens, estado y costo (con la tarifa y el tipo de cambio usados, para poder auditarlo). */
async function finish(id: string, provider: string, model: string, outcome: { status: "SUCCEEDED" | "FAILED" | "REFUSED"; usage: NormalizedUsage; modelServed?: string; externalId?: string; errorCode?: string; latencyMs: number }) {
  const now = new Date();
  const rate = await findRate(provider, model, now);
  let cost: Prisma.Decimal | null = null;
  let costMxn: Prisma.Decimal | null = null;
  let fx: Awaited<ReturnType<typeof getMxnPerUsdRate>> = null;
  if (rate) {
    cost = computeCost(outcome.usage, rate);
    if (rate.currency === "USD") fx = await getMxnPerUsdRate();
    costMxn = toMxn(cost, rate.currency, fx?.rate ?? null);
  }
  await prisma.aiUsage.update({
    where: { id },
    data: {
      status: outcome.status,
      modelServed: outcome.modelServed ?? null,
      externalId: outcome.externalId ?? null,
      errorCode: outcome.errorCode ?? null,
      latencyMs: outcome.latencyMs,
      inputTokens: outcome.usage.inputTokens,
      outputTokens: outcome.usage.outputTokens,
      cacheReadTokens: outcome.usage.cacheReadTokens,
      cacheWriteTokens: outcome.usage.cacheWriteTokens,
      reasoningTokens: outcome.usage.reasoningTokens,
      costBasis: rate ? "ESTIMATED" : "NO_RATE",
      rateId: rate?.id ?? null,
      costOriginal: cost,
      currencyOriginal: rate?.currency ?? null,
      costMxn,
      fxRate: costMxn && rate?.currency === "USD" && fx ? new Prisma.Decimal(fx.rate) : null,
      fxDate: costMxn && rate?.currency === "USD" ? (fx?.date ?? null) : null,
      fxSource: costMxn && rate?.currency === "USD" ? (fx?.source ?? null) : null,
      completedAt: now,
    },
  });
}

/**
 * Ejecuta una llamada de IA para un tenant y la registra. Lanza el error del proveedor (después de registrarlo como FAILED)
 * para que quien llama decida qué hacer; una llamada con el mismo `requestId` ya registrada no se vuelve a cobrar.
 */
export async function runAiCall(ctx: AiUsageContext, input: AiCallInput): Promise<AiCallResult> {
  if (!ctx.organizationId) throw new Error("ai_gateway_missing_tenant");
  const providerName = activeProviderName();
  const provider = getProvider(providerName);
  if (!provider) throw new Error("ai_provider_unavailable");
  const model = input.model?.trim() || provider.defaultModel();
  if (!model) throw new Error("ai_model_not_configured");

  const requestId = ctx.requestId ?? randomUUID();
  let usageId: string;
  try {
    const row = await prisma.aiUsage.create({
      data: {
        organizationId: ctx.organizationId,
        agentKey: ctx.agentKey,
        conversationId: ctx.conversationId ?? null,
        automationId: ctx.automationId ?? null,
        executionId: ctx.executionId ?? null,
        operation: ctx.operation,
        origin: ctx.origin,
        provider: providerName,
        model,
        requestId,
        traceId: ctx.traceId ?? null,
        correlationId: ctx.correlationId ?? null,
      },
      select: { id: true },
    });
    usageId = row.id;
  } catch (err) {
    // Misma llamada lógica ya registrada (reintento, doble clic): no se llama otra vez al proveedor ni se cuenta dos veces.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new Error("ai_duplicate_request");
    throw err;
  }

  // Presupuesto: el peor costo posible de esta llamada se reserva ANTES de hacerla (con candado por tenant).
  const now = new Date();
  const block = async (code: "BUDGET_EXHAUSTED" | "NO_RATE" | "NO_FX"): Promise<never> => {
    await prisma.aiUsage.update({ where: { id: usageId }, data: { status: "BLOCKED", errorCode: code, completedAt: new Date(), costBasis: "NO_RATE" } });
    if (code === "BUDGET_EXHAUSTED") await evaluateBudgetAlerts(ctx.organizationId, new Date(), { forceExhausted: true }).catch(() => undefined);
    throw new AiBudgetError(code);
  };
  const estimateFor = (p: string, m: string) => estimateCallCostMxn(p, m, { system: input.system, messages: input.messages, maxOutputTokens: input.maxOutputTokens }, now);
  const primary = await estimateFor(providerName, model);
  if ("code" in primary) return block(primary.code);
  const state = await getBudgetState(ctx.organizationId, now);
  let fallbackEstimate: Estimate | null = null;
  if (state.fallback) {
    const f = await estimateFor(state.fallback.provider, state.fallback.model);
    if (!("code" in f)) fallbackEstimate = { provider: state.fallback.provider, model: state.fallback.model, costMxn: f.costMxn };
  }
  const reservation = await reserveBudget(ctx.organizationId, usageId, { provider: providerName, model, costMxn: primary.costMxn }, fallbackEstimate, now);
  if (!reservation.ok) return block(reservation.code);
  let activeProvider = provider;
  let activeModel = model;
  let usedProviderName = providerName;
  if (reservation.degradeTo) {
    // Política DEGRADE autorizada: se usa el modelo económico configurado (queda registrado qué modelo se usó de verdad).
    const alt = getProvider(reservation.degradeTo.provider);
    if (!alt) {
      await releaseReservation(usageId);
      return block("BUDGET_EXHAUSTED");
    }
    activeProvider = alt;
    activeModel = reservation.degradeTo.model;
    usedProviderName = reservation.degradeTo.provider;
    await prisma.aiUsage.update({ where: { id: usageId }, data: { provider: usedProviderName, model: activeModel } });
  }

  const started = Date.now();
  let result: ProviderResult;
  try {
    result = await activeProvider.call({ system: input.system, messages: input.messages, model: activeModel, maxOutputTokens: input.maxOutputTokens });
  } catch (err) {
    // Un error del proveedor puede haber consumido tokens que no conocemos: queda FAILED con 0 y el código del error.
    await finish(usageId, usedProviderName, activeModel, { status: "FAILED", usage: ZERO, errorCode: (err instanceof Error ? err.message : String(err)).slice(0, 120), latencyMs: Date.now() - started });
    await releaseReservation(usageId);
    throw err;
  }
  await finish(usageId, usedProviderName, activeModel, { status: result.refused ? "REFUSED" : "SUCCEEDED", usage: result.usage, modelServed: result.modelServed, externalId: result.externalId, latencyMs: Date.now() - started });
  // El costo real ya está en el ledger: la reserva se libera y se revisan las alertas de consumo.
  await releaseReservation(usageId);
  await evaluateBudgetAlerts(ctx.organizationId).catch(() => undefined);
  if (result.refused) return { refused: true, model: result.modelServed };
  return { text: result.text, model: result.modelServed, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens };
}
