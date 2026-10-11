// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));

const { processConversationEvent, processLeadEvent } = await import("./webhook-processors");

const inbound = (phone: string, name?: string, role: "USER" | "ASSISTANT" = "USER") => ({
  contactPhone: phone,
  contactName: name,
  channel: "whatsapp",
  message: { role, content: "Hola" },
});

describe("conversation ↔ contact link", () => {
  const orgs: string[] = [];
  const newOrg = async () => {
    const org = await createTestOrg("CRM Link Org");
    orgs.push(org.id);
    return org;
  };
  afterEach(async () => {
    for (const id of orgs.splice(0)) await cleanupOrg(id);
  });

  it("creates the lead when someone new writes, and links the conversation to it", async () => {
    const org = await newOrg();
    const { conversationId } = await processConversationEvent(inbound("+52 1 55 1234 5678", "Carlos Ramírez"), org.id);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { lead: true } });
    expect(conv.lead?.name).toBe("Carlos Ramírez");
    expect(conv.lead?.source).toBe("whatsapp");
    expect(conv.phoneKey).toBe("5512345678");
    expect(conv.lead?.phoneKey).toBe("5512345678");
  });

  it("falls back to the phone number as the name when WhatsApp gives none", async () => {
    const org = await newOrg();
    const { conversationId } = await processConversationEvent(inbound("+52 55 9999 0000"), org.id);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { lead: true } });
    expect(conv.lead?.name).toBe("+52 55 9999 0000");
  });

  it("the same number in another format is the same conversation and the same lead", async () => {
    const org = await newOrg();
    const a = await processConversationEvent(inbound("+52 1 55 1234 5678", "Ana"), org.id);
    const b = await processConversationEvent(inbound("5512345678", "Ana"), org.id);
    const c = await processConversationEvent(inbound("(55) 1234-5678", "Ana"), org.id);

    expect(b.conversationId).toBe(a.conversationId);
    expect(c.conversationId).toBe(a.conversationId);
    expect(await prisma.lead.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("links to an existing lead instead of creating another, even with a different phone format", async () => {
    const org = await newOrg();
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Existente", phone: "55 1234 5678", phoneKey: "5512345678" } });
    const { conversationId } = await processConversationEvent(inbound("+52 1 55 1234 5678", "Otro nombre"), org.id);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.leadId).toBe(lead.id);
    expect(await prisma.lead.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("does not create a lead from an outbound (assistant) message", async () => {
    const org = await newOrg();
    const { conversationId } = await processConversationEvent(inbound("+52 55 1111 2222", "Saliente", "ASSISTANT"), org.id);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.leadId).toBeNull();
    expect(await prisma.lead.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("CRITICAL: at the plan's lead limit the message is still saved, just without a lead", async () => {
    const org = await newOrg();
    await prisma.lead.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({ organizationId: org.id, name: `Relleno ${i}` })),
    });
    const { conversationId } = await processConversationEvent(inbound("+52 55 3333 4444", "Sin cupo"), org.id);

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { messages: true } });
    expect(conv.messages).toHaveLength(1);
    expect(conv.leadId).toBeNull();
    expect(await prisma.lead.count({ where: { organizationId: org.id } })).toBe(500);
  });

  it("does not create leads for an organization without the CRM module", async () => {
    const org = await newOrg();
    await prisma.organizationModule.deleteMany({ where: { organizationId: org.id, module: "CRM" } });
    const { conversationId } = await processConversationEvent(inbound("+52 55 5555 6666", "Sin CRM"), org.id);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.leadId).toBeNull();
    expect(await prisma.lead.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("never links across organizations", async () => {
    const orgA = await newOrg();
    const orgB = await newOrg();
    const leadA = await prisma.lead.create({ data: { organizationId: orgA.id, name: "De A", phone: "55 7777 8888", phoneKey: "5577778888" } });
    const { conversationId } = await processConversationEvent(inbound("55 7777 8888", "Escribe a B"), orgB.id);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.leadId).not.toBe(leadA.id);
  });

  it("a lead created later (webhook) adopts the conversations that had no contact", async () => {
    const org = await newOrg();
    await prisma.organizationModule.deleteMany({ where: { organizationId: org.id, module: "CRM" } });
    const { conversationId } = await processConversationEvent(inbound("+52 55 9090 1212", "Llega primero"), org.id);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).leadId).toBeNull();

    await processLeadEvent({ name: "Alta posterior", phone: "55 9090 1212", source: "n8n" }, org.id);
    const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId: org.id, name: "Alta posterior" } });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).leadId).toBe(lead.id);
  });
});
