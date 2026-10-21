// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, seedTestAiRate } from "@/test/helpers";
import { buildDraftMessages, buildDraftSystem, getOrCreateReplyDraft, dismissReplyDraft, markReplyDraftUsed, setDraftClientForTests, draftsAvailable, DEFAULT_DRAFT_MODEL } from "./ai-draft";

await seedTestAiRate();

describe("armado de la solicitud (puro)", () => {
  it("empieza y termina con el cliente, une turnos seguidos y descarta sistema y vacíos", () => {
    const turns = buildDraftMessages([
      { role: "ASSISTANT", content: "Hola, soy el asistente" },
      { role: "SYSTEM", content: "nota interna" },
      { role: "USER", content: "Hola" },
      { role: "USER", content: "¿Cuánto cuesta?" },
      { role: "AGENT", content: "Desde $500" },
      { role: "ASSISTANT", content: "   " },
      { role: "USER", content: "¿Y la instalación?" },
    ]);
    expect(turns).toEqual([
      { role: "user", content: "Hola\n\n¿Cuánto cuesta?" },
      { role: "assistant", content: "Desde $500" },
      { role: "user", content: "¿Y la instalación?" },
    ]);
  });
  it("el prompt incluye el rulebook, el contexto del cliente y sus tratos abiertos", () => {
    const system = buildDraftSystem("HOW YOU TALK\nDirecto", { name: "Casey", channel: "instagram", status: "QUALIFIED", opportunities: [{ title: "Cajón doble", stage: "Propuesta", amount: 2200, currency: "MXN" }] });
    expect(system).toContain("BUSINESS RULEBOOK\nHOW YOU TALK\nDirecto");
    expect(system).toContain("Channel: instagram");
    expect(system).toContain("Name: Casey");
    expect(system).toContain("Open deal: Cajón doble (Propuesta, 2200 MXN)");
    expect(system).toMatch(/never invent/i);
    expect(buildDraftSystem("", { name: null, channel: "email" })).toContain("has not written a rulebook yet");
  });
});

describe("borradores de IA (con base de datos y cliente simulado)", () => {
  const orgs: string[] = [];
  const create = vi.fn();
  const text = (t: string, extra: Record<string, unknown> = {}) => ({ stop_reason: "end_turn", model: "claude-opus-5-5", content: [{ type: "thinking", thinking: "" }, { type: "text", text: t }], usage: { input_tokens: 120, output_tokens: 40 }, ...extra });

  const newOrg = async (opts: { module?: boolean; agentOff?: boolean } = {}) => {
    const org = await createTestOrg("AI Draft");
    orgs.push(org.id);
    // createTestOrg ya concede los módulos base; aquí solo se quita el de IA cuando la prueba lo pide.
    await prisma.organizationModule.upsert({
      where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } },
      create: { organizationId: org.id, module: "AI_WHATSAPP", status: opts.module === false ? "CANCELLED" : "ACTIVE", source: "SUBSCRIBED" },
      update: { status: opts.module === false ? "CANCELLED" : "ACTIVE" },
    });
    if (opts.agentOff) await prisma.agentChannelSetting.create({ data: { organizationId: org.id, channel: "instagram", mode: "OFF" } });
    return org;
  };
  const conversation = async (orgId: string, roles: ("USER" | "AGENT" | "ASSISTANT")[]) => {
    const conv = await prisma.conversation.create({ data: { organizationId: orgId, channel: "instagram", contactHandle: "@casey", contactName: "Casey" } });
    let i = 0;
    for (const role of roles) await prisma.message.create({ data: { conversationId: conv.id, role, content: `mensaje ${i++} (${role})`, createdAt: new Date(Date.now() - (roles.length - i) * 1000) } });
    return conv;
  };

  beforeEach(() => {
    create.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("AI_DRAFT_PROVIDER", "");
    vi.stubEnv("AI_DRAFT_MODEL", "");
    setDraftClientForTests({ beta: { messages: { create } } } as never);
  });
  afterEach(async () => {
    setDraftClientForTests(null);
    vi.unstubAllEnvs();
    for (const id of orgs.splice(0)) await cleanupOrg(id);
  });

  it("redacta un borrador con el rulebook del negocio y lo guarda con su uso de tokens", async () => {
    const org = await newOrg();
    await prisma.businessRulebook.create({ data: { organizationId: org.id, voice: "Franco y cálido", pricing: "Cajón doble: $2,200" } });
    const conv = await conversation(org.id, ["USER"]);
    create.mockResolvedValue(text("Hola Casey, el cajón doble cuesta $2,200."));

    const result = await getOrCreateReplyDraft(org.id, conv.id);
    expect(result).toMatchObject({ state: "ready", draft: { content: "Hola Casey, el cajón doble cuesta $2,200." } });

    const req = create.mock.calls[0][0];
    expect(req.model).toBe(DEFAULT_DRAFT_MODEL);
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(req.output_config).toEqual({ effort: "low" });
    expect(req.system[0].text).toContain("Franco y cálido");
    expect(req.system[0].text).toContain("Cajón doble: $2,200");
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.messages).toEqual([{ role: "user", content: "mensaje 0 (USER)" }]);

    const row = await prisma.replyDraft.findFirstOrThrow({ where: { conversationId: conv.id } });
    expect(row).toMatchObject({ status: "READY", model: "claude-opus-5-5", inputTokens: 120, outputTokens: 40 });
  });

  it("el modelo se puede cambiar por variable de entorno", async () => {
    vi.stubEnv("AI_DRAFT_MODEL", "claude-sonnet-5-5");
    const org = await newOrg();
    const conv = await conversation(org.id, ["USER"]);
    create.mockResolvedValue(text("ok"));
    await getOrCreateReplyDraft(org.id, conv.id);
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-5-5");
  });

  it("es idempotente: pedirlo otra vez, o a la vez, no vuelve a llamar a la IA", async () => {
    const org = await newOrg();
    const conv = await conversation(org.id, ["USER"]);
    create.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return text("Respuesta única");
    });
    const [a, b, c] = await Promise.all([getOrCreateReplyDraft(org.id, conv.id), getOrCreateReplyDraft(org.id, conv.id), getOrCreateReplyDraft(org.id, conv.id)]);
    expect(create).toHaveBeenCalledTimes(1);
    expect([a, b, c].filter((r) => r.state === "ready")).toHaveLength(1);
    expect([a, b, c].filter((r) => r.state === "generating")).toHaveLength(2);
    expect(await getOrCreateReplyDraft(org.id, conv.id)).toMatchObject({ state: "ready", draft: { content: "Respuesta única" } });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("solo hay borrador si lo último lo dijo el cliente; un mensaje nuevo del cliente genera otro", async () => {
    const org = await newOrg();
    const conv = await conversation(org.id, ["USER", "AGENT"]);
    expect(await getOrCreateReplyDraft(org.id, conv.id)).toEqual({ state: "none" });
    expect(create).not.toHaveBeenCalled();
    create.mockResolvedValue(text("Otra respuesta"));
    await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content: "una pregunta más" } });
    expect(await getOrCreateReplyDraft(org.id, conv.id)).toMatchObject({ state: "ready" });
    expect(await prisma.replyDraft.count({ where: { conversationId: conv.id } })).toBe(1);
  });

  it("está apagado sin clave, sin el módulo de IA o con el agente apagado en el canal", async () => {
    const org = await newOrg();
    const conv = await conversation(org.id, ["USER"]);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await draftsAvailable(org.id, "instagram")).toBe(false);
    expect(await getOrCreateReplyDraft(org.id, conv.id)).toEqual({ state: "off" });
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const noModule = await newOrg({ module: false });
    const c2 = await conversation(noModule.id, ["USER"]);
    expect(await getOrCreateReplyDraft(noModule.id, c2.id)).toEqual({ state: "off" });
    const disabled = await newOrg({ agentOff: true });
    const c3 = await conversation(disabled.id, ["USER"]);
    expect(await getOrCreateReplyDraft(disabled.id, c3.id)).toEqual({ state: "off" });
    expect(create).not.toHaveBeenCalled();
  });

  it("un rechazo o un error de la IA deja el borrador en FAILED sin romper, y se puede pedir otra versión", async () => {
    const org = await newOrg();
    const conv = await conversation(org.id, ["USER"]);
    create.mockResolvedValueOnce({ stop_reason: "refusal", model: "claude-opus-5-5", content: [], usage: { input_tokens: 1, output_tokens: 0 } });
    expect(await getOrCreateReplyDraft(org.id, conv.id)).toEqual({ state: "failed" });
    expect((await prisma.replyDraft.findFirstOrThrow({ where: { conversationId: conv.id } })).error).toBe("refusal");

    create.mockRejectedValueOnce(new Error("429 rate limited"));
    expect(await getOrCreateReplyDraft(org.id, conv.id, { force: true })).toEqual({ state: "failed" });
    expect((await prisma.replyDraft.findFirstOrThrow({ where: { conversationId: conv.id } })).error).toMatch(/rate limited/);

    create.mockResolvedValueOnce(text("Ahora sí"));
    expect(await getOrCreateReplyDraft(org.id, conv.id, { force: true })).toMatchObject({ state: "ready", draft: { content: "Ahora sí" } });
    expect(await prisma.replyDraft.count({ where: { conversationId: conv.id } })).toBe(1);
  });

  it("un borrador que quedó 'generando' hace mucho se reintenta", async () => {
    const org = await newOrg();
    const conv = await conversation(org.id, ["USER"]);
    const last = await prisma.message.findFirstOrThrow({ where: { conversationId: conv.id } });
    await prisma.replyDraft.create({ data: { organizationId: org.id, conversationId: conv.id, basedOnMessageId: last.id, status: "GENERATING" } });
    create.mockResolvedValue(text("Recuperado"));
    expect(await getOrCreateReplyDraft(org.id, conv.id)).toEqual({ state: "generating" });
    expect(await getOrCreateReplyDraft(org.id, conv.id, { now: new Date(Date.now() + 11 * 60_000) })).toMatchObject({ state: "ready", draft: { content: "Recuperado" } });
  });

  it("descartar y marcar como usado respetan la organización y el estado", async () => {
    const org = await newOrg();
    const other = await newOrg();
    const conv = await conversation(org.id, ["USER"]);
    create.mockResolvedValue(text("Borrador"));
    const r = await getOrCreateReplyDraft(org.id, conv.id);
    if (r.state !== "ready") throw new Error("esperaba ready");
    expect(await dismissReplyDraft(other.id, r.draft.id)).toBe(false);
    expect(await markReplyDraftUsed(other.id, r.draft.id, "u1", "x")).toBe(false);
    expect(await markReplyDraftUsed(org.id, r.draft.id, "u1", "Borrador editado")).toBe(true);
    expect(await prisma.replyDraft.findUniqueOrThrow({ where: { id: r.draft.id } })).toMatchObject({ status: "USED", finalContent: "Borrador editado", usedById: "u1" });
    // Ya usado: no se puede descartar ni volver a marcar.
    expect(await dismissReplyDraft(org.id, r.draft.id)).toBe(false);
    expect(await markReplyDraftUsed(org.id, r.draft.id, "u1", "otra")).toBe(false);
  });

  it("el proveedor de prueba no llama a Claude", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_DRAFT_PROVIDER", "mock");
    const org = await newOrg();
    const conv = await conversation(org.id, ["USER"]);
    const r = await getOrCreateReplyDraft(org.id, conv.id);
    expect(r.state).toBe("ready");
    expect(create).not.toHaveBeenCalled();
  });
  it("serializes force regenerations and does not let late generation overwrite a dismissal", async () => {
    const org = await newOrg();
    const conv = await conversation(org.id, ["USER"]);
    create.mockResolvedValue(text("First"));
    await getOrCreateReplyDraft(org.id, conv.id);
    let started!: () => void, finish!: (value: ReturnType<typeof text>) => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const response = new Promise<ReturnType<typeof text>>((resolve) => { finish = resolve; });
    create.mockImplementation(() => { started(); return response; });
    const running = getOrCreateReplyDraft(org.id, conv.id, { force: true });
    await ready;
    expect(await getOrCreateReplyDraft(org.id, conv.id, { force: true })).toEqual({ state: "generating" });
    const draft = await prisma.replyDraft.findFirstOrThrow({ where: { conversationId: conv.id } });
    await dismissReplyDraft(org.id, draft.id);
    finish(text("Late response must not replace dismissal"));
    expect(await running).toEqual({ state: "none" });
    expect(await prisma.replyDraft.findUnique({ where: { id: draft.id } })).toMatchObject({ status: "DISMISSED" });
    expect(create).toHaveBeenCalledTimes(2); // First + one regeneration, not two.
  });

  it("only one concurrent caller claims an abandoned draft", async () => {
    const org = await newOrg();
    const conv = await conversation(org.id, ["USER"]);
    const last = await prisma.message.findFirstOrThrow({ where: { conversationId: conv.id } });
    await prisma.replyDraft.create({ data: { organizationId: org.id, conversationId: conv.id, basedOnMessageId: last.id, status: "GENERATING", updatedAt: new Date(Date.now() - 11 * 60_000) } });
    create.mockResolvedValue(text("Recovered once"));
    const results = await Promise.all(Array.from({ length: 4 }, () => getOrCreateReplyDraft(org.id, conv.id, { force: true })));
    expect(create).toHaveBeenCalledTimes(1);
    expect(results.some((r) => r.state === "ready")).toBe(true);
  });

});
