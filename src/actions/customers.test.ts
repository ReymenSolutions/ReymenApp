// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createLeadFromCustomer } = await import("./customers");
const { createLead, mergeLeads } = await import("./leads");
const { processFoodPosOrder } = await import("@/lib/food");
const { processLeadEvent } = await import("@/lib/webhook-processors");
const { getLeadTimeline } = await import("@/lib/lead-timeline");

describe("clientes del POS y contactos del CRM", () => {
  let org: { id: string };
  let other: { id: string };
  let owner: { id: string };
  let viewer: { id: string };
  let variantId: string;
  const as = (u: { id: string }, role: "OWNER" | "VIEWER", orgId = org.id) => authMock.mockResolvedValue(fakeSession({ id: u.id, role, organizationId: orgId }));
  const buy = (phone: string, amount = 100, extra: Record<string, unknown> = {}) =>
    processFoodPosOrder({ grossAmount: amount, netAmount: amount / 1.16, items: [{ variantId, quantity: amount > 0 ? 1 : -1 }], customer: { phone, name: "Cliente", consent: { accepted: true, textVersion: "v1" } }, ...extra }, org.id);
  const customerOf = (key: string) => prisma.customer.findFirstOrThrow({ where: { organizationId: org.id, phoneKey: key } });
  const form = (o: Record<string, string>) => Object.assign(new FormData(), {}) && Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());

  beforeAll(async () => {
    org = await createTestOrg("Cust CRM Org");
    other = await createTestOrg("Cust CRM Other");
    owner = await createTestUser(org.id, "OWNER", "cc-owner");
    viewer = await createTestUser(org.id, "VIEWER", "cc-viewer");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } }); // createTestOrg ya activa CRM
    const dish = await prisma.foodDish.create({
      data: { organizationId: org.id, name: "Taco", variants: { create: [{ organizationId: org.id, label: "Único", price: 100 }] } },
      include: { variants: true },
    });
    variantId = dish.variants[0].id;
  });
  afterAll(async () => {
    await prisma.lead.updateMany({ where: { organizationId: org.id }, data: { deletedAt: new Date() } });
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });

  it("al crear un contacto, los clientes que ya compraron con ese teléfono se enlazan solos", async () => {
    as(owner, "OWNER");
    await buy("5511110001");
    expect((await customerOf("5511110001")).leadId).toBeNull();
    const res = await createLead(form({ name: "Ana", phone: "+52 55 1111 0001" }));
    expect((await customerOf("5511110001")).leadId).toBe(res.leadId);
  });

  it("un contacto que llega por el webhook también se enlaza con su compra anterior", async () => {
    await buy("5511110002");
    await processLeadEvent({ name: "Beto", phone: "55 1111 0002", source: "whatsapp" }, org.id);
    const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId: org.id, phoneKey: "5511110002" } });
    expect((await customerOf("5511110002")).leadId).toBe(lead.id);
  });

  it("y al revés: si el contacto ya existe, la venta enlaza al cliente (comportamiento previo)", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Carla", phone: "5511110003", phoneKey: "5511110003" } });
    await buy("5511110003");
    expect((await customerOf("5511110003")).leadId).toBe(lead.id);
  });

  it("'Crear contacto' desde un cliente: lo crea, lo enlaza y respeta el consentimiento", async () => {
    as(owner, "OWNER");
    await buy("5511110004");
    const c = await customerOf("5511110004");
    const res = await createLeadFromCustomer(c.id);
    expect(res.created).toBe(true);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: res.leadId } });
    expect(lead).toMatchObject({ name: "Cliente", phoneKey: "5511110004", source: "pos", status: "WON", doNotContact: false });
    expect((await customerOf("5511110004")).leadId).toBe(lead.id);
    // Repetirlo no duplica.
    expect(await createLeadFromCustomer(c.id)).toMatchObject({ created: false, leadId: lead.id });
    expect(await prisma.lead.count({ where: { organizationId: org.id, phoneKey: "5511110004" } })).toBe(1);

    // Sin consentimiento: nace con "no contactar".
    await processFoodPosOrder({ grossAmount: 50, netAmount: 43, items: [{ variantId, quantity: 1 }], customer: { phone: "5511110005", consent: { accepted: false, textVersion: "v1" } } }, org.id);
    const nc = await createLeadFromCustomer((await customerOf("5511110005")).id);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: nc.leadId } })).doNotContact).toBe(true);
  });

  it("si ya hay un contacto con ese teléfono, solo se enlaza (sin duplicar)", async () => {
    await buy("5511110006");
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Dani", phone: "5511110006", phoneKey: "5511110006" } });
    await prisma.customer.update({ where: { id: (await customerOf("5511110006")).id }, data: { leadId: null } });
    const res = await createLeadFromCustomer((await customerOf("5511110006")).id);
    expect(res).toMatchObject({ created: false, leadId: lead.id });
  });

  it("solo quien puede crear contactos, y nunca con clientes de otra organización", async () => {
    const c = await customerOf("5511110005");
    as(viewer, "VIEWER");
    await expect(createLeadFromCustomer(c.id)).rejects.toThrow();
    const otherOwner = await createTestUser(other.id, "OWNER", "cc-other");
    as(otherOwner, "OWNER", other.id);
    await expect(createLeadFromCustomer(c.id)).rejects.toThrow();
  });

  it("al fusionar contactos, el cliente pasa al que se conserva", async () => {
    as(owner, "OWNER");
    const a = await prisma.lead.create({ data: { organizationId: org.id, name: "Eva", phone: "5511110007", phoneKey: "5511110007" } });
    const b = await prisma.lead.create({ data: { organizationId: org.id, name: "Eva dup", email: "eva@x.com" } });
    await buy("5511110007"); // enlazado a a
    await prisma.customer.update({ where: { id: (await customerOf("5511110007")).id }, data: { leadId: b.id } });
    await mergeLeads(a.id, b.id);
    expect((await customerOf("5511110007")).leadId).toBe(a.id);
  });

  it("la línea de tiempo del contacto incluye sus compras y cancelaciones", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Fer", phone: "5511110008", phoneKey: "5511110008" } });
    await buy("5511110008", 200, { orderId: "T1" });
    await buy("5511110008", -200, { orderId: "T1" });
    const { events } = await getLeadTimeline({ id: lead.id, organizationId: org.id, createdAt: lead.createdAt, source: lead.source, phoneKey: lead.phoneKey });
    const purchases = events.filter((e) => e.type === "purchase");
    expect(purchases).toHaveLength(2);
    expect(purchases.map((p) => p.type === "purchase" && [p.amount, p.cancelled]).sort()).toEqual([[200, false], [200, true]]);
  });
});
