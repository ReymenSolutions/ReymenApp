// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { getFoodLeastSoldDishes, getFoodNetProfit, getFoodProfitRecommendations, getFoodTopSellingDishes, processFoodPosOrder } from "./food";

describe("rentabilidad y platillos vendidos por sucursal", () => {
  let org: { id: string };
  let centro: { id: string };
  let taco: string;
  let torta: string;
  const sale = (variantId: string, qty: number, extra: Record<string, unknown> = {}) => ({
    grossAmount: qty * 116,
    netAmount: qty * 100,
    items: [{ variantId, quantity: qty }],
    ...extra,
  });

  beforeAll(async () => {
    org = await createTestOrg("Branch Reports Org");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    centro = await prisma.branch.create({ data: { organizationId: org.id, name: "Centro" } });
    const harina = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Harina", unit: "kg", unitCost: 20, currentStock: 100, minStock: 1 } });
    const mk = (name: string, price: number) =>
      prisma.foodDish.create({
        data: { organizationId: org.id, name, variants: { create: [{ organizationId: org.id, label: "Único", price, ingredients: { create: [{ inventoryItemId: harina.id, quantity: 1 }] } }] } },
        include: { variants: true },
      });
    taco = (await mk("Taco", 116)).variants[0].id;
    torta = (await mk("Torta", 116)).variants[0].id;
    await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 3000 } });

    await processFoodPosOrder(sale(taco, 3, { orderId: "P1" }), org.id); // Principal: 3 tacos
    await processFoodPosOrder(sale(taco, 1, { orderId: "C1", branchId: centro.id }), org.id); // Centro: 1 taco
    await processFoodPosOrder(sale(torta, 5, { orderId: "C2", branchId: centro.id }), org.id); // Centro: 5 tortas
    await processFoodPosOrder(sale(torta, -2, { orderId: "C2" }), org.id); // cancela 2 (hereda Centro)
  });
  afterAll(async () => {
    await prisma.foodOperatingCost.deleteMany({ where: { organizationId: org.id } });
    await cleanupOrg(org.id);
  });

  const units = async (branch?: string | null) => Object.fromEntries((await getFoodTopSellingDishes(org.id, 30, 10, branch)).map((d) => [d.name, d.unitsSold]));

  it("guarda la sucursal de la venta en el consumo de recetas, con o sin inventario por sucursal", async () => {
    const usage = await prisma.foodRecipeUsage.findMany({ where: { organizationId: org.id, saleBranchId: centro.id } });
    expect(usage).toHaveLength(3);
    expect(usage.every((u) => u.branchId === null)).toBe(true); // inventario por sucursal apagado: el stock no se separa
  });

  it("platillos más vendidos: todas juntas, solo la Principal o solo una sucursal", async () => {
    expect(await units()).toEqual({ Taco: 4, Torta: 3 });
    expect(await units(null)).toEqual({ Taco: 3 });
    expect(await units(centro.id)).toEqual({ Taco: 1, Torta: 3 }); // 5 vendidas − 2 canceladas
  });

  it("utilidad: ingresos y costo de lo vendido por sucursal; los costos fijos no se reparten", async () => {
    const all = await getFoodNetProfit(org.id, "30d");
    expect(all.revenue).toBe(700); // 3 + 1 + 5 − 2 = 7 unidades × 100
    expect(all.cogs).toBe(140); // 7 × 20
    expect(all.fixedCostsExcluded).toBe(false);
    expect(all.fixedCostsProrated).toBeGreaterThan(0);

    const c = await getFoodNetProfit(org.id, "30d", centro.id);
    expect(c.revenue).toBe(400); // 1 + 5 − 2 = 4 × 100
    expect(c.cogs).toBe(80);
    expect(c.fixedCostsExcluded).toBe(true);
    expect(c.fixedCostsProrated).toBe(0);
    expect(c.netProfit).toBe(320);

    const p = await getFoodNetProfit(org.id, "30d", null);
    expect(p.revenue).toBe(300);
    expect(p.cogs).toBe(60);
  });

  it("menos vendidos y recomendaciones respetan la sucursal", async () => {
    expect((await getFoodLeastSoldDishes(org.id, 30, 5, null)).map((d) => d.name)).toEqual(["Taco"]);
    expect((await getFoodLeastSoldDishes(org.id, 30, 5, centro.id)).map((d) => d.unitsSold).sort()).toEqual([1, 3]);
    await expect(getFoodProfitRecommendations(org.id, centro.id)).resolves.toBeDefined();
  });
});
