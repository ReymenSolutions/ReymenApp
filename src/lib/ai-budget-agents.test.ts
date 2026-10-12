// @vitest-environment node
import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

vi.mock("next/server", () => ({ after: () => { throw new Error("outside request"); } }));
vi.mock("@/lib/n8n", () => ({ triggerN8nWorkflow: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/lib/admin-notifications", () => ({ notifyAdmins: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));

const { runAutoReply } = await import("./ai-auto-reply");
const { getOrCreateReplyDraft, setDraftClientForTests } = await import("./ai-draft");
const { setMonthlyBudget, extendBudget, isBudgetBlocked } = await import("./ai/budget");

const MODEL = "claude-opus-5-5";

describe("agentes con el presupuesto agotado: pausa temporal, sin tocar su configuración ni las conversaciones", () => {
  const orgs: string[] = [];
  const create = vi.fn();
  const reply = { stop_reason: "end_turn", model: MODEL, content: [{ type: "text", text: JSON.stringify({ action: "reply", reply: "Sí, abrimos sábados." }) }], usage: { input_tokens: 10, output_tokens: 5 } };

  const setup = async (mode: "AUTO" | "SUGGEST") => {
    const org = await createTestOrg("Budget Agents");
    orgs.push(org.id);
    await prisma.organizationModule.upsert({ where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } }, create: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE", source: "SUBSCRIBED" }, update: { status: "ACTIVE" } });
    await prisma.businessRulebook.create({ data: { organizationId: org.id, rules: "Abrimos sábados." } });
    await prisma.agentChannelSetting.create({ data: { organizationId: org.id, channel: "webchat", mode } });
    const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "webchat", contactHandle: "v1", contactName: "Visitante" } });
    await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content: "¿Abren los sábados?" } });
    return { org, conv };
  };
  /** Agota el presupuesto del tenant sin esperar llamadas: un consumo ya registrado que lo cubre por completo. */
  const exhaust = async (orgId: string) => {
    await setMonthlyBudget(orgId, 1, "admin1");
    await prisma.aiUsage.create({ data: { organizationId: orgId, operation: "draft", origin: "x", provider: "anthropic", model: MODEL, requestId: `seed-${orgId}`, status: "SUCCEEDED", costMxn: 1 } });
  };

  beforeEach(async () => {
    create.mockReset().mockResolvedValue(reply);
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    setDraftClientForTests({ beta: { messages: { create } } } as never);
    await prisma.aiRate.deleteMany({ where: { source: "test-budget-agents" } });
    await prisma.aiRate.create({ data: { provider: "anthropic", model: MODEL, currency: "MXN", inputPerMTok: 0.001, outputPerMTok: 0.001, effectiveFrom: new Date("2020-01-01"), source: "test-budget-agents" } });
  });
  afterAll(async () => {
    await prisma.aiRate.deleteMany({ where: { source: "test-budget-agents" } });
    for (const id of orgs) {
      await prisma.aiBudgetAdjustment.deleteMany({ where: { organizationId: id } });
      await cleanupOrg(id);
    }
  });

  it("el borrador sugerido avisa 'budget_exhausted' (distinto de 'off'), no llama al modelo ni deja un borrador fallido; al ampliar vuelve solo", async () => {
    const { org, conv } = await setup("SUGGEST");
    await exhaust(org.id);
    expect(await getOrCreateReplyDraft(org.id, conv.id)).toEqual({ state: "budget_exhausted" });
    expect(create).not.toHaveBeenCalled();
    expect(await prisma.replyDraft.count({ where: { conversationId: conv.id } })).toBe(0);
    await extendBudget(org.id, 5, "excepción comercial", "admin1");
    const back = await getOrCreateReplyDraft(org.id, conv.id);
    expect(back.state).toBe("ready");
    expect(create).toHaveBeenCalledTimes(1);
    // La configuración del agente no cambió en ningún momento.
    expect((await prisma.agentChannelSetting.findFirstOrThrow({ where: { organizationId: org.id, channel: "webchat" } })).mode).toBe("SUGGEST");
  });

  it("el modo Automático no deja al cliente sin respuesta: la conversación pasa a una persona con el motivo, sin borrarse", async () => {
    const { org, conv } = await setup("AUTO");
    await exhaust(org.id);
    expect(await runAutoReply(org.id, conv.id)).toBe("escalated");
    expect(create).not.toHaveBeenCalled();
    const after = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(after.status).toBe("ESCALATED");
    expect(await prisma.message.count({ where: { conversationId: conv.id } })).toBe(2); // el mensaje del cliente + el aviso de sistema
    expect((await prisma.message.findFirst({ where: { conversationId: conv.id, role: "SYSTEM" } }))?.content).toMatch(/pausa/i);
    expect((await prisma.agentChannelSetting.findFirstOrThrow({ where: { organizationId: org.id, channel: "webchat" } })).mode).toBe("AUTO");
  });

  it("otro tenant con presupuesto sigue atendido por su agente, y lo que no usa IA (CRM, contactos, mensajes) sigue funcionando", async () => {
    const blocked = await setup("AUTO");
    const healthy = await setup("AUTO");
    await exhaust(blocked.org.id);
    await setMonthlyBudget(healthy.org.id, 50, "admin1");
    expect(await isBudgetBlocked(blocked.org.id)).toBe(true);
    expect(await isBudgetBlocked(healthy.org.id)).toBe(false);
    expect(await runAutoReply(healthy.org.id, healthy.conv.id)).toBe("replied");
    // Sin IA, el tenant bloqueado sigue operando normal: crea contactos y recibe mensajes.
    const lead = await prisma.lead.create({ data: { organizationId: blocked.org.id, name: "Contacto" } });
    await prisma.message.create({ data: { conversationId: blocked.conv.id, role: "AGENT", content: "Te atiende una persona." } });
    expect(lead.id).toBeTruthy();
  });
});
