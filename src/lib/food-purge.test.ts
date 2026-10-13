// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { processFoodPosOrder } from "./food";
import { previewPosSalesPurge, purgePosSales, purgeRange } from "./food-purge";

let orgId: string;
let leche: { id: string };
let cafe: { id: string };
let variantId: string;
let optionId: string;

async function order(occurredAt: string, quantity: number, withModifier = false) {
  await processFoodPosOrder(
    {
      occurredAt,
      grossAmount: 60 * quantity,
      netAmount: 51.72 * quantity,
      items: [{ variantId, quantity, ...(withModifier ? { modifiers: [{ optionId, quantity }] } : {}) }],
    },
    orgId,
  );
}

const stock = async (id: string) => Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id } })).currentStock);
const dishSales = () => prisma.foodDishSale.findMany({ where: { organizationId: orgId }, orderBy: { occurredAt: "asc" } });

beforeEach(async () => {
  const org = await createTestOrg("Food Purge Org");
  orgId = org.id;
  await prisma.organizationModule.create({ data: { organizationId: orgId, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
  leche = await prisma.foodInventoryItem.create({ data: { organizationId: orgId, name: "Leche", unit: "lt", unitCost: 20, currentStock: 10, minStock: 1 } });
  cafe = await prisma.foodInventoryItem.create({ data: { organizationId: orgId, name: "Café", unit: "kg", unitCost: 300, currentStock: 5, minStock: 1 } });
  const dish = await prisma.foodDish.create({
    data: {
      organizationId: orgId,
      name: "Latte",
      variants: { create: [{ organizationId: orgId, label: "Único", price: 60, ingredients: { create: [{ inventoryItemId: leche.id, quantity: 0.25 }, { inventoryItemId: cafe.id, quantity: 0.02 }] } }] },
    },
    include: { variants: true },
  });
  variantId = dish.variants[0].id;
  const group = await prisma.foodModifierGroup.create({
    data: { organizationId: orgId, name: "Extra", options: { create: [{ name: "Shot extra", priceDelta: 10 }] } },
    include: { options: true },
  });
  optionId = group.options[0].id;
  await prisma.foodModifierOptionIngredient.create({ data: { optionId, inventoryItemId: cafe.id, quantity: 0.01 } });
});

afterEach(async () => {
  await cleanupOrg(orgId);
});

describe("purgeRange", () => {
  it("covers both days and validates input", () => {
    const r = purgeRange("2026-10-03", "2026-10-04", "America/Mexico_City");
    // Momentos reales: medianoche de México (UTC-6) de ambos días; claves de día: las fechas a las 00:00 UTC.
    expect(r.instant.gte.toISOString()).toBe("2026-10-03T06:00:00.000Z");
    expect(r.instant.lt.toISOString()).toBe("2026-10-05T06:00:00.000Z");
    expect(r.key.gte.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(r.key.lt.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(() => purgeRange("2026-10-05", "2026-10-04", "America/Mexico_City")).toThrow(/anterior/);
    expect(() => purgeRange("2026-02-30", "2026-03-01", "America/Mexico_City")).toThrow(/inválida/);
    expect(() => purgeRange("2025-01-01", "2026-10-01", "America/Mexico_City")).toThrow(/año/);
  });
});

describe("purgePosSales", () => {
  it("removes test sales exactly: stock back, dish counts back, other days and manual sales untouched", async () => {
    await order(new Date(2026, 9, 3, 10).toISOString(), 2, true); // prueba
    await order(new Date(2026, 9, 3, 12).toISOString(), 1); // prueba
    await order(new Date(2026, 9, 3, 13).toISOString(), -1); // cancelación de prueba
    await order(new Date(2026, 9, 6, 9).toISOString(), 3); // real, fuera del rango
    await prisma.foodSale.create({ data: { organizationId: orgId, occurredAt: new Date(2026, 9, 3, 15), grossAmount: 99, netAmount: 85, source: "MANUAL" } });

    // Antes: 2+1-1+3 = 5 latte → leche 10 - 1.25, café 5 - 0.1 - 0.02 (2 shots)
    expect(await stock(leche.id)).toBeCloseTo(8.75);
    expect(await stock(cafe.id)).toBeCloseTo(4.88);

    const preview = await previewPosSalesPurge(orgId, "2026-10-03", "2026-10-04");
    expect(preview).toMatchObject({ sales: 3, grossAmount: 120, units: 2, inventoryItems: 2 });

    const result = await purgePosSales(orgId, "2026-10-03", "2026-10-04");
    expect(result.sales).toBe(3);

    // Solo queda el consumo de la venta real (3 latte).
    expect(await stock(leche.id)).toBeCloseTo(9.25);
    expect(await stock(cafe.id)).toBeCloseTo(4.94);
    const sales = await prisma.foodSale.findMany({ where: { organizationId: orgId }, orderBy: { occurredAt: "asc" } });
    expect(sales.map((s) => s.source)).toEqual(["MANUAL", "POS"]);
    expect((await dishSales()).map((d) => d.quantity)).toEqual([3]);
    expect(await prisma.foodModifierOptionSale.count({ where: { organizationId: orgId } })).toBe(0);
    expect(await prisma.foodInventoryMovement.count({ where: { organizationId: orgId, foodSaleId: { not: null } } })).toBe(2);
    expect(await prisma.foodRecipeUsage.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it("keeps a day's real sales when only part of it was a test", async () => {
    await order(new Date(2026, 9, 3, 10).toISOString(), 2);
    await order(new Date(2026, 9, 4, 10).toISOString(), 1);
    await purgePosSales(orgId, "2026-10-04", "2026-10-04");
    expect((await dishSales()).map((d) => d.quantity)).toEqual([2]);
  });

  it("with Reymen POS, rebuilds the day's dish counts from the remaining sales (no leftovers)", async () => {
    await prisma.organizationModule.create({ data: { organizationId: orgId, module: "REYMEN_POS", status: "ACTIVE", source: "SUBSCRIBED" } });
    await order(new Date(2026, 9, 3, 10).toISOString(), 2, true); // prueba
    await order(new Date(2026, 9, 4, 10).toISOString(), 1); // real, fuera del rango
    // Conteo sin venta detrás (p. ej. de un borrado con un rango incompleto).
    await prisma.foodDishSale.update({ where: { variantId_occurredAt: { variantId, occurredAt: new Date(2026, 9, 3) } }, data: { quantity: { increment: 5 } } });

    expect(await previewPosSalesPurge(orgId, "2026-10-03", "2026-10-03")).toMatchObject({ sales: 1, recordedUnits: 7 });
    await purgePosSales(orgId, "2026-10-03", "2026-10-03");
    expect((await dishSales()).map((d) => [d.occurredAt.getDate(), d.quantity])).toEqual([[4, 1]]);
    expect(await prisma.foodModifierOptionSale.count({ where: { organizationId: orgId } })).toBe(0);

    // Solo conteos colgados, sin ventas: también se limpian.
    await prisma.foodDishSale.create({ data: { organizationId: orgId, variantId, occurredAt: new Date(2026, 9, 2), quantity: 3 } });
    expect(await previewPosSalesPurge(orgId, "2026-10-02", "2026-10-02")).toMatchObject({ sales: 0, recordedUnits: 3 });
    await purgePosSales(orgId, "2026-10-02", "2026-10-02");
    expect((await dishSales()).map((d) => d.quantity)).toEqual([1]);
  });

  it("with Reymen POS, keeps real sales of a partly-test day", async () => {
    await prisma.organizationModule.create({ data: { organizationId: orgId, module: "REYMEN_POS", status: "ACTIVE", source: "SUBSCRIBED" } });
    await order(new Date(2026, 9, 3, 9).toISOString(), 2, true); // real (antes de la prueba)
    await order(new Date(2026, 9, 4, 10).toISOString(), 3); // prueba
    await purgePosSales(orgId, "2026-10-04", "2026-10-04");
    expect((await dishSales()).map((d) => d.quantity)).toEqual([2]);
    expect((await prisma.foodModifierOptionSale.findMany({ where: { organizationId: orgId } })).map((m) => m.quantity)).toEqual([2]);
  });

  it("is a no-op without sales in the range", async () => {
    expect(await purgePosSales(orgId, "2026-01-01", "2026-01-31")).toMatchObject({ sales: 0, grossAmount: 0, firstAt: null, recordedUnits: 0 });
  });
});
