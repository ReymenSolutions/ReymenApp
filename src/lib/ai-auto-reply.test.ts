// @vitest-environment node
import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

vi.mock("next/server", () => ({ after: () => { throw new Error("outside request"); } }));
const trigger = vi.fn();
vi.mock("@/lib/n8n", () => ({ triggerN8nWorkflow: (...a: unknown[]) => trigger(...a) }));

const { runAutoReply, customerNeedsHuman, unsafeReason, parseDecision, AUTO_REPLIES_PER_HOUR } = await import("./ai-auto-reply");
const { setDraftClientForTests } = await import("./ai-draft");

describe("reglas del modo Automático (puras)", () => {
  it("pasa a una persona ante quejas, reembolsos o si la piden", () => {
    for (const t of ["Quiero hablar con un humano", "esto es una queja", "necesito un reembolso", "I want a refund", "get me a manager"]) expect(customerNeedsHuman(t)).toBe(true);
    for (const t of ["¿Abren los sábados?", "How much is the initial check?"]) expect(customerNeedsHuman(t)).toBe(false);
  });
  it("no deja salir enlaces, pagos, vacíos ni textos larguísimos", () => {
    expect(unsafeReason("Abrimos de 9 a 6.")).toBeNull();
    expect(unsafeReason("Mira https://x.com")).toBe("contains_link");
    expect(unsafeReason("Haz una transferencia a esta CLABE")).toBe("mentions_payment");
    expect(unsafeReason("  ")).toBe("empty_reply");
    expect(unsafeReason("a".repeat(1001))).toBe("too_long");
  });
  it("lo que no se entiende del modelo se trata como pasar a una persona", () => {
    expect(parseDecision('{"action":"reply","reply":" Hola "}')).toEqual({ action: "reply", reply: "Hola" });
    expect(parseDecision('```json\n{"action":"escalate","reason":"no está en el rulebook"}\n```')).toEqual({ action: "escalate", reason: "no está en el rulebook" });
    expect(parseDecision("hola, claro que sí")).toMatchObject({ action: "escalate", reason: "unreadable_decision" });
    expect(parseDecision('{"action":"reply"}')).toMatchObject({ action: "escalate" });
  });
});

describe("respuesta automática (con base de datos)", () => {
  const orgs: string[] = [];
  const create = vi.fn();
  const answer = (obj: unknown) => ({ stop_reason: "end_turn", model: "claude-opus-5-5", content: [{ type: "text", text: JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 5 } });

  const setup = async (mode: "AUTO" | "SUGGEST" = "AUTO", userText = "¿Abren los sábados?") => {
    const org = await createTestOrg("Auto Reply");
    orgs.push(org.id);
    await prisma.organizationModule.upsert({ where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } }, create: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE", source: "SUBSCRIBED" }, update: { status: "ACTIVE" } });
    await prisma.businessRulebook.create({ data: { organizationId: org.id, rules: "Abrimos sábados de 9 a 2." } });
    await prisma.agentChannelSetting.create({ data: { organizationId: org.id, channel: "webchat", mode } });
    const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "webchat", contactHandle: "v1", contactName: "Visitante" } });
    await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content: userText } });
    return { org, conv };
  };

  beforeEach(() => {
    create.mockReset();
    trigger.mockReset();
    trigger.mockResolvedValue({ success: true });
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    setDraftClientForTests({ beta: { messages: { create } } } as never);
  });
  afterAll(async () => {
    for (const id of orgs) await cleanupOrg(id);
  });

  it("responde, lo manda por el flujo del canal y deja el mensaje como del Agente IA", async () => {
    const { org, conv } = await setup();
    create.mockResolvedValue(answer({ action: "reply", reply: "Sí, abrimos sábados de 9 a 2." }));
    expect(await runAutoReply(org.id, conv.id)).toBe("replied");
    const sent = await prisma.message.findFirst({ where: { conversationId: conv.id, role: "ASSISTANT" } });
    expect(sent?.content).toBe("Sí, abrimos sábados de 9 a 2.");
    expect(trigger).toHaveBeenCalledWith("webchat-outbound", expect.objectContaining({ data: expect.objectContaining({ content: "Sí, abrimos sábados de 9 a 2.", contactHandle: "v1" }) }));
    expect(await prisma.conversation.findUnique({ where: { id: conv.id } })).toMatchObject({ lastMessageRole: "ASSISTANT", aiHandled: true });
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "ai_auto.reply" } })).toBe(1);
  });

  it("solo una vez por mensaje del cliente", async () => {
    const { org, conv } = await setup();
    create.mockResolvedValue(answer({ action: "reply", reply: "Sí." }));
    expect(await runAutoReply(org.id, conv.id)).toBe("replied");
    expect(await runAutoReply(org.id, conv.id)).toBe("skipped"); // lo último ya lo dijo el agente
    await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content: "gracias, ¿y domingos?" } });
    await prisma.replyDraft.deleteMany({ where: { conversationId: conv.id } }); // otro mensaje = otra llave; aquí solo se prueba el choque
    expect(await runAutoReply(org.id, conv.id)).toBe("replied");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("si el modelo duda, pasa la conversación a una persona con el motivo", async () => {
    const { org, conv } = await setup();
    create.mockResolvedValue(answer({ action: "escalate", reason: "No está en el rulebook" }));
    expect(await runAutoReply(org.id, conv.id)).toBe("escalated");
    expect(await prisma.conversation.findUnique({ where: { id: conv.id } })).toMatchObject({ status: "ESCALATED" });
    expect((await prisma.message.findFirst({ where: { conversationId: conv.id, role: "SYSTEM" } }))?.content).toContain("No está en el rulebook");
    expect(trigger).not.toHaveBeenCalled();
  });

  it("una queja ni siquiera llega al modelo", async () => {
    const { org, conv } = await setup("AUTO", "Quiero un reembolso, esto es una estafa");
    expect(await runAutoReply(org.id, conv.id)).toBe("escalated");
    expect(create).not.toHaveBeenCalled();
  });

  it("una respuesta con enlace o pago no sale: se escala", async () => {
    const { org, conv } = await setup();
    create.mockResolvedValue(answer({ action: "reply", reply: "Paga aquí https://pago.example.com" }));
    expect(await runAutoReply(org.id, conv.id)).toBe("escalated");
    expect(trigger).not.toHaveBeenCalled();
    expect(await prisma.message.count({ where: { conversationId: conv.id, role: "ASSISTANT" } })).toBe(0);
  });

  it("no actúa si el canal no está en Automático, si una persona ya atiende o sin clave", async () => {
    const suggest = await setup("SUGGEST");
    expect(await runAutoReply(suggest.org.id, suggest.conv.id)).toBe("skipped");

    const human = await setup();
    await prisma.message.create({ data: { conversationId: human.conv.id, role: "AGENT", content: "Yo te atiendo", createdAt: new Date(Date.now() - 60_000) } });
    await prisma.message.create({ data: { conversationId: human.conv.id, role: "USER", content: "ok, ¿a qué hora?" } });
    expect(await runAutoReply(human.org.id, human.conv.id)).toBe("skipped");

    const noKey = await setup();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await runAutoReply(noKey.org.id, noKey.conv.id)).toBe("skipped");
    expect(create).not.toHaveBeenCalled();
  });

  it(`corta los ciclos: después de ${AUTO_REPLIES_PER_HOUR} respuestas automáticas en una hora pasa a una persona`, async () => {
    const { org, conv } = await setup();
    for (let i = 0; i < AUTO_REPLIES_PER_HOUR; i++) await prisma.message.create({ data: { conversationId: conv.id, role: "ASSISTANT", content: `auto ${i}`, createdAt: new Date(Date.now() - 5 * 60_000) } });
    await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content: "otra duda" } });
    expect(await runAutoReply(org.id, conv.id)).toBe("escalated");
    expect(create).not.toHaveBeenCalled();
  });

  it("si Claude falla, no se pierde nada: queda para una persona y no se envía", async () => {
    const { org, conv } = await setup();
    create.mockRejectedValue(new Error("boom"));
    expect(await runAutoReply(org.id, conv.id)).not.toBe("replied");
    expect(trigger).not.toHaveBeenCalled();
  });
});
