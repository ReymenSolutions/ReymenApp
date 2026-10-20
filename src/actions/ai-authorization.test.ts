// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanupOrg, createTestOrg, createTestUser, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth(), isAdmin: (r: string) => ["ADMIN", "SUPER_ADMIN"].includes(r) }));
const { createArticle, updateArticle, deleteArticle } = await import("./knowledge-base");
const { upsertWhatsAppAssistant } = await import("./whatsapp-assistant");
const { saveRulebook } = await import("./rulebook");
const { escalateConversation, resolveConversation, getOlderMessages } = await import("./conversations");

describe("AI configuration authorization at Server Action boundary", () => {
  let a: { id: string }, b: { id: string }, owner: { id: string };
  let article: { id: string }, conversation: { id: string }, cursor: { id: string };
  const input = { title: "Private source", content: "Private content" };
  beforeAll(async () => {
    a = await createTestOrg("Phase0 Auth A"); b = await createTestOrg("Phase0 Auth B");
    owner = await createTestUser(a.id, "OWNER", "phase0-owner");
    article = await prisma.knowledgeBase.create({ data: { organizationId: b.id, ...input, tags: ["keep"] } });
    conversation = await prisma.conversation.create({ data: { organizationId: b.id, channel: "whatsapp" } });
    cursor = await prisma.message.create({ data: { conversationId: conversation.id, role: "USER", content: "private" } });
  });
  afterAll(async () => { await cleanupOrg(a.id); await cleanupOrg(b.id); });
  const login = (role: UserRole, organizationId: string = a.id) => auth.mockResolvedValue(fakeSession({ ...owner, role, organizationId }));

  it.each(["AGENT", "VIEWER", "CLIENT"] as UserRole[])("denies %s direct knowledge/identity/rulebook mutations without writes", async (role) => {
    login(role);
    const count = await prisma.knowledgeBase.count({ where: { organizationId: a.id } });
    for (const call of [() => createArticle(input), () => updateArticle(article.id, input), () => deleteArticle(article.id), () => upsertWhatsAppAssistant({ name: "forged" }), () => saveRulebook({ voice: "x", greeting: "", rules: "", pricing: "" })]) {
      await expect(call()).rejects.toThrow("No autorizado");
    }
    expect(await prisma.knowledgeBase.count({ where: { organizationId: a.id } })).toBe(count);
    expect(await prisma.whatsAppAssistant.count({ where: { organizationId: a.id } })).toBe(0);
    expect(await prisma.businessRulebook.count({ where: { organizationId: a.id } })).toBe(0);
    expect(await prisma.knowledgeBase.findUnique({ where: { id: article.id } })).toMatchObject(input);
  });
  it("rejects anonymous actions", async () => {
    auth.mockResolvedValue(null);
    await expect(createArticle(input)).rejects.toThrow("No autorizado");
    await expect(upsertWhatsAppAssistant({ name: "x" })).rejects.toThrow("No autorizado");
    await expect(saveRulebook({ voice: "", greeting: "", rules: "", pricing: "" })).rejects.toThrow("No autorizado");
  });
  it("denies all configuration mutations when module is inactive, even to OWNER", async () => {
    login("OWNER");
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: a.id, module: "AI_WHATSAPP" } }, data: { status: "CANCELLED" } });
    try {
      for (const call of [() => createArticle(input), () => updateArticle(article.id, input), () => deleteArticle(article.id), () => upsertWhatsAppAssistant({ name: "x" }), () => saveRulebook({ voice: "", greeting: "", rules: "", pricing: "" })]) await expect(call()).rejects.toThrow(/módulo/);
    } finally {
      await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: a.id, module: "AI_WHATSAPP" } }, data: { status: "ACTIVE" } });
    }
  });
  it.each(["OWNER", "MANAGER"] as UserRole[])("preserves legitimate %s configuration and tags omitted by editor", async (role) => {
    login(role);
    await createArticle({ ...input, title: role, tags: ["keep"] });
    const own = await prisma.knowledgeBase.findFirstOrThrow({ where: { organizationId: a.id, title: role } });
    await updateArticle(own.id, { title: role, content: "Updated" });
    expect((await prisma.knowledgeBase.findUniqueOrThrow({ where: { id: own.id } })).tags).toEqual(["keep"]);
    await upsertWhatsAppAssistant({ name: role });
    await saveRulebook({ voice: role, greeting: "", rules: "", pricing: "" });
  });
  it("rejects foreign article/conversation IDs and foreign message pagination cursor", async () => {
    login("OWNER");
    await expect(updateArticle(article.id, input)).rejects.toThrow("Artículo no encontrado");
    await expect(deleteArticle(article.id)).rejects.toThrow("Artículo no encontrado");
    await expect(escalateConversation(conversation.id)).rejects.toThrow("Conversación no encontrada");
    await expect(resolveConversation(conversation.id)).rejects.toThrow("Conversación no encontrada");
    const own = await prisma.conversation.create({ data: { organizationId: a.id, channel: "whatsapp" } });
    await expect(getOlderMessages(own.id, cursor.id)).rejects.toThrow("Mensaje no encontrado");
    expect(await prisma.conversation.findUnique({ where: { id: conversation.id } })).toMatchObject({ status: "OPEN" });
  });
  it.each(["VIEWER", "CLIENT"] as UserRole[])("denies %s escalation/resolution", async (role) => {
    login(role);
    await expect(escalateConversation(conversation.id)).rejects.toThrow("No autorizado");
    await expect(resolveConversation(conversation.id)).rejects.toThrow("No autorizado");
  });
});
