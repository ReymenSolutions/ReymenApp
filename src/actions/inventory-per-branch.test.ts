// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getOrgTimezone, localDateString } from "@/lib/business-day";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { setInventoryPerBranch } = await import("./branch-menu");
const inv = await import("./food-inventory");
const { processFoodPosOrder, getFoodLowStockItems, getFoodMenuForPos } = await import("@/lib/food");
const { purgePosSales } = await import("@/lib/food-purge");

describe("inventario por sucursal", () => {
  let org: { id: string };
  let other: { id: string };
  let owner: { id: string };
  let viewer: { id: string };
  let centro: { id: string };
  let foreign: { id: string };
  let queso: { id: string };
  let variantId: string;
  const as = (u: { id: string }, role: "OWNER" | "VIEWER") => authMock.mockResolvedValue(fakeSession({ id: u.id, role, organizationId: org.id }));
  const principal = async () => Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: queso.id } })).currentStock);
  const branchQty = async (branchId: string) => Number((await prisma.branchStock.findUnique({ where: { branchId_inventoryItemId: { branchId, inventoryItemId: queso.id } } }))?.currentStock ?? 0);
  const sale = (extra: Record<string, unknown> = {}, qty = 1) => ({ grossAmount: qty * 100, netAmount: (qty * 100) / 1.16, items: [{ variantId, quantity: qty }], ...extra });

  beforeAll(async () => {
    org = await createTestOrg("Inv Branch Org");
    other = await createTestOrg("Inv Branch Other");
    owner = await createTestUser(org.id, "OWNER", "ib-owner");
    viewer = await createTestUser(org.id, "VIEWER", "ib-viewer");
    for (const o of [org, other]) await prisma.organizationModule.create({ data: { organizationId: o.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    centro = await prisma.branch.create({ data: { organizationId: org.id, name: "Centro" } });
    foreign = await prisma.branch.create({ data: { organizationId: other.id, name: "Ajena" } });
    queso = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Queso", unit: "kg", unitCost: 100, currentStock: 50, minStock: 5 } });
    const dish = await prisma.foodDish.create({
      data: { organizationId: org.id, name: "Quesadilla", variants: { create: [{ organizationId: org.id, label: "Único", price: 100, ingredients: { create: [{ inventoryItemId: queso.id, quantity: 0.5 }] } }] } },
      include: { variants: true },
    });
    variantId = dish.variants[0].id;
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });

  it("apagado, una venta de una sucursal descuenta del inventario general", async () => {
    await processFoodPosOrder(sale({ orderId: "A", branchId: centro.id }), org.id);
    expect(await principal()).toBe(49.5);
    expect(await prisma.branchStock.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("encendido, la venta descuenta de la sucursal que vendió y la Principal no se toca", async () => {
    as(owner, "OWNER");
    await setInventoryPerBranch(true);
    await processFoodPosOrder(sale({ orderId: "B", branchId: centro.id }, 2), org.id);
    expect(await principal()).toBe(49.5);
    expect(await branchQty(centro.id)).toBe(-1); // empieza en 0 y puede quedar negativa
    const mv = await prisma.foodInventoryMovement.findFirstOrThrow({ where: { organizationId: org.id, branchId: centro.id, type: "SALE" } });
    expect(Number(mv.stockAfter)).toBe(-1);
    expect((await prisma.foodRecipeUsage.findFirstOrThrow({ where: { organizationId: org.id, branchId: centro.id } })).units.toString()).toBe("2");
    // Una venta sin sucursal sigue contra la Principal.
    await processFoodPosOrder(sale({ orderId: "C" }), org.id);
    expect(await principal()).toBe(49);
  });

  it("la cancelación devuelve a la sucursal de la venta original", async () => {
    await processFoodPosOrder(sale({ orderId: "B" }, -2), org.id);
    expect(await branchQty(centro.id)).toBe(0);
    expect(await principal()).toBe(49);
  });

  it("conteo, ajuste rápido, compra y anulación se aplican a la sucursal elegida", async () => {
    as(owner, "OWNER");
    await inv.adjustFoodInventoryStock(queso.id, { countedStock: 10, branchId: centro.id });
    expect(await branchQty(centro.id)).toBe(10);
    expect(await principal()).toBe(49);

    await inv.recordInventoryAdjustment({ kind: "waste", lines: [{ itemId: queso.id, quantity: 1 }], note: "merma", branchId: centro.id });
    expect(await branchQty(centro.id)).toBe(9);

    const { id } = await inv.createFoodPurchase({ supplierId: null, purchasedAt: new Date().toISOString(), branchId: centro.id, items: [{ inventoryItemId: queso.id, quantity: 5, unitCost: 120 }] });
    expect(await branchQty(centro.id)).toBe(14);
    expect(await principal()).toBe(49);
    expect((await prisma.foodPurchase.findUniqueOrThrow({ where: { id } })).branchId).toBe(centro.id);

    await inv.voidFoodPurchase(id, "error");
    expect(await branchQty(centro.id)).toBe(9); // la anulación regresa a la MISMA sucursal
    expect(await principal()).toBe(49);
  });

  it("una sucursal de otra organización cae en el inventario general (no se acepta)", async () => {
    as(owner, "OWNER");
    await inv.adjustFoodInventoryStock(queso.id, { countedStock: 40, branchId: foreign.id });
    expect(await principal()).toBe(40);
    expect(await prisma.branchStock.count({ where: { branchId: foreign.id } })).toBe(0);
    await inv.adjustFoodInventoryStock(queso.id, { countedStock: 49 });
  });

  it("traspaso: sale de una y entra a la otra; valida origen/destino, permisos y el interruptor", async () => {
    as(owner, "OWNER");
    await inv.transferInventoryBetweenBranches({ fromBranchId: null, toBranchId: centro.id, lines: [{ itemId: queso.id, quantity: 4 }], note: "reposición" });
    expect(await principal()).toBe(45);
    expect(await branchQty(centro.id)).toBe(13);
    const moves = await prisma.foodInventoryMovement.findMany({ where: { organizationId: org.id, type: "TRANSFER" } });
    expect(moves).toHaveLength(2);
    expect(new Set(moves.map((m) => m.batchId)).size).toBe(1);
    expect(moves.map((m) => Number(m.quantity)).sort((a, b) => a - b)).toEqual([-4, 4]);

    await expect(inv.transferInventoryBetweenBranches({ fromBranchId: centro.id, toBranchId: centro.id, lines: [{ itemId: queso.id, quantity: 1 }] })).rejects.toThrow();
    await expect(inv.transferInventoryBetweenBranches({ fromBranchId: null, toBranchId: foreign.id, lines: [{ itemId: queso.id, quantity: 1 }] })).rejects.toThrow();
    as(viewer, "VIEWER");
    await expect(inv.transferInventoryBetweenBranches({ fromBranchId: null, toBranchId: centro.id, lines: [{ itemId: queso.id, quantity: 1 }] })).rejects.toThrow();
    await expect(setInventoryPerBranch(false)).rejects.toThrow();
  });

  it("avisos de stock bajo y estado del menú del POS usan la existencia de la sucursal", async () => {
    await prisma.branchStock.update({ where: { branchId_inventoryItemId: { branchId: centro.id, inventoryItemId: queso.id } }, data: { currentStock: 2 } });
    expect((await getFoodLowStockItems(org.id, 10)).map((i) => i.name)).toEqual([]); // Principal: 45 > mínimo 5
    expect((await getFoodLowStockItems(org.id, 10, centro.id)).map((i) => i.name)).toEqual(["Queso"]); // Centro: 2 ≤ 5
    const status = async (branch: string | null) => (await getFoodMenuForPos(org.id, branch))[0].variants[0].stockStatus;
    expect(await status(null)).toBe("ok");
    expect(await status(centro.id)).toBe("low");
    await prisma.branchStock.update({ where: { branchId_inventoryItemId: { branchId: centro.id, inventoryItemId: queso.id } }, data: { currentStock: 0 } });
    expect(await status(centro.id)).toBe("out");
  });

  it("recalcular recetas y borrar ventas de prueba regresan a la sucursal de cada venta", async () => {
    as(owner, "OWNER");
    await prisma.branchStock.update({ where: { branchId_inventoryItemId: { branchId: centro.id, inventoryItemId: queso.id } }, data: { currentStock: 10 } });
    await processFoodPosOrder(sale({ orderId: "R" }, 2), org.id); // Principal: -1
    await processFoodPosOrder(sale({ orderId: "S", branchId: centro.id }, 4), org.id); // Centro: -2
    const p0 = await principal();
    const c0 = await branchQty(centro.id);
    // Cambia la receta a 1 kg por porción y recalcula: cada sucursal corrige SOLO lo suyo.
    await prisma.foodDishVariantIngredient.updateMany({ where: { variantId }, data: { quantity: 1 } });
    await inv.recalculateFoodRecipeUsage(new Date(Date.now() - 3600_000).toISOString());
    expect(await principal()).toBeLessThan(p0);
    expect(await branchQty(centro.id)).toBeLessThan(c0);
    const day = localDateString(new Date(), await getOrgTimezone(org.id));
    const beforePurge = { p: await principal(), c: await branchQty(centro.id) };
    await purgePosSales(org.id, day, day);
    expect(await principal()).toBeGreaterThan(beforePurge.p);
    expect(await branchQty(centro.id)).toBeGreaterThan(beforePurge.c);
  });
});
