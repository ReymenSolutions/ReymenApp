// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const trigger = vi.fn();
vi.mock("@/lib/n8n", () => ({ triggerN8nWorkflow: (...a: unknown[]) => trigger(...a) }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (r: string) => r === "SUPER_ADMIN" || r === "ADMIN" }));

const { requestReplyDraft, regenerateReplyDraft, dismissReplyDraft, setDraftsEnabled } = await import("./ai-drafts");
const { sendManualMessage } = await import("./conversations");
const { setDraftClientForTests, draftsAvailable } = await import("@/lib/ai-draft");

describe("borradores de IA (acciones)", () => {
  const orgs: string[] = [];
  const create = vi.fn();
  const reply = (t: string) => ({ stop_reason: "end_turn", model: "claude-opus-5-5", content: [{ type: "text", text: t }], usage: { input_tokens: 10, output_tokens: 5 } });

  const newOrg = async () => {
    const org = await createTestOrg("AI Draft Actions");
    orgs.push(org.id);
    await prisma.organizationModule.upsert({ where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } }, create: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE", source: "SUBSCRIBED" }, update: { status: "ACTIVE" } });
    return org;
  };
  const conv = async (orgId: string) => {
    const c = await prisma.conversation.create({ data: { organizationId: orgId, channel: "webchat", contactHandle: "v1", contactName: "Visitante" } });
    await prisma.message.create({ data: { conversationId: c.id, role: "USER", content: "¿Abren los sábados?" } });
    return c;
  };
  const as = (orgId: string, role: "OWNER" | "VIEWER" = "OWNER", id = "u1") => authMock.mockResolvedValue(fakeSession({ id, role, organizationId: orgId }));

  beforeEach(() => {
    create.mockReset();
    trigger.mockReset();
    trigger.mockResolvedValue({ success: true });
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    setDraftClientForTests({ beta: { messages: { create } } } as never);
  });
  afterEach(async () => {
    setDraftClientForTests(null);
    vi.unstubAllEnvs();
    for (const id of orgs.splice(0)) await cleanupOrg(id);
  });

  it("pide el borrador solo quien puede responder, y solo de su organización", async () => {
    const mine = await newOrg();
    const theirs = await newOrg();
    const c = await conv(mine.id);
    const foreign = await conv(theirs.id);
    create.mockResolvedValue(reply("Sí, abrimos los sábados."));

    authMock.mockResolvedValue(null);
    await expect(requestReplyDraft(c.id)).rejects.toThrow(/autorizado/i);
    as(mine.id, "VIEWER");
    await expect(requestReplyDraft(c.id)).rejects.toThrow(/autorizado/i);
    expect(create).not.toHaveBeenCalled();

    as(mine.id);
    expect(await requestReplyDraft(foreign.id)).toEqual({ state: "none" });
    expect(await prisma.replyDraft.count({ where: { conversationId: foreign.id } })).toBe(0);
    expect(create).not.toHaveBeenCalled();

    expect(await requestReplyDraft(c.id)).toMatchObject({ state: "ready", draft: { content: "Sí, abrimos los sábados." } });
  });

  it("'otra versión' regenera y 'descartar' lo cierra; el de otra organización no se puede descartar", async () => {
    const mine = await newOrg();
    const theirs = await newOrg();
    const c = await conv(mine.id);
    create.mockResolvedValueOnce(reply("Versión 1")).mockResolvedValueOnce(reply("Versión 2"));
    as(mine.id);
    await requestReplyDraft(c.id);
    const r = await regenerateReplyDraft(c.id);
    expect(r).toMatchObject({ state: "ready", draft: { content: "Versión 2" } });
    if (r.state !== "ready") return;
    as(theirs.id);
    await expect(dismissReplyDraft(r.draft.id)).rejects.toThrow(/no encontrado/i);
    as(mine.id);
    await dismissReplyDraft(r.draft.id);
    expect((await prisma.replyDraft.findUniqueOrThrow({ where: { id: r.draft.id } })).status).toBe("DISMISSED");
    expect(await requestReplyDraft(c.id)).toEqual({ state: "none" });
  });

  it("enviar la respuesta con el borrador lo marca como usado y guarda el texto final editado", async () => {
    const org = await newOrg();
    const c = await conv(org.id);
    // El mensaje enviado guarda quién lo mandó (clave foránea): hace falta un usuario real.
    const user = await prisma.user.create({ data: { email: `ai-${Date.now()}@example.com`, name: "Agente", role: "OWNER", organizationId: org.id, passwordHash: "x" } });
    create.mockResolvedValue(reply("Sí, abrimos los sábados de 9 a 14."));
    as(org.id, "OWNER", user.id);
    const r = await requestReplyDraft(c.id);
    if (r.state !== "ready") throw new Error("esperaba ready");

    const sent = await sendManualMessage({ conversationId: c.id, content: "Sí, abrimos los sábados de 9 a 13 h.", draftId: r.draft.id });
    expect(sent.delivered).toBe(true);
    expect(await prisma.replyDraft.findUniqueOrThrow({ where: { id: r.draft.id } })).toMatchObject({ status: "USED", finalContent: "Sí, abrimos los sábados de 9 a 13 h.", usedById: user.id });
    await prisma.message.deleteMany({ where: { conversationId: c.id } });
    await prisma.user.delete({ where: { id: user.id } });
    // Sale por el flujo del canal, con los datos de contacto del canal.
    expect(trigger).toHaveBeenCalledWith("webchat-outbound", expect.objectContaining({ data: expect.objectContaining({ channel: "webchat", contactHandle: "v1" }) }));
  });

  it("el interruptor del negocio apaga y enciende los borradores; solo quien gestiona la base de conocimiento", async () => {
    const org = await newOrg();
    as(org.id, "VIEWER");
    await expect(setDraftsEnabled(false)).rejects.toThrow(/autorizado/i);
    as(org.id);
    expect(await draftsAvailable(org.id)).toBe(true);
    await setDraftsEnabled(false);
    expect(await draftsAvailable(org.id)).toBe(false);
    await setDraftsEnabled(true);
    expect(await draftsAvailable(org.id)).toBe(true);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "ai_draft.toggle" } })).toBe(2);
  });
});
