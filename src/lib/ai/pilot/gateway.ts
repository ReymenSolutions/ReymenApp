import { createHash } from "node:crypto";
import { Prisma, type AiUsage } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMxnPerUsdRate } from "@/lib/exchange-rate";
import { computeCost, toMxn } from "../cost";
import { callAnthropicPilot } from "../providers/anthropic-pilot";
import type { NormalizedUsage, ProviderResult } from "../types";
import { assertPilotAuthority, lockPilotBudget, loadPilotQuotaState, PILOT_LIMITS } from "./budget";

type Tx = Prisma.TransactionClient;
const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const id = z.string().min(1).max(128);
const contextSchema = z.object({ organizationId: id, actorId: id, rootId: id, agentInstanceId: id, configVersion: z.number().int().positive(), step: z.union([z.literal(1), z.literal(2)]) }).strict();
export type PilotCallContext = z.infer<typeof contextSchema>;
const inputSchema = z.object({ system: z.string().max(12000), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(12000) }).strict()).min(1).max(8), maxOutputTokens: z.number().int().min(1).max(512) }).strict();
const tokens = z.number().int().nonnegative().max(2147483647);
const usageSchema = z.object({ inputTokens: tokens, outputTokens: tokens, cacheReadTokens: tokens, cacheWriteTokens: tokens, reasoningTokens: tokens }).strict();
const receiptId = z.string().regex(/^msg_[A-Za-z0-9_-]{1,120}$/);
function fail(code: string): never { throw new Error(code); }
function gate() {
  if (process.env.REYMEN_STAGING !== "true") fail("pilot_requires_staging");
  if (process.env.AI_MARK_PILOT_GATEWAY_ENABLED !== "true" || process.env.AI_MARK_PILOT_BUDGET_ENABLED !== "true") fail("pilot_gateway_disabled");
  if (!process.env.AI_MARK_PILOT_ANTHROPIC_API_KEY) fail("pilot_provider_not_configured");
}

async function activeRoot(tx: Tx, c: PilotCallContext, now: Date) {
  await assertPilotAuthority(tx, c.organizationId, c.actorId);
  const root = await tx.aiPilotBudgetRoot.findFirst({ where: { id: c.rootId, organizationId: c.organizationId, createdById: c.actorId } });
  if (!root || root.state !== "IN_FLIGHT") fail("pilot_root_not_dispatchable");
  const s = await loadPilotQuotaState(tx, c.organizationId, now);
  if (now < root.dayStart || now >= root.dayEnd || now >= root.cycleEnd || root.policyVersion !== s.policy.version || root.timezone !== s.timezone || root.cycleStart.getTime() !== s.global.cycleStart.getTime()) fail("pilot_root_expired");
  if (s.daily.add(s.held).gt(s.policy.dailyMxn) || s.monthly.add(s.held).gt(s.policy.monthlyMxn) || s.global.raw.spent.add(s.global.raw.reserved).gt(s.global.raw.available)) fail("pilot_budget_changed");
  const revision = await tx.agentConfigRevision.findFirst({ where: {
    organizationId: c.organizationId, agentInstanceId: c.agentInstanceId, version: c.configVersion,
    instance: { configVersion: c.configVersion, definitionKey: "mark", definitionVersion: 1, status: "PAUSED", channelRoutes: { none: { enabled: true } } },
  }, select: { version: true } });
  if (!revision || root.agentInstanceId && (root.agentInstanceId !== c.agentInstanceId || root.configVersion !== c.configVersion)) fail("pilot_config_changed");
  return root;
}

async function quote(model: string, input: z.infer<typeof inputSchema>) {
  const rate = await prisma.aiRate.findFirst({ where: { provider: "anthropic", model, effectiveFrom: { lte: new Date() } }, orderBy: { effectiveFrom: "desc" } });
  if (!rate) fail("pilot_no_rate");
  const rates = [rate.inputPerMTok, rate.outputPerMTok, rate.cacheReadPerMTok, rate.cacheWritePerMTok, rate.reasoningPerMTok].filter((v): v is Prisma.Decimal => v !== null);
  if (rates.some(v => !v.isFinite() || v.lt(0))) fail("pilot_invalid_rate");
  const rawFx = rate.currency === "USD" ? await getMxnPerUsdRate() : null;
  const fx = rawFx ? { ...rawFx, rate: Number(D(rawFx.rate).toDecimalPlaces(6, Prisma.Decimal.ROUND_CEIL)) } : null;
  // No tools, attachments, caching or hidden fallback. UTF-8 bytes plus framing allowance,
  // rather than the legacy chars/token heuristic, bound the submitted text conservatively.
  const inputBound = Buffer.byteLength(JSON.stringify(input), "utf8") + 1024;
  const maxIn = Prisma.Decimal.max(rate.inputPerMTok, rate.cacheReadPerMTok ?? 0, rate.cacheWritePerMTok ?? 0);
  const maxOut = Prisma.Decimal.max(rate.outputPerMTok, rate.reasoningPerMTok ?? 0);
  const original = D(inputBound).mul(maxIn).add(D(input.maxOutputTokens).mul(maxOut)).div(1000000);
  const mxn = toMxn(original, rate.currency, fx?.rate ?? null);
  if (mxn === null || !mxn.isFinite() || mxn.lt(0)) fail("pilot_no_fx");
  return { rate, fx, estimate: mxn.toDecimalPlaces(8, Prisma.Decimal.ROUND_CEIL) };
}

async function uncertain(organizationId: string, usageId: string) {
  await prisma.$transaction(async tx => {
    await lockPilotBudget(tx, organizationId);
    const usage = await tx.aiUsage.findFirst({ where: { id: usageId, organizationId, status: "PENDING", pilotStep: { not: null } } });
    if (!usage?.pilotRootId) return;
    await tx.aiUsage.update({ where: { id: usageId }, data: { errorCode: "PROVIDER_OUTCOME_UNCERTAIN" } });
    await tx.aiPilotBudgetRoot.update({ where: { id: usage.pilotRootId }, data: { state: "UNCERTAIN" } });
    const paused = await tx.aiPilotBudgetPolicy.updateMany({ where: { organizationId, enabled: true }, data: { enabled: false, version: { increment: 1 } } });
    if (paused.count) await tx.auditLog.create({ data: { organizationId, action: "ai.pilot_budget.safety_pause", resource: "AiUsage", resourceId: usageId, metadata: { reason: "PROVIDER_OUTCOME_UNCERTAIN" } } });
  });
}

async function settle(tx: Tx, row: AiUsage, outcome: { status: "SUCCEEDED" | "REFUSED" | "FAILED"; usage: NormalizedUsage; externalId?: string; modelServed?: string; noCharge?: boolean; latencyMs?: number; reviewedEvidence?: boolean }) {
  usageSchema.parse(outcome.usage);
  const served = outcome.modelServed ?? row.model;
  const rate = outcome.reviewedEvidence && served !== row.model
    ? await tx.aiRate.findFirst({ where: { provider: row.provider, model: served, effectiveFrom: { lte: row.createdAt } }, orderBy: { effectiveFrom: "desc" } })
    : row.rateId ? await tx.aiRate.findUnique({ where: { id: row.rateId } }) : null;
  if (!rate || !row.pilotRootId || row.pilotEstimateMxn === null) fail("pilot_rate_snapshot_missing");
  if (rate.currency !== row.currencyOriginal) fail("pilot_reconciliation_currency_mismatch");
  const original = computeCost(outcome.usage, rate);
  const converted = toMxn(original, row.currencyOriginal ?? "", row.fxRate === null ? null : Number(row.fxRate));
  if (converted === null) fail("pilot_cost_unknown");
  const cost = converted.toDecimalPlaces(8, Prisma.Decimal.ROUND_CEIL);
  if (!outcome.reviewedEvidence && cost.gt(row.pilotEstimateMxn)) fail("pilot_cost_exceeds_reservation");
  const root = await tx.aiPilotBudgetRoot.findUniqueOrThrow({ where: { id: row.pilotRootId } });
  const spent = (await tx.aiUsage.aggregate({ where: { organizationId: row.organizationId, pilotRootId: root.id, status: { in: ["SUCCEEDED", "REFUSED", "FAILED"] } }, _sum: { costMxn: true } }))._sum.costMxn ?? D(0);
  if (!outcome.reviewedEvidence && spent.add(cost).gt(root.rootLimitMxn)) fail("pilot_root_limit_exceeded");
  // Reviewed provider usage must record reality even if it exceeded the admitted bound.
  const overrun = cost.gt(row.pilotEstimateMxn) || spent.add(cost).gt(root.rootLimitMxn);
  const hold = Prisma.Decimal.max(0, root.rootLimitMxn.sub(spent).sub(cost)).toDecimalPlaces(6, Prisma.Decimal.ROUND_CEIL);
  const saved = await tx.aiUsage.update({ where: { id: row.id }, data: {
    status: outcome.status, modelServed: outcome.noCharge ? null : served, externalId: outcome.externalId ?? null, rateId: rate.id,
    ...outcome.usage, costOriginal: original, costMxn: cost,
    costBasis: outcome.noCharge ? "CONFIRMED" : "ESTIMATED", completedAt: new Date(),
    errorCode: outcome.noCharge ? "PROVIDER_CONFIRMED_NO_CHARGE" : overrun ? "PILOT_COST_OVERRUN" : null,
    latencyMs: outcome.latencyMs,
  } });
  const pending = await tx.aiUsage.count({ where: { organizationId: row.organizationId, pilotRootId: root.id, status: "PENDING" } });
  await tx.aiPilotBudgetRoot.update({ where: { id: root.id }, data: {
    holdMxn: hold, state: hold.isZero() ? "CLOSED" : pending ? "UNCERTAIN" : "IN_FLIGHT", closedAt: hold.isZero() ? new Date() : null,
  } });
  return saved;
}

/** Server-internal, private evaluation only. No HTTP action/channel calls this yet. */
export async function runPilotAiCall(context: PilotCallContext, rawInput: z.infer<typeof inputSchema>): Promise<ProviderResult> {
  gate();
  const c = contextSchema.parse(context), input = inputSchema.parse(rawInput);
  if (input.messages[input.messages.length - 1].role !== "user" || input.system.length + input.messages.reduce((n, m) => n + m.content.length, 0) > 12000) fail("pilot_input_invalid");
  const model = process.env.AI_MARK_PILOT_MODEL?.trim();
  if (!model || !/^[a-zA-Z0-9._-]{1,120}$/.test(model)) fail("pilot_model_not_configured");
  await prisma.$transaction(async tx => { await lockPilotBudget(tx, c.organizationId); await activeRoot(tx, c, new Date()); });
  const pricing = await quote(model, input);
  const row = await prisma.$transaction(async tx => {
    await lockPilotBudget(tx, c.organizationId); gate();
    const root = await activeRoot(tx, c, new Date());
    const calls = await tx.aiUsage.findMany({ where: { organizationId: c.organizationId, pilotRootId: c.rootId } });
    if (calls.some(v => v.pilotStep === c.step)) fail("pilot_duplicate_step");
    if (calls.some(v => v.status === "PENDING" || v.costMxn === null || v.pilotStep === null) || calls.length !== c.step - 1) fail("pilot_step_out_of_order");
    const spent = calls.reduce((sum, v) => sum.add(v.costMxn ?? 0), D(0));
    if (pricing.estimate.gt(root.holdMxn) || spent.add(pricing.estimate).gt(root.rootLimitMxn)) fail("pilot_step_budget_exhausted");
    await tx.aiPilotBudgetRoot.update({ where: { id: root.id }, data: { agentInstanceId: c.agentInstanceId, configVersion: c.configVersion } });
    return tx.aiUsage.create({ data: {
      organizationId: c.organizationId, agentKey: PILOT_LIMITS.agentKey, pilotRootId: root.id, pilotStep: c.step,
      pilotEstimateMxn: pricing.estimate, pilotInputHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
      requestId: `mark-pilot:${root.id}:${c.step}`, operation: "pilot_probe", origin: "webchat", provider: "anthropic", model,
      rateId: pricing.rate.id, costBasis: "ESTIMATED", currencyOriginal: pricing.rate.currency,
      fxRate: pricing.fx ? D(pricing.fx.rate).toDecimalPlaces(6) : null,
      fxDate: pricing.fx?.date, fxSource: pricing.fx?.source,
    } });
  }, { timeout: 15000 });
  const started = Date.now();
  try {
    // The durable claim above is the sole dispatch admission. Crashes retain the root hold.
    gate();
    const result = await callAnthropicPilot({ ...input, model });
    if (result.modelServed !== model) fail("pilot_unexpected_model");
    receiptId.parse(result.externalId);
    await prisma.$transaction(async tx => {
      await lockPilotBudget(tx, c.organizationId);
      const pending = await tx.aiUsage.findFirstOrThrow({ where: { id: row.id, organizationId: c.organizationId, status: "PENDING" } });
      await settle(tx, pending, { status: result.refused ? "REFUSED" : "SUCCEEDED", usage: result.usage, externalId: result.externalId, latencyMs: Date.now() - started });
    });
    return result;
  } catch {
    await uncertain(c.organizationId, row.id).catch(() => undefined);
    // No raw provider errors, prompts, responses or credentials in the ledger/logs.
    return fail("pilot_outcome_uncertain");
  }
}

async function admin(tx: Tx, actorId: string) {
  if (!await tx.user.findFirst({ where: { id: actorId, isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } })) fail("pilot_reconciliation_forbidden");
}
export const pilotReconciliationEvidence = z.object({
  kind: z.enum(["PROVIDER_USAGE", "PROVIDER_NO_CHARGE"]),
  reference: z.string().min(8).max(120).regex(/^[a-zA-Z0-9._:/-]+$/),
  externalId: z.string().regex(/^(msg|req)_[A-Za-z0-9_-]{1,120}$/),
  modelServed: z.string().min(1).max(120).optional(),
  usage: usageSchema,
  outcome: z.enum(["SUCCEEDED", "REFUSED", "FAILED"]),
}).strict();
/** Manual platform-admin reconciliation; the staging action reuses this fresh authorization. */
export async function reconcilePilotCall(organizationId: string, adminId: string, usageId: string, rawEvidence: z.infer<typeof pilotReconciliationEvidence>) {
  const evidence = pilotReconciliationEvidence.parse(rawEvidence);
  if (evidence.kind === "PROVIDER_NO_CHARGE" && (evidence.outcome !== "FAILED" || Object.values(evidence.usage).some(v => v !== 0))) fail("pilot_invalid_no_charge_evidence");
  if (evidence.kind !== "PROVIDER_NO_CHARGE") {
    receiptId.parse(evidence.externalId);
    if (!evidence.modelServed) fail("pilot_reconciliation_model_required");
  }
  return prisma.$transaction(async tx => {
    await lockPilotBudget(tx, organizationId); await admin(tx, adminId);
    const row = await tx.aiUsage.findFirst({ where: { id: usageId, organizationId, pilotStep: { not: null } } });
    if (!row || row.status !== "PENDING") fail("pilot_call_not_pending");
    const saved = await settle(tx, row, { status: evidence.outcome, usage: evidence.usage, externalId: evidence.externalId, modelServed: evidence.modelServed, noCharge: evidence.kind === "PROVIDER_NO_CHARGE", reviewedEvidence: true });
    await tx.auditLog.create({ data: { organizationId, userId: adminId, action: "ai.pilot_usage.reconcile", resource: "AiUsage", resourceId: row.id, metadata: { kind: evidence.kind, reference: evidence.reference, externalId: evidence.externalId, costMxn: saved.costMxn!.toString() } } });
    return saved;
  });
}

/** Release unused root capacity only when every admitted call has known cost. Flags may be off. */
export async function closePilotRoot(organizationId: string, actorId: string, rootId: string, platformOnly = false) {
  return prisma.$transaction(async tx => {
    await lockPilotBudget(tx, organizationId);
    const root = await tx.aiPilotBudgetRoot.findFirst({ where: { id: rootId, organizationId } });
    if (!root) fail("pilot_root_not_found");
    if (!platformOnly && root.createdById === actorId) await assertPilotAuthority(tx, organizationId, actorId); else await admin(tx, actorId);
    if (root.state === "CLOSED") return root;
    if (await tx.aiUsage.count({ where: { organizationId, pilotRootId: rootId, OR: [{ status: "PENDING" }, { costMxn: null }] } })) fail("pilot_reconciliation_required");
    const closed = await tx.aiPilotBudgetRoot.update({ where: { id: rootId }, data: { state: "CLOSED", holdMxn: 0, closedAt: new Date() } });
    await tx.auditLog.create({ data: { organizationId, userId: actorId, action: "ai.pilot_root.close", resource: "AiPilotBudgetRoot", resourceId: rootId } });
    return closed;
  });
}
