import { prisma } from "@/lib/prisma";
import { getFoodLowStockItems } from "@/lib/food";
import { stockLevel } from "@/lib/food-inventory";

// ── Reporte ejecutivo diario ─────────────────────────────────────────────────
// Reymen arma el JSON (ventas, comparativos, top productos, cancelaciones, stock crítico y merma);
// el correo o n8n solo lo formatean y entregan.

/** Instante UTC de la medianoche local de `dateStr` (YYYY-MM-DD) en la zona `timezone`. */
export function zonedDayStart(dateStr: string, timezone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - ms;
  };
  // Dos pasadas: la segunda corrige el desfase si la medianoche cae al otro lado de un cambio de horario.
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

/** Fecha local (YYYY-MM-DD) de un instante en la zona dada. */
export function localDateString(date: Date, timezone: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return p; // en-CA formatea YYYY-MM-DD
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type DayTotals = { gross: number; net: number; tickets: number; avgTicket: number; cancellations: number; cancelledAmount: number };
export type DailyReport = {
  date: string;
  timezone: string;
  today: DayTotals;
  previousDay: DayTotals;
  sameWeekdayLastWeek: DayTotals;
  /** Variación porcentual de las ventas brutas frente al día anterior / a la semana pasada (null si no había base). */
  vsPreviousDayPct: number | null;
  vsLastWeekPct: number | null;
  topProducts: { name: string; quantity: number }[];
  criticalStock: { name: string; unit: string; currentStock: number; minStock: number }[];
  lowStockCount: number;
  waste: { name: string; unit: string; quantity: number }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
export const pctChange = (now: number, base: number): number | null => (base > 0 ? Math.round(((now - base) / base) * 1000) / 10 : null);

async function dayTotals(organizationId: string, start: Date, end: Date): Promise<DayTotals> {
  const sales = await prisma.foodSale.findMany({ where: { organizationId, occurredAt: { gte: start, lt: end } }, select: { grossAmount: true, netAmount: true } });
  let gross = 0, net = 0, tickets = 0, cancellations = 0, cancelledAmount = 0;
  for (const s of sales) {
    const g = Number(s.grossAmount);
    if (g < 0) {
      // Las cancelaciones llegan como una venta en negativo.
      cancellations++;
      cancelledAmount += Math.abs(g);
    } else {
      tickets++;
      gross += g;
      net += Number(s.netAmount);
    }
  }
  return { gross: round2(gross), net: round2(net), tickets, avgTicket: tickets ? round2(gross / tickets) : 0, cancellations, cancelledAmount: round2(cancelledAmount) };
}

/** Arma el reporte del día local `date` de una organización. */
export async function buildDailyReport(organizationId: string, date: string, timezone: string): Promise<DailyReport> {
  const start = zonedDayStart(date, timezone);
  const end = zonedDayStart(addDays(date, 1), timezone);
  const prevStart = zonedDayStart(addDays(date, -1), timezone);
  const weekStart = zonedDayStart(addDays(date, -7), timezone);
  const weekEnd = zonedDayStart(addDays(date, -6), timezone);

  const [today, previousDay, sameWeekdayLastWeek, dishSales, lowStock, wasteMoves] = await Promise.all([
    dayTotals(organizationId, start, end),
    dayTotals(organizationId, prevStart, start),
    dayTotals(organizationId, weekStart, weekEnd),
    prisma.foodDishSale.groupBy({ by: ["variantId"], where: { organizationId, occurredAt: { gte: start, lt: end } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
    getFoodLowStockItems(organizationId, 50),
    prisma.foodInventoryMovement.groupBy({ by: ["inventoryItemId"], where: { organizationId, type: "WASTE", createdAt: { gte: start, lt: end } }, _sum: { quantity: true } }),
  ]);

  const variants = dishSales.length ? await prisma.foodDishVariant.findMany({ where: { id: { in: dishSales.map((d) => d.variantId) }, organizationId }, select: { id: true, label: true, dish: { select: { name: true } } } }) : [];
  const variantName = new Map(variants.map((v) => [v.id, v.label && v.label !== "Único" ? `${v.dish.name} (${v.label})` : v.dish.name]));
  const wasteItems = wasteMoves.length ? await prisma.foodInventoryItem.findMany({ where: { id: { in: wasteMoves.map((w) => w.inventoryItemId) }, organizationId }, select: { id: true, name: true, unit: true } }) : [];
  const itemInfo = new Map(wasteItems.map((i) => [i.id, i]));

  return {
    date,
    timezone,
    today,
    previousDay,
    sameWeekdayLastWeek,
    vsPreviousDayPct: pctChange(today.gross, previousDay.gross),
    vsLastWeekPct: pctChange(today.gross, sameWeekdayLastWeek.gross),
    topProducts: dishSales.map((d) => ({ name: variantName.get(d.variantId) ?? "Platillo", quantity: d._sum.quantity ?? 0 })),
    criticalStock: lowStock.filter((i) => stockLevel(i.currentStock, i.minStock) === "critical").slice(0, 5).map((i) => ({ name: i.name, unit: i.unit, currentStock: i.currentStock, minStock: i.minStock })),
    lowStockCount: lowStock.length,
    waste: wasteMoves
      .map((w) => ({ name: itemInfo.get(w.inventoryItemId)?.name ?? "Insumo", unit: itemInfo.get(w.inventoryItemId)?.unit ?? "", quantity: Math.abs(Number(w._sum.quantity ?? 0)) }))
      .filter((w) => w.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 3),
  };
}
