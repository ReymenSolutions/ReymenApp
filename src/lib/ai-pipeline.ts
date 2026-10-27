import { assertKnowledgeCurrent } from "@/lib/ai/knowledge/retrieval";
import { connectionAiAllowed } from "./channel-connections/service";
import { after } from "next/server";
import { observeLegacyCompletion } from "./ai/agents/executions";
import type { LeadStatus, MessageRole, PipelineAiActionKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import { getChannelMode } from "@/lib/agent-mode";
import { buildBusinessContext } from "@/lib/rulebook";
import { buildDraftMessages, generateText, isDraftProviderConfigured } from "@/lib/ai-draft";
import { AiBudgetError } from "@/lib/ai/budget";
import { recordProfileSuggestion } from "@/lib/realty/profile-suggestion";
import { syncLeadStatusFromOpportunity } from "@/lib/lead-status-sync";
import { AUTO_JOB_SOURCE, PIPELINE_JOB_TYPE, AUTO_JOB_LEASE_MS, AUTO_JOB_MAX_ATTEMPTS } from "./ai-auto-jobs";

// ── Pipeline con IA ──────────────────────────────────────────────────────────
// El agente lee cada mensaje nuevo de un contacto del CRM y decide qué pasa con su oportunidad.
//  • Seguro (se aplica solo, con el motivo y botón de deshacer): crear la oportunidad de quien muestra interés de
//    compra, o adelantarla UNA etapa abierta.
//  • Riesgoso (solo sugerencia que una persona acepta o descarta): cerrarla como ganada o perdida.
// Nunca retrocede etapas, nunca borra, nunca cambia montos. Con el canal en "Apagado" no hace nada.

export const INTENTS = ["pricing_inquiry", "booking_request", "ready_to_buy", "support", "complaint", "not_interested", "other"] as const;
export type Intent = (typeof INTENTS)[number];
const BUYING: ReadonlySet<string> = new Set(["pricing_inquiry", "booking_request", "ready_to_buy"]);

/** Entre dos análisis de la misma conversación pasa al menos esto (evita analizar cada mensajito). */
export const ANALYSIS_COOLDOWN_MS = 10 * 60 * 1000;
/** Si una persona deshizo una acción, el agente no la repite para esa oportunidad durante este tiempo. */
export const UNDO_RESPECT_MS = 7 * 24 * 60 * 60 * 1000;

export type Analysis = { intent: Intent; summary: string; action: "none" | "create_opportunity" | "advance_stage" | "close_won" | "close_lost"; title: string; reason: string; /** Perfil de búsqueda inmobiliario que mencionó el cliente (sin validar; solo si la organización tiene Real Estate). */ searchProfile?: unknown };

/** Lee el análisis del modelo (JSON). Si no se entiende, devuelve null y no se hace nada. */
export function parseAnalysis(raw: string): Analysis | null {
  const body = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const p = JSON.parse(body) as Record<string, unknown>;
    const intent = (INTENTS as readonly string[]).includes(p.intent as string) ? (p.intent as Intent) : "other";
    const actions = ["none", "create_opportunity", "advance_stage", "close_won", "close_lost"];
    const action = actions.includes(p.action as string) ? (p.action as Analysis["action"]) : "none";
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const summary = str(p.summary, 400);
    if (!summary) return null;
    const base = { intent, summary, action, title: str(p.title, 80), reason: str(p.reason, 300) };
    return p.search_profile && typeof p.search_profile === "object" ? { ...base, searchProfile: p.search_profile } : base;
  } catch {
    return null;
  }
}

export type PlanStage = { id: string; name: string; order: number; isWon: boolean; isLost: boolean };
export type PlanContext = {
  leadName: string;
  stages: PlanStage[];
  openOpportunity: { id: string; title: string; stageId: string } | null;
  /** Acciones que una persona deshizo hace poco (`kind:oportunidad`, o `kind:` para crear) y sugerencias aún pendientes. */
  blocked: ReadonlySet<string>;
};
export type PlannedAction = {
  kind: PipelineAiActionKind;
  status: "APPLIED" | "SUGGESTED";
  reason: string;
  opportunityTitle: string;
  toStage: PlanStage;
  fromStage: PlanStage | null;
};

/** Decide, con reglas fijas, qué se hace con el análisis del modelo. El modelo propone; esto es lo que se permite. */
export function planAction(analysis: Analysis, ctx: PlanContext): PlannedAction | null {
  const open = [...ctx.stages].filter((s) => !s.isWon && !s.isLost).sort((a, b) => a.order - b.order);
  const opp = ctx.openOpportunity;
  const current = opp ? ctx.stages.find((s) => s.id === opp.stageId) ?? null : null;
  const reason = analysis.reason || analysis.summary;
  const blocked = (kind: PipelineAiActionKind) => ctx.blocked.has(`${kind}:${opp?.id ?? ""}`);

  switch (analysis.action) {
    case "create_opportunity": {
      if (opp || !BUYING.has(analysis.intent) || !open[0] || blocked("CREATE_OPPORTUNITY")) return null;
      return { kind: "CREATE_OPPORTUNITY", status: "APPLIED", reason, opportunityTitle: analysis.title || `Interés de ${ctx.leadName}`, toStage: open[0], fromStage: null };
    }
    case "advance_stage": {
      if (!opp || !current || !BUYING.has(analysis.intent) || blocked("ADVANCE_STAGE")) return null;
      const next = open.find((s) => s.order > current.order);
      if (!next || current.isWon || current.isLost) return null;
      return { kind: "ADVANCE_STAGE", status: "APPLIED", reason, opportunityTitle: opp.title, toStage: next, fromStage: current };
    }
    case "close_won": {
      const won = ctx.stages.find((s) => s.isWon);
      if (!opp || !current || !won || analysis.intent !== "ready_to_buy" || blocked("CLOSE_WON")) return null;
      return { kind: "CLOSE_WON", status: "SUGGESTED", reason, opportunityTitle: opp.title, toStage: won, fromStage: current };
    }
    case "close_lost": {
      const lost = ctx.stages.find((s) => s.isLost);
      if (!opp || !current || !lost || analysis.intent !== "not_interested" || blocked("CLOSE_LOST")) return null;
      return { kind: "CLOSE_LOST", status: "SUGGESTED", reason, opportunityTitle: opp.title, toStage: lost, fromStage: current };
    }
    default:
      return null;
  }
}

const SYSTEM = `You analyse a customer conversation of a small business to keep its sales pipeline up to date. A person supervises; you only classify and propose.

Answer with ONLY this JSON:
{"intent":"pricing_inquiry|booking_request|ready_to_buy|support|complaint|not_interested|other","summary":"<one sentence in Spanish: what the customer wants>","action":"none|create_opportunity|advance_stage|close_won|close_lost","title":"<short opportunity title in Spanish, only for create_opportunity>","reason":"<one sentence in Spanish explaining why you chose that action>"}

Rules:
- create_opportunity: the customer shows real buying interest (asks price, wants to book or buy) and has no open opportunity.
- advance_stage: there is an open opportunity and the conversation clearly moved it one step forward (e.g. received a quote and asks to schedule).
- close_won: the customer explicitly confirmed the purchase or booking. close_lost: the customer explicitly said they are not interested or chose someone else.
- Greetings, support questions, complaints and anything unclear are "none". When in doubt, "none".`;

// Solo se agrega cuando la organización tiene Real Estate: la misma llamada al modelo, sin costo extra de otra consulta.
const REALTY_SYSTEM = `REAL ESTATE: if the customer says what property they are looking for, also add to the JSON a "search_profile" object:
{"operation":"SALE|RENT","property_type":"HOUSE|APARTMENT|LAND|OFFICE|COMMERCIAL|WAREHOUSE|OTHER","max_budget":<number in MXN>,"min_budget":<number or null>,"zones":["<neighbourhood names they mentioned>"],"min_bedrooms":<number or null>,"preferences":["parking|pet_friendly|furnished|terrace|garden|amenities|pool|security|study|storage"],"move_timeline":"<short, in Spanish, or null>"}
Only include "search_profile" when the customer stated BOTH whether they want to buy or rent AND a budget. Never guess: omit any field they did not say, and omit the whole object otherwise. A person reviews it before anything is saved.`;

type RunOutcome = "analyzed" | "skipped";

/** Analiza el último mensaje del cliente de una conversación y aplica o sugiere lo que corresponda. Nunca lanza. */
export async function runPipelineAgent(organizationId: string, conversationId: string, opts: { now?: Date; messageId?: string; throwOnError?: boolean } = {}): Promise<RunOutcome> {
  const now = opts.now ?? new Date();
  try {
    if (!isDraftProviderConfigured()) return "skipped";
    if (!(await hasModule(organizationId, "CRM")) || !(await hasModule(organizationId, "AI_WHATSAPP"))) return "skipped";

    const conv = await prisma.conversation.findFirst({ where: { id: conversationId, organizationId } });
    if (!conv?.leadId || (conv.channelConnectionId && !await prisma.$transaction(tx => connectionAiAllowed(tx, organizationId, conv)))) return "skipped";
    if ((await getChannelMode(organizationId, conv.channel)) === "OFF") return "skipped";
    const lead = await prisma.lead.findFirst({ where: { id: conv.leadId, organizationId, deletedAt: null }, select: { id: true, name: true, status: true } });
    if (!lead) return "skipped";

    const recent = await prisma.message.findMany({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, select: { id: true, role: true, content: true } });
    const messages = recent.reverse();
    const last = messages[messages.length - 1];
    if (!last || last.role !== "USER" || (opts.messageId && last.id !== opts.messageId)) return "skipped";

    const lastRun = await prisma.pipelineAiRun.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (lastRun && now.getTime() - lastRun.createdAt.getTime() < ANALYSIS_COOLDOWN_MS) return "skipped";

    const stages = await prisma.pipelineStage.findMany({ where: { organizationId }, orderBy: { order: "asc" }, select: { id: true, name: true, order: true, isWon: true, isLost: true } });
    if (stages.length === 0) return "skipped";
    const openOpp = await prisma.opportunity.findFirst({
      where: { leadId: lead.id, organizationId, closedAt: null, pipelineStage: { isWon: false, isLost: false } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, pipelineStageId: true },
    });

    const { instructions, knowledgeVersion, knowledgeManaged } = await buildBusinessContext(organizationId, last.content, `pipeline:${conversationId}:${last.id}`);
    const realty = await hasModule(organizationId, "REALTY");
    const system = [
      SYSTEM,
      ...(realty ? [REALTY_SYSTEM] : []),
      `PIPELINE STAGES (in order)\n${stages.map((s) => `- ${s.name}${s.isWon ? " (won)" : s.isLost ? " (lost)" : ""}`).join("\n")}`,
      `CONTACT\nName: ${lead.name}\nCRM status: ${lead.status}\nOpen opportunity: ${openOpp ? `"${openOpp.title}" at stage "${stages.find((s) => s.id === openOpp.pipelineStageId)?.name ?? "?"}"` : "none"}`,
      ...(instructions.trim() ? [`BUSINESS CONTEXT\n${(knowledgeManaged ? instructions.trim() : instructions.trim().slice(0, 3000))}`] : []),
    ].join("\n\n");
    const turns = buildDraftMessages(messages as { role: MessageRole; content: string }[]);
    if (turns.length === 0) return "skipped";

    const mockText = JSON.stringify({ intent: "pricing_inquiry", summary: "Pregunta por precios.", action: openOpp ? "none" : "create_opportunity", title: `Interés de ${lead.name}`, reason: "Preguntó por precios." });
    const result = await generateText({ organizationId, agentKey: "pipeline", operation: "pipeline", origin: "pipeline", conversationId, requestId: `pipeline:${conversationId}:${last.id}` }, system, turns, { json: true, mockText });
    if ("refused" in result) return "skipped";
    await prisma.$transaction(tx => assertKnowledgeCurrent(tx, organizationId, knowledgeVersion));
    const analysis = parseAnalysis(result.text);
    if (!analysis) return "skipped";

    const currentLast = await prisma.message.findFirst({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    if (currentLast?.id !== last.id || (conv.channelConnectionId && !await prisma.$transaction(tx => connectionAiAllowed(tx, organizationId, conv)))) return "skipped";

    // Una sola vez por mensaje (llave única): si otra petición ya lo analizó, no se repite.
    let run;
    try {
      run = await prisma.pipelineAiRun.create({ data: { organizationId, conversationId, leadId: lead.id, basedOnMessageId: last.id, intent: analysis.intent, summary: analysis.summary, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens } });
    } catch {
      return "skipped";
    }

    // La propuesta de perfil de Real Estate es independiente del pipeline y nunca lo detiene.
    if (realty && analysis.searchProfile) await recordProfileSuggestion(organizationId, { leadId: lead.id, messageId: last.id, reason: analysis.summary, raw: analysis.searchProfile, now }).catch(() => undefined);

    const [undone, pending] = await Promise.all([
      prisma.pipelineAiAction.findMany({ where: { leadId: lead.id, status: "UNDONE", resolvedAt: { gte: new Date(now.getTime() - UNDO_RESPECT_MS) } }, select: { kind: true, opportunityId: true } }),
      prisma.pipelineAiAction.findMany({ where: { leadId: lead.id, status: "SUGGESTED" }, select: { kind: true, opportunityId: true } }),
    ]);
    const blocked = new Set([...undone, ...pending].map((a) => `${a.kind}:${a.opportunityId ?? ""}`));
    // Crear: una oportunidad deshecha no tiene id al que atarse, así que cuenta por contacto.
    for (const a of undone) if (a.kind === "CREATE_OPPORTUNITY") blocked.add("CREATE_OPPORTUNITY:");

    const plan = planAction(analysis, { leadName: lead.name, stages, openOpportunity: openOpp ? { id: openOpp.id, title: openOpp.title, stageId: openOpp.pipelineStageId } : null, blocked });
    if (!plan) return "analyzed";

    if (plan.status === "SUGGESTED") {
      await prisma.pipelineAiAction.create({ data: { organizationId, runId: run.id, leadId: lead.id, opportunityId: openOpp?.id ?? null, kind: plan.kind, status: "SUGGESTED", reason: plan.reason, opportunityTitle: plan.opportunityTitle, fromStageId: plan.fromStage?.id ?? null, fromStageName: plan.fromStage?.name ?? null, toStageId: plan.toStage.id, toStageName: plan.toStage.name } });
      await logAudit({ organizationId, action: "pipeline_ai.suggest", resource: "Lead", resourceId: lead.id, metadata: { kind: plan.kind, reason: plan.reason } });
      return "analyzed";
    }

    let opportunityId = openOpp?.id ?? null;
    if (plan.kind === "CREATE_OPPORTUNITY") {
      const created = await prisma.opportunity.create({ data: { organizationId, leadId: lead.id, pipelineStageId: plan.toStage.id, title: plan.opportunityTitle, ownerId: conv.assignedToId ?? null } });
      opportunityId = created.id;
      await logAudit({ organizationId, action: "opportunity.create", resource: "Opportunity", resourceId: created.id, metadata: { title: created.title, leadId: lead.id, via: "ai" } });
    } else if (opportunityId) {
      await prisma.opportunity.update({ where: { id: opportunityId }, data: { pipelineStageId: plan.toStage.id, closedAt: null } });
      await logAudit({ organizationId, action: "opportunity.stage_change", resource: "Opportunity", resourceId: opportunityId, metadata: { fromStageId: plan.fromStage?.id, toStageId: plan.toStage.id, toStageName: plan.toStage.name, via: "ai" } });
    }
    let leadStatusAfter: LeadStatus | null = null;
    if (opportunityId) leadStatusAfter = await syncLeadStatusFromOpportunity({ organizationId, opportunityId, userId: null });
    await prisma.pipelineAiAction.create({
      data: {
        organizationId, runId: run.id, leadId: lead.id, opportunityId, kind: plan.kind, status: "APPLIED", reason: plan.reason, opportunityTitle: plan.opportunityTitle,
        fromStageId: plan.fromStage?.id ?? null, fromStageName: plan.fromStage?.name ?? null, toStageId: plan.toStage.id, toStageName: plan.toStage.name,
        leadStatusBefore: leadStatusAfter ? lead.status : null, leadStatusAfter,
      },
    });
    await logAudit({ organizationId, action: "pipeline_ai.apply", resource: "Lead", resourceId: lead.id, metadata: { kind: plan.kind, reason: plan.reason, opportunityId } });
    return "analyzed";
  } catch (err) {
    if (err instanceof AiBudgetError) return "skipped"; // pausa por presupuesto: el pipeline manual sigue funcionando
    if (opts.throwOnError) throw err;
    console.error("[ai-pipeline] failed");
    return "skipped";
  }
}

/** after is an optimization over the persisted jobs, not the only copy of accepted work. */
export function schedulePipelineAgent(organizationId: string, conversationId: string) {
  const job = () => recoverPipelineAnalyses({ organizationId, conversationId }).then(() => undefined).catch(() => { console.error("[ai-pipeline] fast path interrupted"); });
  try { after(job); } catch { void job(); }
}

/** Minimal recovery for existing CRM analysis; uncertain model/write attempts are never replayed. */
export async function recoverPipelineAnalyses(opts: { now?: Date; limit?: number; organizationId?: string; conversationId?: string } = {}) {
  const now = opts.now ?? new Date();
  const jobs = await prisma.webhookEvent.findMany({ where: {
    source: AUTO_JOB_SOURCE, eventType: PIPELINE_JOB_TYPE,
    ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
    ...(opts.conversationId ? { payload: { path: ["conversationId"], equals: opts.conversationId } } : {}),
    OR: [ { status: "PENDING" },
      { status: "PROCESSING", OR: [{ claimedAt: { lt: new Date(now.getTime() - AUTO_JOB_LEASE_MS) } }, { claimedAt: null }] },
      { status: "FAILED", attempts: { lt: AUTO_JOB_MAX_ATTEMPTS }, claimedAt: { lte: new Date(now.getTime() - 5 * 60_000) } },
    ],
  }, orderBy: { createdAt: "asc" }, take: opts.limit ?? 3 });
  const summary = { recovered: 0, analyzed: 0, failed: 0 };
  for (const stored of jobs) {
    const attempts = Math.min(stored.attempts + 1, AUTO_JOB_MAX_ATTEMPTS);
    const lease = { id: stored.id, status: "PROCESSING" as const, attempts, claimedAt: now };
    const claim = await prisma.webhookEvent.updateMany({ where: { id: stored.id, status: stored.status, attempts: stored.attempts, claimedAt: stored.claimedAt }, data: { status: "PROCESSING", attempts, claimedAt: now } });
    if (!claim.count) continue;
    await observeLegacyCompletion(stored.id);
    summary.recovered++;
    const payload = stored.payload as { conversationId?: unknown; messageId?: unknown; stage?: unknown };
    const finish = (error: string | null = null) => prisma.webhookEvent.updateMany({ where: lease, data: { status: "PROCESSED", processedAt: new Date(), errorMessage: error } });
    try {
      if (!payload || typeof payload.conversationId !== "string" || typeof payload.messageId !== "string") { await finish("invalid_pipeline_job"); continue; }
      if (payload.stage !== "queued" || stored.attempts >= AUTO_JOB_MAX_ATTEMPTS) {
        await prisma.webhookEvent.updateMany({ where: lease, data: { status: "FAILED", attempts: AUTO_JOB_MAX_ATTEMPTS, errorMessage: "pipeline_execution_unconfirmed" } });
        summary.failed++; continue;
      }
      const conv = await prisma.conversation.findFirst({ where: { id: payload.conversationId, organizationId: stored.organizationId }, include: { organization: { select: { isActive: true } } } });
      const latest = conv ? await prisma.message.findFirst({ where: { conversationId: conv.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }) : null;
      if (!conv || !conv.organization.isActive || latest?.id !== payload.messageId || latest.role !== "USER" || (await getChannelMode(stored.organizationId, conv.channel)) === "OFF" || !(await hasModule(stored.organizationId, "CRM")) || !(await hasModule(stored.organizationId, "AI_WHATSAPP"))) { await finish("pipeline_turn_no_longer_eligible"); continue; }
      // CRM linking can finish after message admission. Wait a bounded number of sweeps instead of losing analysis.
      if (!conv.leadId) {
        await prisma.webhookEvent.updateMany({ where: lease, data: { status: "FAILED", errorMessage: "pipeline_contact_not_ready" } });
        summary.failed++; continue;
      }
      const marked = await prisma.webhookEvent.updateMany({ where: lease, data: { payload: { conversationId: conv.id, messageId: payload.messageId, stage: "generating" } } });
      if (!marked.count) continue;
      const outcome = await runPipelineAgent(stored.organizationId, conv.id, { now, messageId: payload.messageId, throwOnError: true });
      await finish(outcome === "skipped" ? "pipeline_skipped" : null);
      if (outcome === "analyzed") summary.analyzed++;
    } catch {
      // Side effects may have begun: preserve failure for operator review, never rerun a possible CRM mutation.
      await prisma.webhookEvent.updateMany({ where: lease, data: { status: "FAILED", attempts: AUTO_JOB_MAX_ATTEMPTS, errorMessage: "pipeline_work_interrupted" } }).catch(() => undefined);
      summary.failed++;
    } finally {
      await observeLegacyCompletion(stored.id);
    }
  }
  return summary;
}

// ── Deshacer / aceptar / descartar ───────────────────────────────────────────

async function ownedAction(organizationId: string, actionId: string) {
  const action = await prisma.pipelineAiAction.findFirst({ where: { id: actionId, organizationId } });
  if (!action) throw new UserError("Acción no encontrada");
  return action;
}

/** Deshace una acción que el agente aplicó solo. Si la oportunidad ya cambió después, no la toca. */
export async function undoPipelineAiAction(organizationId: string, actionId: string, userId: string) {
  const action = await ownedAction(organizationId, actionId);
  if (action.status !== "APPLIED") throw new UserError("Esta acción ya no se puede deshacer");

  const opp = action.opportunityId ? await prisma.opportunity.findFirst({ where: { id: action.opportunityId, organizationId } }) : null;
  if (opp && (opp.pipelineStageId !== action.toStageId || opp.closedAt)) throw new UserError("La oportunidad ya cambió desde entonces; edítala a mano");

  if (action.kind === "CREATE_OPPORTUNITY") {
    if (opp) await prisma.opportunity.delete({ where: { id: opp.id } });
  } else if (opp && action.fromStageId) {
    await prisma.opportunity.update({ where: { id: opp.id }, data: { pipelineStageId: action.fromStageId, closedAt: null } });
  }
  if (action.leadStatusAfter && action.leadStatusBefore) {
    await prisma.lead.updateMany({ where: { id: action.leadId, organizationId, status: action.leadStatusAfter }, data: { status: action.leadStatusBefore } });
  }
  await prisma.pipelineAiAction.update({ where: { id: action.id }, data: { status: "UNDONE", resolvedById: userId, resolvedAt: new Date() } });
  await logAudit({ organizationId, userId, action: "pipeline_ai.undo", resource: "Lead", resourceId: action.leadId, metadata: { kind: action.kind, actionId } });
}

/** Una persona acepta una sugerencia (cerrar ganada o perdida): se aplica con su nombre. */
export async function acceptPipelineAiAction(organizationId: string, actionId: string, userId: string) {
  const action = await ownedAction(organizationId, actionId);
  if (action.status !== "SUGGESTED") throw new UserError("Esta sugerencia ya fue resuelta");
  const opp = action.opportunityId ? await prisma.opportunity.findFirst({ where: { id: action.opportunityId, organizationId } }) : null;
  if (!opp || opp.closedAt || opp.pipelineStageId !== action.fromStageId || !action.toStageId) throw new UserError("La oportunidad ya cambió desde entonces; edítala a mano");

  await prisma.opportunity.update({
    where: { id: opp.id },
    data: { pipelineStageId: action.toStageId, closedAt: new Date(), ...(action.kind === "CLOSE_LOST" ? { lossReason: action.reason } : {}) },
  });
  await logAudit({ organizationId, userId, action: action.kind === "CLOSE_LOST" ? "opportunity.lost" : "opportunity.stage_change", resource: "Opportunity", resourceId: opp.id, metadata: { lossReason: action.reason, fromStageName: action.fromStageName, toStageId: action.toStageId, toStageName: action.toStageName, via: "ai_suggestion" } });
  await syncLeadStatusFromOpportunity({ organizationId, opportunityId: opp.id, userId });
  await prisma.pipelineAiAction.update({ where: { id: action.id }, data: { status: "ACCEPTED", resolvedById: userId, resolvedAt: new Date() } });
}

export async function rejectPipelineAiAction(organizationId: string, actionId: string, userId: string) {
  const action = await ownedAction(organizationId, actionId);
  if (action.status !== "SUGGESTED") throw new UserError("Esta sugerencia ya fue resuelta");
  await prisma.pipelineAiAction.update({ where: { id: action.id }, data: { status: "REJECTED", resolvedById: userId, resolvedAt: new Date() } });
}
