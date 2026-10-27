// @vitest-environment node
import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { processConversationEvent } from "./webhook-processors";
import { AUTO_JOB_SOURCE, PIPELINE_JOB_TYPE, AUTO_JOB_LEASE_MS } from "./ai-auto-jobs";
import { createTestOrg, createTestPipelineStages, cleanupOrg, seedTestAiRate } from "@/test/helpers";

vi.mock("next/server", () => ({ after: () => { throw new Error("outside request"); } }));

const { parseAnalysis, planAction, runPipelineAgent, recoverPipelineAnalyses, undoPipelineAiAction, acceptPipelineAiAction, rejectPipelineAiAction, ANALYSIS_COOLDOWN_MS } = await import("./ai-pipeline");
const { setDraftClientForTests } = await import("./ai-draft");

const stages = [
  { id: "s1", name: "Nuevo", order: 1, isWon: false, isLost: false },
  { id: "s2", name: "Cotización", order: 2, isWon: false, isLost: false },
  { id: "s3", name: "Negociación", order: 3, isWon: false, isLost: false },
  { id: "s4", name: "Ganado", order: 4, isWon: true, isLost: false },
  { id: "s5", name: "Perdido", order: 5, isWon: false, isLost: true },
];
const analysis = (over: Record<string, unknown> = {}) => ({ intent: "pricing_inquiry" as const, summary: "Pregunta precios", action: "create_opportunity" as const, title: "Interés", reason: "Preguntó precios", ...over });
const ctx = (over: Record<string, unknown> = {}) => ({ leadName: "Ana", stages, openOpportunity: null, blocked: new Set<string>(), ...over });
const opp = { id: "o1", title: "Venta Ana", stageId: "s2" };

await seedTestAiRate();

describe("reglas del pipeline con IA (puras)", () => {
  it("lee el análisis del modelo y descarta lo que no se entiende", () => {
    expect(parseAnalysis('{"intent":"pricing_inquiry","summary":"Pide precio","action":"create_opportunity","title":"T","reason":"R"}')).toMatchObject({ intent: "pricing_inquiry", action: "create_opportunity" });
    expect(parseAnalysis('{"intent":"raro","summary":"x","action":"borrar_todo"}')).toMatchObject({ intent: "other", action: "none" });
    expect(parseAnalysis('{"intent":"pricing_inquiry","summary":"x","action":"none","search_profile":{"operation":"SALE","max_budget":4000000}}')).toMatchObject({ searchProfile: { operation: "SALE" } });
    expect(parseAnalysis('{"intent":"other","summary":"x","action":"none"}')).not.toHaveProperty("searchProfile");
    expect(parseAnalysis("hola")).toBeNull();
    expect(parseAnalysis('{"intent":"other"}')).toBeNull();
  });

  it("interés de compra sin oportunidad: la crea sola en la primera etapa abierta", () => {
    expect(planAction(analysis(), ctx())).toMatchObject({ kind: "CREATE_OPPORTUNITY", status: "APPLIED", toStage: { id: "s1" }, opportunityTitle: "Interés" });
    expect(planAction(analysis({ title: "" }), ctx())).toMatchObject({ opportunityTitle: "Interés de Ana" });
  });
  it("no crea si ya hay una abierta, si no es interés de compra o si una persona lo deshizo", () => {
    expect(planAction(analysis(), ctx({ openOpportunity: opp }))).toBeNull();
    expect(planAction(analysis({ intent: "complaint" }), ctx())).toBeNull();
    expect(planAction(analysis({ intent: "support" }), ctx())).toBeNull();
    expect(planAction(analysis(), ctx({ blocked: new Set(["CREATE_OPPORTUNITY:"]) }))).toBeNull();
  });
  it("adelanta solo UNA etapa abierta, nunca a ganada/perdida ni hacia atrás", () => {
    expect(planAction(analysis({ action: "advance_stage", intent: "booking_request" }), ctx({ openOpportunity: opp }))).toMatchObject({ kind: "ADVANCE_STAGE", status: "APPLIED", fromStage: { id: "s2" }, toStage: { id: "s3" } });
    // En la última etapa abierta no hay a dónde adelantar (ganar es decisión de una persona).
    expect(planAction(analysis({ action: "advance_stage" }), ctx({ openOpportunity: { ...opp, stageId: "s3" } }))).toBeNull();
    expect(planAction(analysis({ action: "advance_stage" }), ctx())).toBeNull(); // sin oportunidad
    expect(planAction(analysis({ action: "advance_stage" }), ctx({ openOpportunity: opp, blocked: new Set(["ADVANCE_STAGE:o1"]) }))).toBeNull();
  });
  it("cerrar ganada o perdida solo se sugiere, y solo con la intención que lo respalda", () => {
    expect(planAction(analysis({ action: "close_won", intent: "ready_to_buy" }), ctx({ openOpportunity: opp }))).toMatchObject({ kind: "CLOSE_WON", status: "SUGGESTED", toStage: { id: "s4" } });
    expect(planAction(analysis({ action: "close_lost", intent: "not_interested" }), ctx({ openOpportunity: opp }))).toMatchObject({ kind: "CLOSE_LOST", status: "SUGGESTED", toStage: { id: "s5" } });
    expect(planAction(analysis({ action: "close_won", intent: "pricing_inquiry" }), ctx({ openOpportunity: opp }))).toBeNull();
    expect(planAction(analysis({ action: "close_lost", intent: "complaint" }), ctx({ openOpportunity: opp }))).toBeNull();
    expect(planAction(analysis({ action: "close_won", intent: "ready_to_buy" }), ctx({ openOpportunity: opp, blocked: new Set(["CLOSE_WON:o1"]) }))).toBeNull();
  });
});

describe("pipeline con IA (con base de datos)", () => {
  const orgs: string[] = [];
  const create = vi.fn();
  const answer = (obj: unknown) => ({ stop_reason: "end_turn", model: "claude-opus-5-5", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 5 } });
  const say = (over: Record<string, unknown> = {}) => create.mockResolvedValue(answer({ intent: "pricing_inquiry", summary: "Pide precio de la revisión", action: "create_opportunity", title: "Revisión inicial", reason: "Preguntó cuánto cuesta", ...over }));

  const setup = async (mode?: "OFF" | "SUGGEST" | "AUTO") => {
    const org = await createTestOrg("Pipeline AI");
    orgs.push(org.id);
    for (const mod of ["CRM", "AI_WHATSAPP"] as const) {
      await prisma.organizationModule.upsert({ where: { organizationId_module: { organizationId: org.id, module: mod } }, create: { organizationId: org.id, module: mod, status: "ACTIVE", source: "SUBSCRIBED" }, update: { status: "ACTIVE" } });
    }
    const st = await createTestPipelineStages(org.id);
    if (mode) await prisma.agentChannelSetting.create({ data: { organizationId: org.id, channel: "whatsapp", mode } });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Ana", status: "NEW" } });
    const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp", contactPhone: "+5215500000001", leadId: lead.id } });
    const msg = (content = "¿Cuánto cuesta la revisión inicial?") => prisma.message.create({ data: { conversationId: conv.id, role: "USER", content } });
    await msg();
    return { org, st, lead, conv, msg };
  };

  beforeEach(() => {
    create.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    setDraftClientForTests({ beta: { messages: { create } } } as never);
  });
  afterAll(async () => {
    for (const id of orgs) await cleanupOrg(id);
  });

  it("crea la oportunidad sola, deja el motivo y se puede deshacer (también el estado del contacto)", async () => {
    const { org, st, lead, conv } = await setup();
    say();
    expect(await runPipelineAgent(org.id, conv.id)).toBe("analyzed");
    const opp = await prisma.opportunity.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(opp).toMatchObject({ title: "Revisión inicial", pipelineStageId: st[0].id });
    const action = await prisma.pipelineAiAction.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(action).toMatchObject({ kind: "CREATE_OPPORTUNITY", status: "APPLIED", reason: "Preguntó cuánto cuesta", opportunityId: opp.id });
    expect(await prisma.pipelineAiRun.count({ where: { conversationId: conv.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "pipeline_ai.apply" } })).toBe(1);

    await undoPipelineAiAction(org.id, action.id, "u1");
    expect(await prisma.opportunity.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.pipelineAiAction.findUnique({ where: { id: action.id } })).toMatchObject({ status: "UNDONE", resolvedById: "u1" });
    await expect(undoPipelineAiAction(org.id, action.id, "u1")).rejects.toThrow(/ya no se puede deshacer/);
  });

  it("no deshace si la oportunidad ya la movió una persona", async () => {
    const { org, st, lead, conv } = await setup();
    say();
    await runPipelineAgent(org.id, conv.id);
    const action = await prisma.pipelineAiAction.findFirstOrThrow({ where: { leadId: lead.id } });
    await prisma.opportunity.update({ where: { id: action.opportunityId! }, data: { pipelineStageId: st[1].id } });
    await expect(undoPipelineAiAction(org.id, action.id, "u1")).rejects.toThrow(/ya cambió/);
    expect(await prisma.opportunity.count({ where: { leadId: lead.id } })).toBe(1);
  });

  it("respeta lo que una persona deshizo: no vuelve a crearla para el siguiente mensaje", async () => {
    const { org, lead, conv, msg } = await setup();
    say();
    await runPipelineAgent(org.id, conv.id);
    const action = await prisma.pipelineAiAction.findFirstOrThrow({ where: { leadId: lead.id } });
    await undoPipelineAiAction(org.id, action.id, "u1");
    await msg("¿y si pago en dos partes?");
    const later = new Date(Date.now() + ANALYSIS_COOLDOWN_MS + 1000);
    expect(await runPipelineAgent(org.id, conv.id, { now: later })).toBe("analyzed");
    expect(await prisma.opportunity.count({ where: { leadId: lead.id } })).toBe(0);
  });

  it("adelanta una etapa y lo deshace devolviéndola", async () => {
    const { org, st, lead, conv } = await setup();
    const o = await prisma.opportunity.create({ data: { organizationId: org.id, leadId: lead.id, pipelineStageId: st[0].id, title: "Venta Ana" } });
    say({ action: "advance_stage", intent: "booking_request", reason: "Pidió agendar" });
    await runPipelineAgent(org.id, conv.id);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id } })).pipelineStageId).toBe(st[1].id);
    const action = await prisma.pipelineAiAction.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(action).toMatchObject({ kind: "ADVANCE_STAGE", fromStageId: st[0].id, toStageId: st[1].id });
    await undoPipelineAiAction(org.id, action.id, "u1");
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id } })).pipelineStageId).toBe(st[0].id);
  });

  it("cerrar como ganada es solo una sugerencia: no toca nada hasta que una persona la acepta", async () => {
    const { org, st, lead, conv } = await setup();
    const o = await prisma.opportunity.create({ data: { organizationId: org.id, leadId: lead.id, pipelineStageId: st[1].id, title: "Venta Ana" } });
    say({ action: "close_won", intent: "ready_to_buy", reason: "Confirmó la compra" });
    await runPipelineAgent(org.id, conv.id);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id } })).closedAt).toBeNull();
    const action = await prisma.pipelineAiAction.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(action).toMatchObject({ kind: "CLOSE_WON", status: "SUGGESTED" });
    await acceptPipelineAiAction(org.id, action.id, "u1");
    const closed = await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id } });
    expect(closed.closedAt).not.toBeNull();
    expect(closed.pipelineStageId).toBe(st.find((s) => s.isWon)!.id);
    expect(await prisma.pipelineAiAction.findUnique({ where: { id: action.id } })).toMatchObject({ status: "ACCEPTED" });
    await expect(rejectPipelineAiAction(org.id, action.id, "u1")).rejects.toThrow(/ya fue resuelta/);
  });

  it("descartar una sugerencia no cambia la oportunidad", async () => {
    const { org, st, lead, conv } = await setup();
    const o = await prisma.opportunity.create({ data: { organizationId: org.id, leadId: lead.id, pipelineStageId: st[1].id, title: "Venta Ana" } });
    say({ action: "close_lost", intent: "not_interested", reason: "Dijo que no le interesa" });
    await runPipelineAgent(org.id, conv.id);
    const action = await prisma.pipelineAiAction.findFirstOrThrow({ where: { leadId: lead.id } });
    await rejectPipelineAiAction(org.id, action.id, "u1");
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id } })).pipelineStageId).toBe(st[1].id);
  });

  it("con el canal Apagado, sin CRM o sin contacto, el agente no hace nada ni llama a Claude", async () => {
    const off = await setup("OFF");
    say();
    expect(await runPipelineAgent(off.org.id, off.conv.id)).toBe("skipped");

    const noLead = await setup();
    await prisma.conversation.update({ where: { id: noLead.conv.id }, data: { leadId: null } });
    expect(await runPipelineAgent(noLead.org.id, noLead.conv.id)).toBe("skipped");

    const noCrm = await setup();
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: noCrm.org.id, module: "CRM" } }, data: { status: "CANCELLED" } });
    expect(await runPipelineAgent(noCrm.org.id, noCrm.conv.id)).toBe("skipped");
    expect(create).not.toHaveBeenCalled();
  });

  it("analiza una vez por mensaje y espera entre análisis", async () => {
    const { org, conv, msg } = await setup();
    say({ action: "none", intent: "other" });
    expect(await runPipelineAgent(org.id, conv.id)).toBe("analyzed");
    expect(await runPipelineAgent(org.id, conv.id)).toBe("skipped"); // enfriamiento
    await msg("otra cosa");
    expect(await runPipelineAgent(org.id, conv.id)).toBe("skipped"); // sigue en enfriamiento
    expect(await runPipelineAgent(org.id, conv.id, { now: new Date(Date.now() + ANALYSIS_COOLDOWN_MS + 1000) })).toBe("analyzed");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("si Claude falla o responde algo ilegible, no cambia el pipeline", async () => {
    const { org, lead, conv } = await setup();
    create.mockRejectedValue(new Error("boom"));
    expect(await runPipelineAgent(org.id, conv.id)).toBe("skipped");
    create.mockResolvedValue({ stop_reason: "end_turn", model: "m", content: [{ type: "text", text: "no sé" }], usage: { input_tokens: 1, output_tokens: 1 } });
    expect(await runPipelineAgent(org.id, conv.id)).toBe("skipped");
    expect(await prisma.opportunity.count({ where: { leadId: lead.id } })).toBe(0);
  });
  it("recovers persisted SUGGEST pipeline work once without relying on after", async () => {
    const { org, conv, lead } = await setup("SUGGEST");
    say();
    await processConversationEvent({ conversationId: conv.id, channel: "whatsapp", message: { role: "USER", content: "Quiero cotizar", externalId: "durable-pipeline" } }, org.id);
    expect(await prisma.webhookEvent.count({ where: { organizationId: org.id, source: AUTO_JOB_SOURCE, eventType: PIPELINE_JOB_TYPE, status: "PENDING" } })).toBe(1);
    await Promise.all(Array.from({ length: 3 }, () => recoverPipelineAnalyses({ organizationId: org.id })));
    expect(create).toHaveBeenCalledTimes(1);
    expect(await prisma.opportunity.count({ where: { leadId: lead.id } })).toBe(1);
    expect(await prisma.webhookEvent.findFirst({ where: { organizationId: org.id, eventType: PIPELINE_JOB_TYPE } })).toMatchObject({ status: "PROCESSED" });
    await recoverPipelineAnalyses({ organizationId: org.id });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not replay an interrupted pipeline attempt that may already have written to CRM", async () => {
    const { org, conv } = await setup("SUGGEST");
    await processConversationEvent({ conversationId: conv.id, message: { role: "USER", content: "Cotización", externalId: "interrupted-pipeline" } }, org.id);
    const job = await prisma.webhookEvent.findFirstOrThrow({ where: { organizationId: org.id, eventType: PIPELINE_JOB_TYPE } });
    const payload = job.payload as { conversationId: string; messageId: string };
    await prisma.webhookEvent.update({ where: { id: job.id }, data: { payload: { ...payload, stage: "generating" }, status: "PROCESSING", attempts: 3, claimedAt: new Date(Date.now() - AUTO_JOB_LEASE_MS - 1) } });
    await recoverPipelineAnalyses({ organizationId: org.id });
    await recoverPipelineAnalyses({ organizationId: org.id });
    expect(await prisma.webhookEvent.findUnique({ where: { id: job.id } })).toMatchObject({ status: "FAILED", attempts: 3, errorMessage: "pipeline_execution_unconfirmed" });
    expect(create).not.toHaveBeenCalled();
  });

  it("pipeline provider failure terminates persisted work without repeating a CRM write", async () => {
    const { org, conv } = await setup("SUGGEST");
    await processConversationEvent({ conversationId: conv.id, message: { role: "USER", content: "Cotización", externalId: "failed-pipeline" } }, org.id);
    create.mockRejectedValue(new Error("provider failed"));
    await recoverPipelineAnalyses({ organizationId: org.id });
    await recoverPipelineAnalyses({ organizationId: org.id, now: new Date(Date.now() + AUTO_JOB_LEASE_MS + 1) });
    expect(create).toHaveBeenCalledTimes(1);
    expect(await prisma.webhookEvent.findFirst({ where: { organizationId: org.id, eventType: PIPELINE_JOB_TYPE } })).toMatchObject({ status: "FAILED", attempts: 3 });
  });

  it("pipeline recovery scopes tenant IDs and ignores an obsolete turn", async () => {
    const a = await setup("SUGGEST"), b = await setup("SUGGEST");
    await processConversationEvent({ conversationId: a.conv.id, message: { role: "USER", content: "Cotización", externalId: "foreign-pipeline" } }, a.org.id);
    const job = await prisma.webhookEvent.findFirstOrThrow({ where: { organizationId: a.org.id, eventType: PIPELINE_JOB_TYPE } });
    const message = await prisma.message.findFirstOrThrow({ where: { conversationId: b.conv.id } });
    await prisma.webhookEvent.update({ where: { id: job.id }, data: { payload: { conversationId: b.conv.id, messageId: message.id, stage: "queued" } } });
    await recoverPipelineAnalyses({ organizationId: a.org.id });
    expect(create).not.toHaveBeenCalled();
    expect(await prisma.opportunity.count({ where: { organizationId: b.org.id } })).toBe(0);
  });

});
