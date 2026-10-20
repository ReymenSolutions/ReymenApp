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
    // Mismo correo comparte contacto, pero cada canal conserva su conversación y destino.
    expect(cb.id).not.toBe(ca.id);
    expect(cb.leadId).toBe(ca.leadId);
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

describe("phase0: strict channel identity and escalation continuity", () => {
  const orgs: string[] = [];
  const setup = async () => { const o = await createTestOrg("Phase0 Channels"); orgs.push(o.id); return o; };
  afterEach(async () => { for (const id of orgs.splice(0)) await cleanupOrg(id); });
  const payload = (channel: string, externalId: string) => ({ channel, contactPhone: "+52 81 1234 5678", message: { role: "USER", content: "Hola", externalId } });
  it("same phone in two channels preserves separate threads, one CRM contact", async () => {
    const org = await setup();
    const a = await processConversationEvent(payload("wa", "wa1"), org.id);
    const b = await processConversationEvent(payload("messenger", "fb1"), org.id);
    expect(a.conversationId).not.toBe(b.conversationId);
    const rows = await prisma.conversation.findMany({ where: { organizationId: org.id } });
    expect(new Set(rows.map((r) => r.leadId)).size).toBe(1);
    expect(rows.map((r) => r.channel).sort()).toEqual(["messenger", "whatsapp"]);
  });
  it("keeps escalated thread and human control for subsequent messages", async () => {
    const org = await setup();
    const a = await processConversationEvent(payload("whatsapp", "one"), org.id);
    await prisma.conversation.update({ where: { id: a.conversationId }, data: { status: "ESCALATED", aiHandled: false, escalatedAt: new Date() } });
    const b = await processConversationEvent(payload("whatsapp", "two"), org.id);
    expect(b.conversationId).toBe(a.conversationId);
    expect(await prisma.conversation.findUnique({ where: { id: a.conversationId } })).toMatchObject({ status: "ESCALATED", aiHandled: false, unreadCount: 2 });
  });
  it("rejects explicit foreign IDs and mismatched channel, preserves legacy omitted channel", async () => {
    const org = await setup(); const other = await setup();
    const a = await processConversationEvent(payload("instagram", "one"), org.id);
    await expect(processConversationEvent({ ...payload("whatsapp", "bad"), conversationId: a.conversationId }, org.id)).rejects.toThrow("Conversation not found");
    await expect(processConversationEvent({ ...payload("instagram", "bad"), conversationId: a.conversationId }, other.id)).rejects.toThrow("Conversation not found");
    await processConversationEvent({ conversationId: a.conversationId, message: { role: "USER", content: "legacy ID only" } }, org.id);
    expect(await prisma.conversation.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await prisma.lead.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await prisma.message.count({ where: { conversationId: a.conversationId } })).toBe(2);
  });
  it("serializes concurrent first deliveries and duplicate messages", async () => {
    const org = await setup();
    const results = await Promise.all(Array.from({ length: 5 }, () => processConversationEvent(payload("whatsapp", "same"), org.id)));
    expect(new Set(results.map((r) => r.conversationId)).size).toBe(1);
    expect(await prisma.conversation.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await prisma.lead.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await prisma.message.count({ where: { conversationId: results[0].conversationId } })).toBe(1);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: results[0].conversationId } })).unreadCount).toBe(1);
  });
  it("accepts nullable legacy fields while retaining strict channel identity", async () => {
    const org = await setup();
    const a = await processConversationEvent({ channel: "instagram", contactHandle: "@nullable", contactEmail: null, subject: null, contactName: null, contactPhone: null, conversationId: null, message: { role: "USER", content: "hola", externalId: null } }, org.id);
    const b = await processConversationEvent({ channel: "IG", contactHandle: "@nullable", message: { role: "USER", content: "control" } }, org.id);
    expect(a.conversationId).toBe(b.conversationId);
    expect(await prisma.message.count({ where: { conversationId: a.conversationId } })).toBe(2);
  });

});
