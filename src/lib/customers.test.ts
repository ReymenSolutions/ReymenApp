// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getOrgTimezone, localDateString } from "@/lib/business-day";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { normalizePhoneMx, parsePosCustomer } from "./customers";
import { processFoodPosOrder } from "./food";
import { purgePosSales } from "./food-purge";

describe("normalizePhoneMx", () => {
  it.each([
    ["55 1234 5678", "+525512345678"],
    ["(55) 1234-5678", "+525512345678"],
    ["+52 55 1234 5678", "+525512345678"],
    ["52 55 1234 5678", "+525512345678"],
    ["+52 1 55 1234 5678", "+525512345678"],
    ["+1 415 555 0100", "+14155550100"],
  ])("%s → %s", (raw, expected) => expect(normalizePhoneMx(raw)).toBe(expected));

  it.each(["", "1234", "abc", null, 5, undefined])("descarta %s", (raw) => expect(normalizePhoneMx(raw)).toBeNull());
});

describe("parsePosCustomer", () => {
  it("ignora un cliente mal formado en lugar de tirar la venta", () => {
    expect(parsePosCustomer(undefined)).toBeNull();
    expect(parsePosCustomer({ phone: "123" })).toBeNull();
    expect(parsePosCustomer("x")).toBeNull();
  });
  it("lee nombre y consentimiento", () => {
    expect(parsePosCustomer({ phone: "5512345678", name: "  Ana ", consent: { accepted: true, textVersion: "v1" } })).toEqual({
      phone: "+525512345678",
      name: "Ana",
      consent: { accepted: true, textVersion: "v1", at: undefined },
    });
  });
});

describe("clientes en el webhook del POS", () => {
  let org: { id: string };
  let variantId: string;
  const order = (extra: Record<string, unknown> = {}, gross = 200) => ({ grossAmount: gross, netAmount: gross / 1.16, items: [{ variantId, quantity: gross > 0 ? 1 : -1 }], ...extra });

  beforeAll(async () => {
    org = await createTestOrg("Customers Org");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    const dish = await prisma.foodDish.create({
      data: { organizationId: org.id, name: "Taco", variants: { create: [{ organizationId: org.id, label: "Único", price: 200 }] } },
      include: { variants: true },
    });
    variantId = dish.variants[0].id;
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("una venta sin cliente se comporta como siempre", async () => {
    await processFoodPosOrder(order(), org.id);
    expect(await prisma.customer.count({ where: { organizationId: org.id } })).toBe(0);
    const sale = await prisma.foodSale.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(sale.customerId).toBeNull();
    expect(sale.externalOrderId).toBeNull();
  });

  it("crea al cliente, suma visitas y gasto, y reconoce el mismo número en otro formato", async () => {
    await processFoodPosOrder(order({ orderId: "A-1", customer: { phone: "55 1111 2222", name: "Ana", consent: { accepted: true, textVersion: "v1" } } }), org.id);
    await processFoodPosOrder(order({ orderId: "A-2", customer: { phone: "+52 1 55 1111 2222" } }, 300), org.id);

    const customers = await prisma.customer.findMany({ where: { organizationId: org.id } });
    expect(customers).toHaveLength(1);
    const c = customers[0];
    expect(c.phone).toBe("+525511112222");
    expect(c.name).toBe("Ana");
    expect(c.visitCount).toBe(2);
    expect(Number(c.totalSpent)).toBe(500);
    expect(c.consentAccepted).toBe(true); // la segunda venta no mandó consentimiento: no se pierde
    expect(c.consentTextVersion).toBe("v1");
    expect(c.firstVisitAt).not.toBeNull();
  });

  it("una cancelación con el id de la orden resta la visita y el gasto del cliente original", async () => {
    await processFoodPosOrder(order({ orderId: "A-2" }, -300), org.id);
    const c = await prisma.customer.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(c.visitCount).toBe(1);
    expect(Number(c.totalSpent)).toBe(200);
    const cancel = await prisma.foodSale.findFirstOrThrow({ where: { organizationId: org.id, grossAmount: { lt: 0 } } });
    expect(cancel.customerId).toBe(c.id);
    expect(cancel.cancelsSaleId).not.toBeNull();
  });

  it("guarda el descuento y descarta uno inválido sin tirar la venta", async () => {
    await processFoodPosOrder(order({ orderId: "D-1", discount: { amount: 20, reason: " Cortesía " } }), org.id);
    await processFoodPosOrder(order({ orderId: "D-2", discount: { amount: "x" } }), org.id);
    const d1 = await prisma.foodSale.findFirstOrThrow({ where: { organizationId: org.id, externalOrderId: "D-1" } });
    const d2 = await prisma.foodSale.findFirstOrThrow({ where: { organizationId: org.id, externalOrderId: "D-2" } });
    expect(Number(d1.discountAmount)).toBe(20);
    expect(d1.discountReason).toBe("Cortesía");
    expect(d2.discountAmount).toBeNull();
  });

  it("un cliente inválido no rechaza la venta", async () => {
    const before = await prisma.foodSale.count({ where: { organizationId: org.id } });
    await processFoodPosOrder(order({ orderId: "B-1", customer: { phone: "12" } }), org.id);
    expect(await prisma.foodSale.count({ where: { organizationId: org.id } })).toBe(before + 1);
  });

  it("se enlaza con el contacto del CRM que tenga el mismo teléfono (sin crear contactos)", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Beto", phone: "55-3333-4444", phoneKey: "5533334444" } });
    await processFoodPosOrder(order({ orderId: "L-1", customer: { phone: "5533334444" } }), org.id);
    const c = await prisma.customer.findFirstOrThrow({ where: { organizationId: org.id, phoneKey: "5533334444" } });
    expect(c.leadId).toBe(lead.id);

    await processFoodPosOrder(order({ orderId: "L-2", customer: { phone: "5544445555" } }), org.id);
    const other = await prisma.customer.findFirstOrThrow({ where: { organizationId: org.id, phoneKey: "5544445555" } });
    expect(other.leadId).toBeNull();
    expect(await prisma.lead.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("no cruza clientes entre organizaciones", async () => {
    const other = await createTestOrg("Customers Other Org");
    try {
      await prisma.organizationModule.create({ data: { organizationId: other.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
      const dish = await prisma.foodDish.create({
        data: { organizationId: other.id, name: "Torta", variants: { create: [{ organizationId: other.id, label: "Único", price: 90 }] } },
        include: { variants: true },
      });
      await processFoodPosOrder({ grossAmount: 90, netAmount: 77, items: [{ variantId: dish.variants[0].id, quantity: 1 }], customer: { phone: "5511112222" } }, other.id);
      const mine = await prisma.customer.findFirstOrThrow({ where: { organizationId: org.id, phoneKey: "5511112222" } });
      const theirs = await prisma.customer.findFirstOrThrow({ where: { organizationId: other.id, phoneKey: "5511112222" } });
      expect(theirs.id).not.toBe(mine.id);
      expect(theirs.visitCount).toBe(1);
    } finally {
      await cleanupOrg(other.id);
    }
  });

  it("borrar ventas de prueba recalcula las estadísticas del cliente", async () => {
    const day = localDateString(new Date(), await getOrgTimezone(org.id));
    await purgePosSales(org.id, day, day);
    const c = await prisma.customer.findFirstOrThrow({ where: { organizationId: org.id, phoneKey: "5511112222" } });
    expect(c.visitCount).toBe(0);
    expect(Number(c.totalSpent)).toBe(0);
    expect(c.lastVisitAt).toBeNull();
  });
});
