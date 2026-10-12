// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const { processConversationEvent } = await import("./webhook-processors");

describe("entrada multicanal del inbox", () => {
  const orgs: string[] = [];
  const newOrg = async () => {
    const org = await createTestOrg("Inbox Ingest");
    orgs.push(org.id);
    return org;
  };
  afterEach(async () => {
    for (const id of orgs.splice(0)) await cleanupOrg(id);
  });

  it("un mensaje de Instagram sin teléfono crea la conversación por usuario y el contacto en el CRM", async () => {
    const org = await newOrg();
    const { conversationId } = await processConversationEvent({ channel: "IG", contactHandle: "@casey_l", contactName: "Casey Lindqvist", message: { role: "USER", content: "¿Cuánto cuesta el cajón?" } }, org.id);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv).toMatchObject({ channel: "instagram", contactHandle: "@casey_l", contactPhone: null, unreadCount: 1, lastMessageRole: "USER", lastMessagePreview: "¿Cuánto cuesta el cajón?" });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: conv.leadId! } });
    expect(lead).toMatchObject({ name: "Casey Lindqvist", source: "instagram", phone: null });

    // Otro mensaje del mismo usuario cae en la misma conversación y suma un no leído.
    const again = await processConversationEvent({ channel: "instagram", contactHandle: "@casey_l", message: { role: "USER", content: "¿Y la instalación?" } }, org.id);
    expect(again.conversationId).toBe(conversationId);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).unreadCount).toBe(2);
    expect(await prisma.lead.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("el mismo usuario en otro canal es otra conversación; el mismo correo reutiliza el contacto", async () => {
    const org = await newOrg();
    const a = await processConversationEvent({ channel: "email", contactEmail: "Ana@Correo.com", subject: "Cotización Hilux", message: { role: "USER", content: "Hola, quiero cotizar" } }, org.id);
    const b = await processConversationEvent({ channel: "enquiry", contactEmail: "ana@correo.com", contactName: "Ana", message: { role: "USER", content: "Formulario del sitio" } }, org.id);
    const ca = await prisma.conversation.findUniqueOrThrow({ where: { id: a.conversationId } });
    const cb = await prisma.conversation.findUniqueOrThrow({ where: { id: b.conversationId } });
    // Mismo correo → misma conversación abierta (se unifican las consultas de la misma persona).
    expect(cb.id).toBe(ca.id);
    expect(ca).toMatchObject({ contactEmail: "ana@correo.com", subject: "Cotización Hilux", channel: "email" });
    expect(await prisma.lead.count({ where: { organizationId: org.id, email: "ana@correo.com" } })).toBe(1);
  });

  it("una respuesta nuestra actualiza la vista previa y el estado sin sumar no leídos; el cliente desarchiva", async () => {
    const org = await newOrg();
    const first = await processConversationEvent({ channel: "messenger", contactHandle: "psid-1", message: { role: "USER", content: "Hola" } }, org.id);
    await processConversationEvent({ channel: "messenger", contactHandle: "psid-1", message: { role: "ASSISTANT", content: "Hola, ¿en qué te ayudo?" } }, org.id);
    let conv = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId } });
    expect(conv).toMatchObject({ unreadCount: 1, lastMessageRole: "ASSISTANT", lastMessagePreview: "Hola, ¿en qué te ayudo?" });

    await prisma.conversation.update({ where: { id: conv.id }, data: { archivedAt: new Date() } });
    await processConversationEvent({ channel: "messenger", contactHandle: "psid-1", message: { role: "USER", content: "¿Sigues ahí?" } }, org.id);
    conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(conv).toMatchObject({ archivedAt: null, unreadCount: 2, lastMessageRole: "USER" });
  });

  it("sin teléfono, usuario ni correo se rechaza; no mezcla organizaciones", async () => {
    const a = await newOrg();
    const b = await newOrg();
    await expect(processConversationEvent({ channel: "instagram", message: { role: "USER", content: "x" } }, a.id)).rejects.toThrow(/teléfono|usuario|correo/i);
    const ca = await processConversationEvent({ channel: "instagram", contactHandle: "@mismo", message: { role: "USER", content: "a" } }, a.id);
    const cb = await processConversationEvent({ channel: "instagram", contactHandle: "@mismo", message: { role: "USER", content: "b" } }, b.id);
    expect(ca.conversationId).not.toBe(cb.conversationId);
  });

  it("WhatsApp con teléfono sigue igual (compatibilidad)", async () => {
    const org = await newOrg();
    const { conversationId } = await processConversationEvent({ channel: "whatsapp", contactPhone: "+52 55 1234 5678", contactName: "Luis", message: { role: "USER", content: "Hola" } }, org.id);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv).toMatchObject({ channel: "whatsapp", phoneKey: "5512345678", unreadCount: 1 });
  });
});
