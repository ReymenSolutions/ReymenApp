import { prisma } from "./prisma";
import { rebuildCustomerStats } from "./customers";

/**
 * Borra ventas del POS de un rango de días -- pensado para limpiar las
 * ventas de prueba de un negocio antes de arrancar. Deshace exactamente lo
 * que hizo cada venta al llegar (processFoodPosOrder):
 *   - regresa al inventario lo que descontó su receta (FoodRecipeUsage.applied,
 *     que ya incluye cualquier recálculo posterior),
 *   - resta sus unidades de los conteos de platillos y modificadores del día,
 *   - borra la venta, sus movimientos de inventario y su registro de receta.
 * Las ventas capturadas a mano (source MANUAL) no se tocan.
 */

export interface PosSalesPurgeSummary {
  sales: number;
  grossAmount: number;
  units: number;
  inventoryItems: number;
  firstAt: string | null;
  lastAt: string | null;
  /** Platillos que hoy cuentan como vendidos en esas fechas ("Platillos más vendidos"). */
  recordedUnits: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

/** Mismo "día de negocio" que el webhook del POS (medianoche, hora del servidor). */
function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parseDay(day: string): Date {
  if (!DAY_RE.test(day)) throw new Error("Fecha inválida");
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) throw new Error("Fecha inválida");
  return date;
}

/** [desde 00:00, día siguiente a "hasta" 00:00), ambos días incluidos. */
export function purgeRange(from: string, to: string): { gte: Date; lt: Date } {
  const gte = parseDay(from);
  const last = parseDay(to);
  if (last < gte) throw new Error("La fecha final es anterior a la inicial");
  const lt = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
  if ((lt.getTime() - gte.getTime()) / 86_400_000 > MAX_DAYS) throw new Error("El rango no puede ser mayor a un año");
  return { gte, lt };
}

type Db = Pick<typeof prisma, "foodSale" | "foodRecipeUsage" | "foodDishSale">;

async function collect(db: Db, organizationId: string, range: { gte: Date; lt: Date }) {
  const sales = await db.foodSale.findMany({
    where: { organizationId, source: "POS", occurredAt: range },
    select: { id: true, grossAmount: true, occurredAt: true, customerId: true },
    orderBy: { occurredAt: "asc" },
  });
  const usages = sales.length
    ? await db.foodRecipeUsage.findMany({
        where: { organizationId, foodSaleId: { in: sales.map((s) => s.id) } },
        select: { id: true, variantId: true, modifierOptionId: true, units: true, occurredAt: true, applied: true, branchId: true },
      })
    : [];
  // Lo que regresa al inventario, por sucursal de la que salió ("" = Principal): clave "sucursal|insumo".
  const stockBack = new Map<string, number>();
  for (const u of usages) {
    for (const [itemId, used] of Object.entries((u.applied ?? {}) as Record<string, number>)) {
      const key = `${u.branchId ?? ""}|${itemId}`;
      stockBack.set(key, (stockBack.get(key) ?? 0) + Number(used));
    }
  }
  const recorded = await db.foodDishSale.aggregate({ where: { organizationId, occurredAt: range }, _sum: { quantity: true } });
  const summary: PosSalesPurgeSummary = {
    sales: sales.length,
    grossAmount: Math.round(sales.reduce((n, s) => n + Number(s.grossAmount), 0) * 100) / 100,
    units: usages.filter((u) => u.variantId).reduce((n, u) => n + Number(u.units), 0),
    inventoryItems: new Set([...stockBack].filter(([, v]) => Math.round(v * 1000) !== 0).map(([k]) => k.split("|")[1])).size,
    firstAt: sales[0]?.occurredAt.toISOString() ?? null,
    lastAt: sales.at(-1)?.occurredAt.toISOString() ?? null,
    recordedUnits: recorded._sum.quantity ?? 0,
  };
  return { sales, usages, stockBack, summary };
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Platillos y modificadores vendidos por día en el rango, recalculados desde
 * las ventas del POS que quedan (FoodRecipeUsage). Así no queda ningún conteo
 * sin su venta, aunque venga de antes o de un rango anterior mal elegido.
 */
async function rebuildDailyCounts(tx: Tx, organizationId: string, range: { gte: Date; lt: Date }) {
  await tx.foodDishSale.deleteMany({ where: { organizationId, occurredAt: range } });
  await tx.foodModifierOptionSale.deleteMany({ where: { organizationId, occurredAt: range } });
  const usages = await tx.foodRecipeUsage.findMany({
    where: { organizationId, foodSaleId: { not: null }, occurredAt: range },
    select: { variantId: true, modifierOptionId: true, units: true, occurredAt: true },
  });
  const dishes = new Map<string, { variantId: string; day: Date; quantity: number }>();
  const options = new Map<string, { optionId: string; day: Date; quantity: number }>();
  for (const u of usages) {
    const day = startOfDay(u.occurredAt);
    const units = Number(u.units);
    if (u.variantId) {
      const key = `${day.getTime()}|${u.variantId}`;
      const cur = dishes.get(key) ?? { variantId: u.variantId, day, quantity: 0 };
      cur.quantity += units;
      dishes.set(key, cur);
    } else if (u.modifierOptionId) {
      const key = `${day.getTime()}|${u.modifierOptionId}`;
      const cur = options.get(key) ?? { optionId: u.modifierOptionId, day, quantity: 0 };
      cur.quantity += units;
      options.set(key, cur);
    }
  }
  const dishRows = [...dishes.values()].filter((d) => Math.round(d.quantity) !== 0);
  if (dishRows.length) {
    await tx.foodDishSale.createMany({
      data: dishRows.map((d) => ({ organizationId, variantId: d.variantId, occurredAt: d.day, quantity: Math.round(d.quantity) })),
    });
  }
  const optionRows = [...options.values()].filter((o) => Math.round(o.quantity) !== 0);
  if (optionRows.length) {
    const names = new Map(
      (await tx.foodModifierOption.findMany({ where: { id: { in: optionRows.map((o) => o.optionId) } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]),
    );
    const data = optionRows
      .filter((o) => names.has(o.optionId))
      .map((o) => ({ organizationId, optionId: o.optionId, optionName: names.get(o.optionId)!, occurredAt: o.day, quantity: Math.round(o.quantity) }));
    if (data.length) await tx.foodModifierOptionSale.createMany({ data });
  }
}

export async function previewPosSalesPurge(organizationId: string, from: string, to: string): Promise<PosSalesPurgeSummary> {
  return (await collect(prisma, organizationId, purgeRange(from, to))).summary;
}

export async function purgePosSales(organizationId: string, from: string, to: string): Promise<PosSalesPurgeSummary> {
  const range = purgeRange(from, to);
  return prisma.$transaction(
    async (tx) => {
      const { sales, usages, stockBack, summary } = await collect(tx, organizationId, range);
      // Con Reymen POS los platillos vendidos solo vienen del POS (la captura
      // manual está bloqueada), así que se pueden recalcular desde sus ventas.
      const usesPos = !!(await tx.organizationModule.findFirst({ where: { organizationId, module: "REYMEN_POS", status: "ACTIVE" }, select: { id: true } }));
      if (sales.length === 0 && !(usesPos && summary.recordedUnits !== 0)) return summary;
      const saleIds = sales.map((s) => s.id);

      for (const [key, qty] of stockBack) {
        const rounded = Math.round(qty * 1000) / 1000;
        if (rounded === 0) continue;
        const [branchId, inventoryItemId] = key.split("|");
        // updateMany: un insumo borrado después de la venta simplemente no está.
        if (branchId) {
          await tx.branchStock.updateMany({ where: { branchId, inventoryItemId, organizationId }, data: { currentStock: { increment: rounded } } });
        } else {
          await tx.foodInventoryItem.updateMany({ where: { id: inventoryItemId, organizationId }, data: { currentStock: { increment: rounded } } });
        }
      }

      if (!usesPos) {
        const touchedDays = new Set<number>();
        for (const u of usages) {
          const units = Math.round(Number(u.units));
          if (units === 0) continue;
          const occurredAt = startOfDay(u.occurredAt);
          touchedDays.add(occurredAt.getTime());
          if (u.variantId) {
            await tx.foodDishSale.updateMany({ where: { organizationId, variantId: u.variantId, occurredAt }, data: { quantity: { decrement: units } } });
          } else if (u.modifierOptionId) {
            await tx.foodModifierOptionSale.updateMany({
              where: { organizationId, optionId: u.modifierOptionId, occurredAt },
              data: { quantity: { decrement: units } },
            });
          }
        }
        // Un día que solo tuvo ventas de prueba queda en 0: sin fila.
        const days = [...touchedDays].map((t) => new Date(t));
        if (days.length) {
          await tx.foodDishSale.deleteMany({ where: { organizationId, occurredAt: { in: days }, quantity: 0 } });
          await tx.foodModifierOptionSale.deleteMany({ where: { organizationId, occurredAt: { in: days }, quantity: 0 } });
        }
      }

      await tx.foodInventoryMovement.deleteMany({ where: { organizationId, foodSaleId: { in: saleIds } } });
      await tx.foodRecipeUsage.deleteMany({ where: { organizationId, foodSaleId: { in: saleIds } } });
      await tx.foodSale.deleteMany({ where: { organizationId, id: { in: saleIds } } });
      // Las visitas y el gasto de los clientes de esas ventas se recalculan con lo que queda.
      await rebuildCustomerStats(tx, organizationId, sales.flatMap((s) => (s.customerId ? [s.customerId] : [])));
      if (usesPos) await rebuildDailyCounts(tx, organizationId, range);
      return summary;
    },
    { timeout: 60_000 },
  );
}
