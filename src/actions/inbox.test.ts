// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (r: string) => r === "SUPER_ADMIN" || r === "ADMIN" }));

const { openInboxThread, setConversationArchived, setConversationImportant, markConversationUnread } = await import("./inbox");
const { processConversationEvent } = await import("@/lib/webhook-processors");

describe("inbox (acciones)", () => {
  const orgs: string[] = [];
  const newOrg = async (modules: ("CRM" | "AI_WHATSAPP")[] = []) => {
    const org = await createTestOrg("Inbox Actions");
    orgs.push(org.id);
    // createTestOrg ya habilita CRM; aquí se ajusta según la prueba.
    await prisma.organizationModule.deleteMany({ where: { organizationId: org.id } });
    for (const mod of modules) await prisma.organizationModule.create({ data: { organizationId: org.id, module: mod, status: "ACTIVE", source: "SUBSCRIBED" } });
    return org;
  };
  afterEach(async () => {
    for (const id of orgs.splice(0)) await cleanupOrg(id);
  });
  const as = (orgId: string, role: "OWNER" | "VIEWER" = "OWNER") => authMock.mockResolvedValue(fakeSession({ id: "u1", role, organizationId: orgId }));

  it("abrir un hilo lo marca como leído y devuelve sus mensajes", async () => {
    const org = await newOrg(["AI_WHATSAPP"]);
    const { conversationId } = await processConversationEvent({ channel: "instagram", contactHandle: "@ana", contactName: "Ana", message: { role: "USER", content: "Hola" } }, org.id);
    await processConversationEvent({ channel: "instagram", contactHandle: "@ana", message: { role: "USER", content: "¿Siguen abiertos?" } }, org.id);
    as(org.id);
    const thread = await openInboxThread(conversationId);
    expect(thread.messages.map((m) => m.content)).toEqual(["Hola", "¿Siguen abiertos?"]);
    expect(thread.conversation).toMatchObject({ channel: "instagram", contactName: "Ana" });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).unreadCount).toBe(0);
  });

  it("acepta CRM o Asistente IA y rechaza sin ninguno", async () => {
    const withCrm = await newOrg(["CRM"]);
    const none = await newOrg([]);
    const a = await processConversationEvent({ channel: "email", contactEmail: "x@y.com", message: { role: "USER", content: "Hola" } }, withCrm.id);
    const b = await processConversationEvent({ channel: "email", contactEmail: "x@y.com", message: { role: "USER", content: "Hola" } }, none.id);
    as(withCrm.id);
    await expect(openInboxThread(a.conversationId)).resolves.toBeTruthy();
    as(none.id);
    await expect(openInboxThread(b.conversationId)).rejects.toThrow(/módulo/i);
  });

  it("nunca abre ni modifica conversaciones de otra organización", async () => {
    const mine = await newOrg(["CRM"]);
    const theirs = await newOrg(["CRM"]);
    const { conversationId } = await processConversationEvent({ channel: "messenger", contactHandle: "p1", message: { role: "USER", content: "secreto" } }, theirs.id);
    as(mine.id);
    await expect(openInboxThread(conversationId)).rejects.toThrow(/no encontrada/i);
    await expect(setConversationArchived(conversationId, true)).rejects.toThrow(/no encontrada/i);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).archivedAt).toBeNull();
  });

  it("archivar, importante y no leída; quien solo mira (VIEWER) no puede cambiarlas", async () => {
    const org = await newOrg(["CRM"]);
    const { conversationId } = await processConversationEvent({ channel: "webchat", contactHandle: "v1", message: { role: "USER", content: "Hola" } }, org.id);
    as(org.id, "VIEWER");
    await expect(setConversationArchived(conversationId, true)).rejects.toThrow(/autorizado/i);
    as(org.id);
    await openInboxThread(conversationId);
    await setConversationArchived(conversationId, true);
    await setConversationImportant(conversationId, true);
    await markConversationUnread(conversationId);
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).toMatchObject({ important: true, unreadCount: 1 });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).archivedAt).not.toBeNull();
    await setConversationArchived(conversationId, false);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).archivedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: { in: ["conversation.archive", "conversation.unarchive"] } } })).toBe(2);
  });
});
