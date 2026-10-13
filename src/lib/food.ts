import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { applyPosOrderLoyalty, auditPosLoyalty, parsePosLoyalty, posLoyaltyEnabled, type PosLoyaltyResult } from "./loyalty/pos";
import { hasModule } from "./modules";
import { consumeRecipes, effectiveStockBranch } from "./food-inventory";
import { branchWhere, type BranchFilter } from "./branches";
import { emitDomainEvent } from "./domain-events";
import { parsePosCustomer, upsertCustomer, applySaleToCustomer } from "./customers";

// ─── FOOD OPS — agregados de Ventas ──────────────────────────────────
// Compartido entre /portal/food (resumen) y /portal/food/sales
// (detalle) -- mismo cálculo, no dos copias. Decimal de Prisma se
// convierte a number aquí, una sola vez, para que ninguna página tenga
// que acordarse de hacerlo.

export interface FoodSalesSummary {
  today: { gross: number; net: number; count: number };
  yesterday: { gross: number; net: number; count: number };
  last7Days: { gross: number; net: number; count: number };
  last30Days: { gross: number; net: number; count: number };
  previous30Days: { gross: number; net: number; count: number };
  monthOverMonthGrossPct: number | null;
  // Mismo criterio que monthOverMonthGrossPct (30 días vs. los 30 previos),
  // agregado 2026-09-21 para el resumen del dashboard de restaurante — no
  // dispara ninguna consulta nueva, solo deriva de last30Days/previous30Days
  // que ya se traían.
  monthOverMonthOrdersPct: number | null;
  monthOverMonthTicketPct: number | null;
  // "vs ayer" -- comparación día contra día, agregada 2026-09-21 para los
  // KPIs superiores del dashboard (el mockup de referencia del cliente pide
  // "vs ayer" ahí, no "vs 30 días previos"). Un día es una muestra chica y
  // ruidosa, pero es la comparación real que se pidió, no una inventada.
  vsYesterdayGrossPct: number | null;
  vsYesterdayOrdersPct: number | null;
  vsYesterdayTicketPct: number | null;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

async function sumRange(organizationId: string, from: Date, to?: Date, branch?: BranchFilter) {
  const result = await prisma.foodSale.aggregate({
    where: {
      organizationId,
      ...branchWhere(branch),
      occurredAt: to ? { gte: from, lt: to } : { gte: from },
    },
    _sum: { grossAmount: true, netAmount: true },
    _count: { _all: true },
  });

  return {
    gross: Number(result._sum.grossAmount ?? 0),
    net: Number(result._sum.netAmount ?? 0),
    count: result._count._all,
  };
}

export async function getFoodSalesSummary(organizationId: string, branch?: BranchFilter): Promise<FoodSalesSummary> {
  const [today, yesterday, last7Days, last30Days, previous30Days] = await Promise.all([
    sumRange(organizationId, startOfDay(new Date()), undefined, branch),
    sumRange(organizationId, daysAgo(1), startOfDay(new Date()), branch),
    sumRange(organizationId, daysAgo(7), undefined, branch),
    sumRange(organizationId, daysAgo(30), undefined, branch),
    sumRange(organizationId, daysAgo(60), daysAgo(30), branch),
  ]);

  const pctChange = (curr: number, prev: number): number | null =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null;

  const monthOverMonthGrossPct = pctChange(last30Days.gross, previous30Days.gross);
  const monthOverMonthOrdersPct = pctChange(last30Days.count, previous30Days.count);
  const ticket30 = last30Days.count > 0 ? last30Days.gross / last30Days.count : 0;
  const ticketPrev30 = previous30Days.count > 0 ? previous30Days.gross / previous30Days.count : 0;
  const monthOverMonthTicketPct = pctChange(ticket30, ticketPrev30);

  const vsYesterdayGrossPct = pctChange(today.gross, yesterday.gross);
  const vsYesterdayOrdersPct = pctChange(today.count, yesterday.count);
  const ticketToday = today.count > 0 ? today.gross / today.count : 0;
  const ticketYesterday = yesterday.count > 0 ? yesterday.gross / yesterday.count : 0;
  const vsYesterdayTicketPct = pctChange(ticketToday, ticketYesterday);

  return {
    today,
    yesterday,
    last7Days,
    last30Days,
    previous30Days,
    monthOverMonthGrossPct,
    monthOverMonthOrdersPct,
    monthOverMonthTicketPct,
    vsYesterdayGrossPct,
    vsYesterdayOrdersPct,
    vsYesterdayTicketPct,
  };
}

export interface FoodSalesByChannel {
  /** null = venta sin canal; la página pone el texto en el idioma del usuario. */
  channel: string | null;
  gross: number;
  count: number;
}

export async function getFoodSalesByChannel(organizationId: string, branch?: BranchFilter): Promise<FoodSalesByChannel[]> {
  const rows = await prisma.foodSale.groupBy({
    by: ["channel"],
    where: { organizationId, ...branchWhere(branch), occurredAt: { gte: daysAgo(30) } },
    _sum: { grossAmount: true },
    _count: { _all: true },
  });

  return rows
    .map((r) => ({
      channel: r.channel,
      gross: Number(r._sum.grossAmount ?? 0),
      count: r._count._all,
    }))
    .sort((a, b) => b.gross - a.gross);
}

// ─── FOOD OPS — ventas por hora (dashboard) ──────────────────────────
// Sin GROUP BY portable por hora en Prisma sobre Postgres sin SQL crudo,
// así que se trae el día completo (siempre acotado a un solo día, volumen
// bajo) y se agrega por hora en JS — mismo criterio que
// getCompanyCardStats en smartcard-company.ts para el desglose por tipo.

export interface FoodHourlyBucket {
  hour: number; // 0-23, hora local del servidor (mismo criterio que startOfDay/daysAgo arriba)
  gross: number;
  count: number;
}

export async function getFoodHourlySales(organizationId: string, branch?: BranchFilter): Promise<FoodHourlyBucket[]> {
  const sales = await prisma.foodSale.findMany({
    where: { organizationId, ...branchWhere(branch), occurredAt: { gte: startOfDay(new Date()) } },
    select: { occurredAt: true, grossAmount: true },
  });

  const buckets = new Map<number, { gross: number; count: number }>();
  for (const sale of sales) {
    const hour = sale.occurredAt.getHours();
    const entry = buckets.get(hour) ?? { gross: 0, count: 0 };
    entry.gross += Number(sale.grossAmount);
    entry.count += 1;
    buckets.set(hour, entry);
  }

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    gross: buckets.get(hour)?.gross ?? 0,
    count: buckets.get(hour)?.count ?? 0,
  }));
}

// ─── FOOD OPS — insumos con stock bajo (dashboard) ───────────────────
// Prisma no compara dos columnas de la misma tabla directo en `where`, así
// que se filtra en JS -- mismo criterio ya usado en
// portal/food/inventory/page.tsx (no se duplica la query completa de esa
// página, solo su misma regla de negocio, aquí acotada a los más urgentes).

export interface FoodLowStockEntry {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
}

/**
 * Existencias de una sucursal por insumo, o null cuando la lectura es la general (un solo
 * inventario, la Principal, o "inventario por sucursal" apagado). Sin fila = 0.
 */
export async function branchStockMap(organizationId: string, branchId: string | null | undefined): Promise<Map<string, number> | null> {
  const branch = await effectiveStockBranch(organizationId, branchId);
  if (!branch) return null;
  const rows = await prisma.branchStock.findMany({ where: { organizationId, branchId: branch }, select: { inventoryItemId: true, currentStock: true } });
  return new Map(rows.map((r) => [r.inventoryItemId, Number(r.currentStock)]));
}

/** Insumos en o bajo su mínimo; con `branchId` y "inventario por sucursal" encendido, con la existencia de esa sucursal. */
export async function getFoodLowStockItems(organizationId: string, limit = 5, branchId?: string | null): Promise<FoodLowStockEntry[]> {
  const [items, perBranch] = await Promise.all([
    prisma.foodInventoryItem.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, unit: true, currentStock: true, minStock: true },
    }),
    branchStockMap(organizationId, branchId),
  ]);

  return items
    .map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      currentStock: perBranch ? (perBranch.get(i.id) ?? 0) : Number(i.currentStock),
      minStock: Number(i.minStock),
    }))
    .filter((i) => i.currentStock <= i.minStock)
    // Más urgente primero: el que está más por debajo de su propio mínimo
    // (en términos relativos, no absolutos, para no sesgar por unidad).
    .sort((a, b) => a.currentStock / Math.max(a.minStock, 1) - b.currentStock / Math.max(b.minStock, 1))
    .slice(0, limit);
}

// ─── FOOD OPS — ventas por día (sparklines del dashboard) ────────────
// Mismo criterio que getFoodHourlySales (se trae el rango completo y se
// agrega en JS), pero por día en vez de por hora -- agregado 2026-09-21
// específicamente para alimentar los mini-sparklines de los KPIs
// superiores con una serie real de los últimos N días, no inventada.

export interface FoodDailyBucket {
  date: string; // YYYY-MM-DD, hora local del servidor (mismo criterio que el resto del archivo)
  gross: number;
  count: number;
}

export async function getFoodDailySales(organizationId: string, days = 7, branch?: BranchFilter): Promise<FoodDailyBucket[]> {
  const from = daysAgo(days - 1);
  const sales = await prisma.foodSale.findMany({
    where: { organizationId, ...branchWhere(branch), occurredAt: { gte: from } },
    select: { occurredAt: true, grossAmount: true },
  });

  const toKey = (d: Date) => startOfDay(d).toISOString().slice(0, 10);

  const buckets = new Map<string, { gross: number; count: number }>();
  for (const sale of sales) {
    const key = toKey(sale.occurredAt);
    const entry = buckets.get(key) ?? { gross: 0, count: 0 };
    entry.gross += Number(sale.grossAmount);
    entry.count += 1;
    buckets.set(key, entry);
  }

  return Array.from({ length: days }, (_, i) => {
    const key = toKey(daysAgo(days - 1 - i));
    return { date: key, gross: buckets.get(key)?.gross ?? 0, count: buckets.get(key)?.count ?? 0 };
  });
}

// ─── FOOD OPS — Platillos, variantes y costeo (Fase 2: Rentabilidad) ─
// Un FoodDish es el producto de menú ("Berry Bloom"); cada FoodDishVariant
// es una presentación vendible con su propio precio y su propia receta
// ("Chico"/"Grande", o DEFAULT_VARIANT_LABEL si el platillo no maneja
// tamaños). getFoodDishesWithCost() es la fuente única del costo por
// variante — todo lo demás en este bloque (punto de equilibrio, utilidad
// neta, insights, recomendaciones) llama a esta función (vía
// flattenVariants) en vez de recalcular el costo por su cuenta.

export const DEFAULT_VARIANT_LABEL = "Único";

export interface FoodDishIngredientLine {
  inventoryItemId: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
}

export interface FoodDishVariantWithCost {
  id: string;
  dishId: string;
  label: string;
  price: number;
  cost: number;
  marginAmount: number;
  // null solo si price es 0 (el formulario exige > 0, pero una variante
  // desactivada hace tiempo podría tener datos viejos) -- se evita dividir
  // entre cero en vez de mostrar un porcentaje sin sentido.
  marginPct: number | null;
  ingredients: FoodDishIngredientLine[];
  /** false solo si se pidieron las desactivadas (includeInactiveVariants). */
  isActive: boolean;
  // "Berry Bloom — Grande", o solo "Café Americano" cuando el platillo
  // tiene una única variante con el label por defecto -- para no mostrar
  // "Café Americano — Único" en ningún lado de la UI.
  displayName: string;
}

export interface FoodDishWithCost {
  id: string;
  name: string;
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
  modifierGroupIds: string[];
  variants: FoodDishVariantWithCost[];
}

export async function getFoodDishesWithCost(
  organizationId: string,
  opts: {
    activeOnly?: boolean;
    /** Incluye variantes desactivadas: para costear o nombrar ventas que ya ocurrieron. */
    includeInactiveVariants?: boolean;
  } = {}
): Promise<FoodDishWithCost[]> {
  const dishes = await prisma.foodDish.findMany({
    where: { organizationId, ...(opts.activeOnly ? { isActive: true } : {}) },
    include: {
      category: { select: { id: true, name: true } },
      modifierGroups: { select: { groupId: true } },
      variants: {
        where: opts.includeInactiveVariants ? {} : { isActive: true },
        include: {
          ingredients: {
            include: { inventoryItem: { select: { name: true, unit: true, unitCost: true } } },
          },
        },
        orderBy: { label: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return dishes.map((d) => {
    const activeVariants = d.variants.filter((v) => v.isActive);
    const singleDefaultVariant = activeVariants.length === 1 && activeVariants[0].label === DEFAULT_VARIANT_LABEL;
    const variants: FoodDishVariantWithCost[] = d.variants.map((v) => {
      const ingredients: FoodDishIngredientLine[] = v.ingredients.map((i) => {
        const unitCost = Number(i.inventoryItem.unitCost ?? 0);
        const quantity = Number(i.quantity);
        return {
          inventoryItemId: i.inventoryItemId,
          name: i.inventoryItem.name,
          unit: i.inventoryItem.unit,
          quantity,
          unitCost,
          lineCost: Math.round(unitCost * quantity * 100) / 100,
        };
      });
      const cost = Math.round(ingredients.reduce((sum, i) => sum + i.lineCost, 0) * 100) / 100;
      const price = Number(v.price);
      const marginAmount = Math.round((price - cost) * 100) / 100;
      const marginPct = price > 0 ? Math.round((marginAmount / price) * 1000) / 10 : null;
      return {
        id: v.id,
        dishId: d.id,
        label: v.label,
        price,
        cost,
        marginAmount,
        marginPct,
        ingredients,
        isActive: v.isActive,
        displayName: singleDefaultVariant ? d.name : `${d.name} — ${v.label}`,
      };
    });
    return {
      id: d.id,
      name: d.name,
      isActive: d.isActive,
      categoryId: d.category?.id ?? null,
      categoryName: d.category?.name ?? null,
      modifierGroupIds: d.modifierGroups.map((m) => m.groupId),
      variants,
    };
  });
}

/** Aplana platillos→variantes en una sola lista — la unidad real de precio/costo/venta. */
export function flattenVariants(dishes: FoodDishWithCost[]): FoodDishVariantWithCost[] {
  return dishes.flatMap((d) => d.variants);
}

// ─── FOOD OPS — Menú para consumo externo (POS u otros integradores) ──
// Proyección liviana (sin costo/ingredientes) pensada para un futuro POS:
// solo lo que necesita para vender y para mapear su catálogo al nuestro
// vía externalPosId. No reutiliza getFoodDishesWithCost() a propósito --
// ese trae el join de insumos completo, que un consumidor de menú no
// necesita.

/**
 * Aviso de inventario para el POS, calculado con la receta: "out" si algún
 * insumo que usa está en 0 o menos, "low" si alguno está en o bajo su
 * mínimo, "ok" si no; null si no tiene receta. Es solo un aviso: el
 * inventario del sistema puede ir desfasado del real, así que nunca bloquea.
 */
export type FoodStockStatus = "ok" | "low" | "out" | null;

type StockLine = { quantity: Prisma.Decimal; inventoryItemId?: string; inventoryItem: { currentStock: Prisma.Decimal | number; minStock: Prisma.Decimal } };

export function stockStatusFor(lines: StockLine[], branchStock?: ReadonlyMap<string, number> | null): FoodStockStatus {
  // Solo cuenta lo que consume; una línea negativa ("Sin cebolla") no gasta.
  const used = lines.filter((l) => Number(l.quantity) > 0);
  if (used.length === 0) return null;
  // Con existencias por sucursal, cada línea usa la de la sucursal (sin fila = 0).
  const stockOf = (l: StockLine) => (branchStock && l.inventoryItemId ? (branchStock.get(l.inventoryItemId) ?? 0) : Number(l.inventoryItem.currentStock));
  if (used.some((l) => stockOf(l) <= 0)) return "out";
  if (used.some((l) => stockOf(l) <= Number(l.inventoryItem.minStock))) return "low";
  return "ok";
}

/** Estado del platillo completo: agotado solo si TODAS sus variantes con receta lo están. */
function dishStockStatus(statuses: FoodStockStatus[]): FoodStockStatus {
  const known = statuses.filter((st): st is Exclude<FoodStockStatus, null> => st !== null);
  if (known.length === 0) return null;
  if (known.every((st) => st === "out")) return "out";
  if (known.some((st) => st !== "ok")) return "low";
  return "ok";
}

export interface FoodMenuVariant {
  variantId: string;
  label: string;
  price: number;
  externalPosId: string | null;
  stockStatus: FoodStockStatus;
}

export interface FoodMenuModifierOption {
  optionId: string;
  name: string;
  priceDelta: number;
  stockStatus: FoodStockStatus;
}

export interface FoodMenuModifierGroup {
  groupId: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: FoodMenuModifierOption[];
}

export interface FoodMenuDish {
  dishId: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  stockStatus: FoodStockStatus;
  variants: FoodMenuVariant[];
  modifierGroups: FoodMenuModifierGroup[];
}

const STOCK_LINE_SELECT = {
  quantity: true,
  inventoryItemId: true,
  inventoryItem: { select: { currentStock: true, minStock: true } },
} as const;

/**
 * Menú que ve una caja del POS. Con "menú por sucursal" encendido y una sucursal activa de esta
 * organización, esa sucursal puede ocultar platillos y tener sus propios precios; la Principal
 * (branchId null) y las organizaciones con el interruptor apagado ven el menú base.
 */
export async function getFoodMenuForPos(organizationId: string, branchId: string | null = null): Promise<FoodMenuDish[]> {
  const branchStock = await branchStockMap(organizationId, branchId);
  const all = await getBaseFoodMenuForPos(organizationId, branchStock);
  if (!branchId) return all;
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { menuPerBranch: true } });
  if (!org?.menuPerBranch) return all;
  const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId, isActive: true }, select: { id: true } });
  if (!branch) return all;
  const [hidden, prices] = await Promise.all([
    prisma.branchDish.findMany({ where: { branchId, isActive: false }, select: { dishId: true } }),
    prisma.branchVariantPrice.findMany({ where: { branchId }, select: { variantId: true, price: true } }),
  ]);
  return applyBranchMenu(all, new Set(hidden.map((h) => h.dishId)), new Map(prices.map((p) => [p.variantId, Number(p.price)])));
}

/** Quita los platillos ocultos y cambia el precio de las variantes que la sucursal fijó. Pura. */
export function applyBranchMenu(dishes: FoodMenuDish[], hiddenDishIds: ReadonlySet<string>, priceByVariant: ReadonlyMap<string, number>): FoodMenuDish[] {
  return dishes
    .filter((d) => !hiddenDishIds.has(d.dishId))
    .map((d) => ({ ...d, variants: d.variants.map((v) => (priceByVariant.has(v.variantId) ? { ...v, price: priceByVariant.get(v.variantId)! } : v)) }));
}

async function getBaseFoodMenuForPos(organizationId: string, branchStock: ReadonlyMap<string, number> | null = null): Promise<FoodMenuDish[]> {
  const dishes = await prisma.foodDish.findMany({
    where: { organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      category: { select: { id: true, name: true } },
      variants: {
        where: { isActive: true },
        select: { id: true, label: true, price: true, externalPosId: true, ingredients: { select: STOCK_LINE_SELECT } },
        orderBy: { label: "asc" },
      },
      modifierGroups: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
              minSelect: true,
              maxSelect: true,
              sortOrder: true,
              options: {
                where: { isActive: true },
                select: { id: true, name: true, priceDelta: true, ingredients: { select: STOCK_LINE_SELECT } },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return dishes.map((d) => {
    const variants = d.variants.map((v) => ({
      variantId: v.id,
      label: v.label,
      price: Number(v.price),
      externalPosId: v.externalPosId,
      stockStatus: stockStatusFor(v.ingredients, branchStock),
    }));
    return {
      dishId: d.id,
      name: d.name,
      categoryId: d.category?.id ?? null,
      categoryName: d.category?.name ?? null,
      stockStatus: dishStockStatus(variants.map((v) => v.stockStatus)),
      variants,
      modifierGroups: d.modifierGroups
        .map((link) => link.group)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((g) => ({
          groupId: g.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.map((o) => ({
            optionId: o.id,
            name: o.name,
            priceDelta: Number(o.priceDelta),
            stockStatus: stockStatusFor(o.ingredients, branchStock),
          })),
        })),
    };
  });
}

export interface FoodPosLowStockItem {
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  status: "low" | "out";
}

/** Insumos activos en o bajo su mínimo, para que el gerente los vea en el POS. */
export async function getFoodLowStockForPos(organizationId: string, branchId: string | null = null): Promise<FoodPosLowStockItem[]> {
  const items = await getFoodLowStockItems(organizationId, 50, branchId);
  return items.map((i) => ({
    name: i.name,
    unit: i.unit,
    currentStock: i.currentStock,
    minStock: i.minStock,
    status: i.currentStock <= 0 ? "out" : "low",
  }));
}

// ─── FOOD OPS — Categorías de menú (Fase 17) ─────────────────────────

export interface FoodDishCategoryEntry {
  id: string;
  name: string;
  sortOrder: number;
  dishCount: number;
}

export async function getFoodDishCategories(organizationId: string): Promise<FoodDishCategoryEntry[]> {
  const rows = await prisma.foodDishCategory.findMany({
    where: { organizationId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { dishes: true } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder, dishCount: c._count.dishes }));
}

// ─── FOOD OPS — Grupos de modificadores (Fase 17) ────────────────────

export interface FoodModifierOptionEntry {
  id: string;
  name: string;
  priceDelta: number;
  /** Mini-receta por unidad del platillo; cantidades negativas devuelven insumo ("Sin cebolla"). */
  ingredients: { inventoryItemId: string; quantity: number }[];
  /** Costo de insumos de la opción con el costo actual de cada insumo (negativo si ahorra insumo). */
  cost: number;
}

export interface FoodModifierGroupEntry {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: FoodModifierOptionEntry[];
  dishCount: number;
}

export async function getFoodModifierGroups(organizationId: string): Promise<FoodModifierGroupEntry[]> {
  const rows = await prisma.foodModifierGroup.findMany({
    where: { organizationId, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      options: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { ingredients: { include: { inventoryItem: { select: { unitCost: true } } } } },
      },
      _count: { select: { dishLinks: true } },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    sortOrder: g.sortOrder,
    options: g.options.map((o) => ({
      id: o.id,
      name: o.name,
      priceDelta: Number(o.priceDelta),
      ingredients: o.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: Number(i.quantity) })),
      cost: Math.round(o.ingredients.reduce((sum, i) => sum + Number(i.quantity) * Number(i.inventoryItem.unitCost ?? 0), 0) * 100) / 100,
    })),
    dishCount: g._count.dishLinks,
  }));
}

// ─── FOOD OPS — Gastos fijos ──────────────────────────────────────────

export interface FoodOperatingCostEntry {
  id: string;
  name: string;
  amountMonthly: number;
  isActive: boolean;
}

export async function getFoodOperatingCosts(organizationId: string): Promise<FoodOperatingCostEntry[]> {
  const rows = await prisma.foodOperatingCost.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, amountMonthly: Number(r.amountMonthly), isActive: r.isActive }));
}

export async function getTotalMonthlyFixedCosts(organizationId: string): Promise<number> {
  const result = await prisma.foodOperatingCost.aggregate({
    where: { organizationId, isActive: true },
    _sum: { amountMonthly: true },
  });
  return Number(result._sum.amountMonthly ?? 0);
}

// ─── FOOD OPS — Punto de equilibrio ───────────────────────────────────

export interface FoodBreakEvenPerVariant {
  variantId: string;
  dishId: string;
  name: string;
  price: number;
  cost: number;
  contributionMargin: number;
  // null si el margen de contribución es 0 o negativo -- esa variante
  // nunca cubre los gastos fijos por sí sola, sin importar cuántas se
  // vendan (mostrar un número ahí sería engañoso, no solo impreciso).
  breakEvenUnits: number | null;
}

export interface FoodBreakEvenBlended {
  weightedAvgContributionMargin: number;
  breakEvenUnits: number;
  breakEvenRevenue: number;
  basedOnDays: number;
}

export interface FoodBreakEvenResult {
  fixedCostsMonthly: number;
  perVariant: FoodBreakEvenPerVariant[];
  // null cuando no hay ninguna venta registrada en los últimos 30 días --
  // se omite en vez de inventar una mezcla de ventas.
  blended: FoodBreakEvenBlended | null;
}

export async function getFoodBreakEven(organizationId: string): Promise<FoodBreakEvenResult> {
  const [fixedCostsMonthly, dishes] = await Promise.all([
    getTotalMonthlyFixedCosts(organizationId),
    getFoodDishesWithCost(organizationId, { activeOnly: true }),
  ]);
  const variants = flattenVariants(dishes);

  const perVariant: FoodBreakEvenPerVariant[] = variants.map((v) => ({
    variantId: v.id,
    dishId: v.dishId,
    name: v.displayName,
    price: v.price,
    cost: v.cost,
    contributionMargin: v.marginAmount,
    breakEvenUnits: v.marginAmount > 0 ? Math.ceil(fixedCostsMonthly / v.marginAmount) : null,
  }));

  const since = daysAgo(30);
  const variantSales = await prisma.foodDishSale.groupBy({
    by: ["variantId"],
    where: { organizationId, occurredAt: { gte: since } },
    _sum: { quantity: true },
  });

  let blended: FoodBreakEvenBlended | null = null;
  if (variantSales.length > 0) {
    const variantById = new Map(variants.map((v) => [v.id, v]));
    let totalUnits = 0;
    let totalMargin = 0;
    let totalRevenue = 0;
    for (const row of variantSales) {
      const variant = variantById.get(row.variantId);
      if (!variant) continue; // la variante pudo desactivarse/borrarse desde entonces
      const qty = row._sum.quantity ?? 0;
      totalUnits += qty;
      totalMargin += variant.marginAmount * qty;
      totalRevenue += variant.price * qty;
    }
    if (totalUnits > 0 && totalRevenue > 0) {
      const weightedAvgContributionMargin = totalMargin / totalUnits;
      const avgTicket = totalRevenue / totalUnits;
      if (weightedAvgContributionMargin > 0) {
        const breakEvenUnits = Math.ceil(fixedCostsMonthly / weightedAvgContributionMargin);
        blended = {
          weightedAvgContributionMargin: Math.round(weightedAvgContributionMargin * 100) / 100,
          breakEvenUnits,
          breakEvenRevenue: Math.round(breakEvenUnits * avgTicket * 100) / 100,
          basedOnDays: 30,
        };
      }
    }
  }

  return { fixedCostsMonthly, perVariant, blended };
}

// ─── FOOD OPS — Utilidad neta ─────────────────────────────────────────
// Ingresos = FoodSale.netAmount (la fuente real ya existente, sin cambios).
// COGS = Σ FoodDishSale.quantity × costo de la variante, SOLO para
// variantes con venta registrada en el período -- coverage dice qué tan
// completo es ese dato para que la página pueda avisar si la utilidad es
// parcial.

export type FoodProfitPeriod = "today" | "7d" | "30d";

const PERIOD_LABEL_DAYS: Record<FoodProfitPeriod, number> = { today: 1, "7d": 7, "30d": 30 };

export interface FoodNetProfitResult {
  period: FoodProfitPeriod;
  revenue: number;
  cogs: number;
  fixedCostsProrated: number;
  /** Vista de una sucursal: los costos fijos son de todo el negocio y no se restan. */
  fixedCostsExcluded: boolean;
  netProfit: number;
  coverage: { itemsWithSales: number; totalActiveItems: number };
}

/** Costo actual de insumos de cada opción de modificador con receta (optionId → costo por unidad). */
async function getModifierOptionCosts(organizationId: string): Promise<Map<string, number>> {
  const lines = await prisma.foodModifierOptionIngredient.findMany({
    where: { option: { group: { organizationId } } },
    select: { optionId: true, quantity: true, inventoryItem: { select: { unitCost: true } } },
  });
  const costs = new Map<string, number>();
  for (const l of lines) costs.set(l.optionId, (costs.get(l.optionId) ?? 0) + Number(l.quantity) * Number(l.inventoryItem.unitCost ?? 0));
  return costs;
}

/**
 * Unidades vendidas por variante desde `from`. Sin filtro (o "todas"): los conteos diarios de siempre.
 * Con sucursal (null = Principal, id = esa sucursal): se suman los consumos de receta de las ventas de
 * esa sucursal, que sí llevan la sucursal (los conteos diarios no).
 */
async function variantUnitsSince(organizationId: string, from: Date, branch?: BranchFilter): Promise<{ variantId: string; quantity: number }[]> {
  if (branch === undefined) {
    const rows = await prisma.foodDishSale.groupBy({ by: ["variantId"], where: { organizationId, occurredAt: { gte: from } }, _sum: { quantity: true } });
    return rows.map((r) => ({ variantId: r.variantId, quantity: r._sum.quantity ?? 0 }));
  }
  const rows = await prisma.foodRecipeUsage.groupBy({
    by: ["variantId"],
    where: { organizationId, occurredAt: { gte: from }, variantId: { not: null }, saleBranchId: branch },
    _sum: { units: true },
  });
  return rows.map((r) => ({ variantId: r.variantId!, quantity: Math.round(Number(r._sum.units ?? 0)) }));
}

async function optionUnitsSince(organizationId: string, from: Date, branch?: BranchFilter): Promise<{ optionId: string; quantity: number }[]> {
  if (branch === undefined) {
    const rows = await prisma.foodModifierOptionSale.groupBy({ by: ["optionId"], where: { organizationId, occurredAt: { gte: from } }, _sum: { quantity: true } });
    return rows.map((r) => ({ optionId: r.optionId, quantity: r._sum.quantity ?? 0 }));
  }
  const rows = await prisma.foodRecipeUsage.groupBy({
    by: ["modifierOptionId"],
    where: { organizationId, occurredAt: { gte: from }, modifierOptionId: { not: null }, saleBranchId: branch },
    _sum: { units: true },
  });
  return rows.map((r) => ({ optionId: r.modifierOptionId!, quantity: Math.round(Number(r._sum.units ?? 0)) }));
}

export async function getFoodNetProfit(organizationId: string, period: FoodProfitPeriod, branch?: BranchFilter): Promise<FoodNetProfitResult> {
  const days = PERIOD_LABEL_DAYS[period];
  const from = period === "today" ? startOfDay(new Date()) : daysAgo(days);

  const [salesAgg, variantSales, dishes, fixedCostsMonthly, optionSales, optionCosts] = await Promise.all([
    prisma.foodSale.aggregate({
      where: { organizationId, ...branchWhere(branch), occurredAt: { gte: from } },
      _sum: { netAmount: true },
    }),
    variantUnitsSince(organizationId, from, branch),
    getFoodDishesWithCost(organizationId, { activeOnly: true, includeInactiveVariants: true }),
    getTotalMonthlyFixedCosts(organizationId),
    optionUnitsSince(organizationId, from, branch),
    getModifierOptionCosts(organizationId),
  ]);

  const variants = flattenVariants(dishes);
  const variantById = new Map(variants.map((v) => [v.id, v]));
  let cogs = 0;
  const variantsWithSalesIds = new Set<string>();
  for (const row of variantSales) {
    const variant = variantById.get(row.variantId);
    if (!variant) continue;
    cogs += variant.cost * row.quantity;
    if (variant.isActive) variantsWithSalesIds.add(row.variantId);
  }
  // Los extras con receta ("Extra queso") también cuestan; "Sin ..." resta.
  for (const row of optionSales) cogs += (optionCosts.get(row.optionId) ?? 0) * row.quantity;

  const revenue = Number(salesAgg._sum.netAmount ?? 0);
  // Los costos fijos son de todo el negocio: en la vista de una sucursal no se reparten ni se restan.
  const fixedCostsProrated = branch === undefined ? Math.round((fixedCostsMonthly / 30) * days * 100) / 100 : 0;
  const netProfit = Math.round((revenue - cogs - fixedCostsProrated) * 100) / 100;

  return {
    period,
    revenue,
    cogs: Math.round(cogs * 100) / 100,
    fixedCostsProrated,
    fixedCostsExcluded: branch !== undefined,
    netProfit,
    coverage: { itemsWithSales: variantsWithSalesIds.size, totalActiveItems: variants.filter((v) => v.isActive).length },
  };
}

// ─── FOOD OPS — Reducción de costos ───────────────────────────────────

export interface FoodLowMarginItem {
  variantId: string;
  dishId: string;
  name: string;
  marginPct: number | null;
  cost: number;
  price: number;
}

export interface FoodTopCostIngredient {
  inventoryItemId: string;
  name: string;
  unit: string;
  // Suma del costo de este insumo por PORCIÓN a través de todas las
  // variantes activas de tu menú (no el gasto total de compra, que este
  // módulo no registra todavía) -- indica qué insumo pesa más en el costo
  // de tu menú, para saber qué negociar primero con proveedores.
  totalRecipeCost: number;
  usedInDishes: number;
}

export interface FoodCostReductionInsights {
  lowestMarginItems: FoodLowMarginItem[];
  topCostIngredients: FoodTopCostIngredient[];
}

export async function getFoodCostReductionInsights(organizationId: string, limit = 5): Promise<FoodCostReductionInsights> {
  const dishes = await getFoodDishesWithCost(organizationId, { activeOnly: true });
  const variants = flattenVariants(dishes);

  const lowestMarginItems = [...variants]
    .sort((a, b) => (a.marginPct ?? -Infinity) - (b.marginPct ?? -Infinity))
    .slice(0, limit)
    .map((v) => ({ variantId: v.id, dishId: v.dishId, name: v.displayName, marginPct: v.marginPct, cost: v.cost, price: v.price }));

  const ingredientTotals = new Map<string, { name: string; unit: string; totalRecipeCost: number; usedInDishes: Set<string> }>();
  for (const variant of variants) {
    for (const ing of variant.ingredients) {
      const entry = ingredientTotals.get(ing.inventoryItemId) ?? {
        name: ing.name,
        unit: ing.unit,
        totalRecipeCost: 0,
        usedInDishes: new Set<string>(),
      };
      entry.totalRecipeCost += ing.lineCost;
      entry.usedInDishes.add(variant.dishId);
      ingredientTotals.set(ing.inventoryItemId, entry);
    }
  }

  const topCostIngredients = Array.from(ingredientTotals.entries())
    .map(([inventoryItemId, v]) => ({
      inventoryItemId,
      name: v.name,
      unit: v.unit,
      totalRecipeCost: Math.round(v.totalRecipeCost * 100) / 100,
      usedInDishes: v.usedInDishes.size,
    }))
    .sort((a, b) => b.totalRecipeCost - a.totalRecipeCost)
    .slice(0, limit);

  return { lowestMarginItems, topCostIngredients };
}

// ─── FOOD OPS — Recomendaciones para mejorar utilidad ────────────────
// "Alto/bajo volumen" es relativo a la mediana de unidades vendidas del
// propio menú (últimos 30 días), no un número absoluto -- así aplica igual
// a un puesto chico que a una cadena, sin necesitar configuración.

export type FoodProfitRecommendationType = "review_urgent" | "raise_price_or_cut_cost" | "promote";

export interface FoodProfitRecommendation {
  type: FoodProfitRecommendationType;
  variantId: string;
  dishId: string;
  name: string;
  // Datos para que la página arme el texto en el idioma del usuario.
  cost: number;
  price: number;
  marginPct: number | null;
  unitsSold: number;
}

const LOW_MARGIN_PCT = 15;
const HIGH_MARGIN_PCT = 40;

export async function getFoodProfitRecommendations(organizationId: string, branch?: BranchFilter): Promise<FoodProfitRecommendation[]> {
  const dishes = await getFoodDishesWithCost(organizationId, { activeOnly: true });
  const variants = flattenVariants(dishes);
  if (variants.length === 0) return [];

  const since = daysAgo(30);
  const salesRows = await variantUnitsSince(organizationId, since, branch);
  const unitsByVariant = new Map(salesRows.map((r) => [r.variantId, r.quantity]));

  const recommendations: FoodProfitRecommendation[] = [];

  for (const variant of variants) {
    if (variant.marginAmount < 0) {
      recommendations.push({
        type: "review_urgent",
        variantId: variant.id,
        dishId: variant.dishId,
        name: variant.displayName,
        cost: variant.cost,
        price: variant.price,
        marginPct: variant.marginPct,
        unitsSold: unitsByVariant.get(variant.id) ?? 0,
      });
    }
  }

  const soldVariants = variants.filter((v) => (unitsByVariant.get(v.id) ?? 0) > 0);
  if (soldVariants.length >= 2) {
    const unitsSorted = soldVariants.map((v) => unitsByVariant.get(v.id) ?? 0).sort((a, b) => a - b);
    const median = unitsSorted[Math.floor(unitsSorted.length / 2)];
    for (const variant of soldVariants) {
      const units = unitsByVariant.get(variant.id) ?? 0;
      if (variant.marginAmount >= 0 && variant.marginPct !== null && variant.marginPct < LOW_MARGIN_PCT && units >= median) {
        recommendations.push({
          type: "raise_price_or_cut_cost",
          variantId: variant.id,
          dishId: variant.dishId,
          name: variant.displayName,
          cost: variant.cost,
          price: variant.price,
          marginPct: variant.marginPct,
          unitsSold: units,
        });
      } else if (variant.marginPct !== null && variant.marginPct >= HIGH_MARGIN_PCT && units < median) {
        recommendations.push({
          type: "promote",
          variantId: variant.id,
          dishId: variant.dishId,
          name: variant.displayName,
          cost: variant.cost,
          price: variant.price,
          marginPct: variant.marginPct,
          unitsSold: units,
        });
      }
    }
  }

  return recommendations;
}

// ─── FOOD OPS — Platillos menos vendidos (para promociones) ─────────
// Solo entre variantes con AL MENOS una venta registrada en el rango, para
// no confundir "nunca se ofreció/no se ha capturado" con "se ofreció y
// casi no se vendió", que son situaciones muy distintas.

export interface FoodLeastSoldItem {
  variantId: string;
  dishId: string;
  name: string;
  unitsSold: number;
  price: number;
  marginPct: number | null;
}

export async function getFoodLeastSoldDishes(organizationId: string, days = 30, limit = 5, branch?: BranchFilter): Promise<FoodLeastSoldItem[]> {
  const dishes = await getFoodDishesWithCost(organizationId, { activeOnly: true });
  const variants = flattenVariants(dishes);
  const since = daysAgo(days);
  const salesRows = await variantUnitsSince(organizationId, since, branch);
  const unitsByVariant = new Map(salesRows.map((r) => [r.variantId, r.quantity]));

  return variants
    .filter((v) => unitsByVariant.has(v.id))
    .map((v) => ({ variantId: v.id, dishId: v.dishId, name: v.displayName, unitsSold: unitsByVariant.get(v.id) ?? 0, price: v.price, marginPct: v.marginPct }))
    .sort((a, b) => a.unitsSold - b.unitsSold)
    .slice(0, limit);
}

// ─── FOOD OPS — Platillos más vendidos (resumen del dashboard) ───────
// Contraparte de getFoodLeastSoldDishes: mismas ventas reales por variante
// (POS o captura manual), ordenadas de más a menos unidades. El ingreso es
// unidades × precio actual de la variante -- una aproximación, porque
// FoodDishSale no guarda el precio cobrado en cada venta.

export interface FoodTopSellingItem {
  variantId: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export async function getFoodTopSellingDishes(organizationId: string, days = 30, limit = 5, branch?: BranchFilter): Promise<FoodTopSellingItem[]> {
  const since = daysAgo(days);
  const salesRows = await variantUnitsSince(organizationId, since, branch);
  if (salesRows.length === 0) return [];

  const variants = flattenVariants(await getFoodDishesWithCost(organizationId, { includeInactiveVariants: true }));
  const variantById = new Map(variants.map((v) => [v.id, v]));

  return salesRows
    .flatMap((r) => {
      const v = variantById.get(r.variantId);
      const unitsSold = r.quantity;
      if (!v || unitsSold <= 0) return [];
      return [{ variantId: v.id, name: v.displayName, unitsSold, revenue: Math.round(unitsSold * v.price * 100) / 100 }];
    })
    .sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue)
    .slice(0, limit);
}

// ─── FOOD OPS — Recomendación de precio ──────────────────────────────
// Método estándar de la industria restaurantera: precio = costo ÷ % de
// costo objetivo (ej. costo $30, objetivo 30% ⇒ precio sugerido $100).

export function recommendDishPrice(cost: number, targetCostPct: number): number {
  if (targetCostPct <= 0 || targetCostPct >= 100) return cost;
  return Math.round((cost / (targetCostPct / 100)) * 100) / 100;
}

// ─── FOOD OPS — Ingesta de ventas desde un POS externo (Fase 17) ─────
// Llamado por POST /api/webhooks/pos/orders (autenticación + idempotencia
// las resuelve la ruta vía ingestWebhookEvent, igual que los webhooks de
// n8n) -- esta función solo valida el payload y escribe. A diferencia de
// logFoodDishSales() (captura manual, REEMPLAZA la cantidad del día), aquí
// cada orden SUMA -- un POS manda una orden a la vez, no un total diario.

export interface FoodPosOrderModifier {
  optionId: string;
  quantity: number; // entero != 0; mismo criterio que item.quantity (negativo = cancelación)
}

export interface FoodPosOrderItem {
  variantId: string;
  quantity: number; // entero != 0; negativo = cancelación/ajuste de una orden previa
  modifiers?: FoodPosOrderModifier[]; // opcional -- si se omite, no se registra venta de modificadores para este item
}

export interface FoodPosOrderPayload {
  occurredAt?: string; // ISO 8601; por defecto ahora
  channel?: string; // por defecto "POS"
  grossAmount: number; // puede ser negativo para una cancelación -- ver items.quantity
  netAmount: number; // monto SIN IVA -- nunca "bruto menos descuentos"
  items: FoodPosOrderItem[];
  // Todo lo siguiente es opcional: un POS viejo que no lo manda se comporta igual que antes.
  orderId?: string; // id de la orden en el POS; en una cancelación, el de la orden original
  customer?: { phone: string; name?: string; consent?: { accepted: boolean; textVersion?: string; at?: string } };
  discount?: { amount: number; reason?: string };
  branchId?: string; // sucursal de Reymen donde se vendió; ausente o desconocida = principal
  // Lealtad (módulo LOYALTY): cliente identificado en caja y, si aplica, la
  // recompensa que se canjeó en esta orden. Ver src/lib/loyalty/pos.ts.
  loyalty?: { code?: string; phone?: string; redeemRewardId?: string };
}

export interface FoodPosOrderResult {
  saleId: string;
  /** Qué pasó con Lealtad en esta orden (null si la orden no la toca). */
  loyalty: PosLoyaltyResult | null;
}

export async function processFoodPosOrder(payload: unknown, organizationId: string): Promise<FoodPosOrderResult> {
  if (!(await hasModule(organizationId, "FOOD_OPS"))) {
    throw new Error("El módulo Food no está habilitado para esta organización");
  }

  const body = payload as Partial<FoodPosOrderPayload>;

  if (typeof body.grossAmount !== "number" || typeof body.netAmount !== "number") {
    throw new Error("grossAmount y netAmount son requeridos y deben ser numéricos");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error("La orden debe traer al menos un item");
  }
  for (const item of body.items) {
    // quantity puede ser negativa -- una cancelación/ajuste de una orden ya
    // reportada se manda como el mismo variantId con quantity negativa; el
    // upsert de abajo la resta de lo acumulado el mismo día de negocio.
    if (!item?.variantId || typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity === 0) {
      throw new Error("Cada item requiere variantId y quantity entero distinto de 0");
    }
    if (item.modifiers !== undefined) {
      if (!Array.isArray(item.modifiers)) throw new Error("modifiers debe ser un arreglo");
      for (const mod of item.modifiers) {
        if (!mod?.optionId || typeof mod.quantity !== "number" || !Number.isInteger(mod.quantity) || mod.quantity === 0) {
          throw new Error("Cada modifier requiere optionId y quantity entero distinto de 0");
        }
      }
    }
  }

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error("occurredAt inválido");
  const businessDay = startOfDay(occurredAt);

  const variantIds = body.items.map((i) => i.variantId);
  const owned = await prisma.foodDishVariant.findMany({
    where: { id: { in: variantIds }, organizationId },
    select: { id: true },
  });
  if (owned.length !== new Set(variantIds).size) {
    throw new Error("Una o más variantes de la orden no pertenecen a esta organización");
  }

  // A diferencia de variantId (el platillo que se vendió -- si no existe,
  // se rechaza la orden completa), un optionId de modificador que ya no
  // existe o fue borrado de esta organización NO tira la orden: solo se
  // ignora esa entrada. El caso real es un POS con el menú en caché
  // desactualizado (justo lo que el ETag de GET /api/v1/food/menu busca
  // reducir, pero nunca lo elimina del todo); tirar toda la orden por un
  // modificador obsoleto perdería el platillo y el ingreso real por algo
  // que ni siquiera afecta el monto cobrado (el precio ya viene sumado en
  // grossAmount/netAmount). Sin el nombre de la opción rechazada no hay
  // forma de registrar ese modificador -- el payload no lo trae -- así que
  // simplemente se descarta.
  const modifierEntries = body.items.flatMap((item) => item.modifiers ?? []);
  const optionIds = modifierEntries.map((m) => m.optionId);
  let optionNameById = new Map<string, string>();
  if (optionIds.length > 0) {
    const owningOptions = await prisma.foodModifierOption.findMany({
      where: { id: { in: optionIds }, group: { organizationId } },
      select: { id: true, name: true },
    });
    optionNameById = new Map(owningOptions.map((o) => [o.id, o.name]));
  }
  const recognizedModifierEntries = modifierEntries.filter((m) => optionNameById.has(m.optionId));

  const items = body.items;
  const externalOrderId = typeof body.orderId === "string" && body.orderId.trim() ? body.orderId.trim().slice(0, 120) : null;
  const customerInput = parsePosCustomer(body.customer);
  const discountAmount =
    body.discount && typeof body.discount.amount === "number" && Number.isFinite(body.discount.amount) && body.discount.amount > 0 ? body.discount.amount : null;
  const discountReason = discountAmount !== null && typeof body.discount?.reason === "string" ? body.discount.reason.trim().slice(0, 200) || null : null;
  // Una sucursal que no existe o no es de esta organización nunca tira la venta: cae en la principal.
  const branchId =
    typeof body.branchId === "string" && body.branchId
      ? ((await prisma.branch.findFirst({ where: { id: body.branchId, organizationId }, select: { id: true } }))?.id ?? null)
      : null;
  // Lealtad solo si la orden trae cliente de lealtad o es una cancelación, y el negocio tiene el módulo.
  const loyaltyReq = parsePosLoyalty(body.loyalty);
  const loyaltyOn = (loyaltyReq !== null || body.grossAmount < 0) && (await posLoyaltyEnabled(organizationId));
  const outcome = await prisma.$transaction(async (tx) => {
    // Una cancelación hereda el cliente de la orden original si el POS no lo repite.
    const isCancel = body.grossAmount! < 0;
    const original =
      isCancel && externalOrderId
        ? await tx.foodSale.findFirst({ where: { organizationId, externalOrderId, grossAmount: { gt: 0 } }, orderBy: { createdAt: "desc" }, select: { id: true, customerId: true, branchId: true } })
        : null;
    const upserted = customerInput ? await upsertCustomer(tx, organizationId, customerInput) : null;
    const customerId = upserted ? upserted.id : (original?.customerId ?? null);
    const sale = await tx.foodSale.create({
      data: {
        organizationId,
        occurredAt,
        channel: body.channel ?? "POS",
        grossAmount: body.grossAmount!,
        netAmount: body.netAmount!,
        source: "POS",
        externalOrderId,
        customerId,
        branchId: branchId ?? original?.branchId ?? null,
        cancelsSaleId: original?.id ?? null,
        discountAmount,
        discountReason,
      },
    });
    if (customerId) await applySaleToCustomer(tx, customerId, { grossAmount: body.grossAmount!, occurredAt });

    // Hechos para el motor de automatizaciones: se escriben en esta misma transacción (si la venta se
    // revierte, no quedan) y con llave única (un reintento del POS no los duplica).
    const subjectRef = externalOrderId ?? sale.id;
    const saleFact = { saleId: sale.id, orderId: externalOrderId, customerId, branchId: sale.branchId, grossAmount: body.grossAmount!, netAmount: body.netAmount!, discountAmount };
    await emitDomainEvent(tx, {
      organizationId,
      type: isCancel ? "sale.cancelled" : "sale.completed",
      subjectType: "sale",
      subjectId: sale.id,
      occurredAt,
      payload: saleFact,
      dedupeKey: isCancel ? `sale.cancelled:${subjectRef}:${body.grossAmount}` : `sale.completed:${subjectRef}`,
      correlationId: externalOrderId,
    });
    if (upserted?.created) {
      await emitDomainEvent(tx, {
        organizationId,
        type: "customer.created",
        subjectType: "customer",
        subjectId: upserted.id,
        occurredAt,
        payload: { customerId: upserted.id, saleId: sale.id },
        dedupeKey: `customer.created:${upserted.id}`,
        correlationId: externalOrderId,
        causationId: sale.id,
      });
    }
    // Con inventario por sucursal, los insumos salen de la existencia de la sucursal que vendió.
    const saleBranch = branchId ?? original?.branchId ?? null;
    const stockBranch = await effectiveStockBranch(organizationId, saleBranch);
    for (const item of items) {
      await tx.foodDishSale.upsert({
        where: { variantId_occurredAt: { variantId: item.variantId, occurredAt: businessDay } },
        update: { quantity: { increment: item.quantity } },
        create: { organizationId, variantId: item.variantId, occurredAt: businessDay, quantity: item.quantity },
      });
    }
    for (const mod of recognizedModifierEntries) {
      await tx.foodModifierOptionSale.upsert({
        where: { optionId_occurredAt: { optionId: mod.optionId, occurredAt: businessDay } },
        update: { quantity: { increment: mod.quantity } },
        create: {
          organizationId,
          optionId: mod.optionId,
          optionName: optionNameById.get(mod.optionId)!,
          occurredAt: businessDay,
          quantity: mod.quantity,
        },
      });
    }

    // Descuento de insumos según la receta de cada platillo vendido; una
    // cancelación (cantidades negativas) los devuelve.
    // Los modificadores reconocidos descuentan su propia mini-receta junto
    // con el platillo en el que se eligieron (mismo signo que ese platillo).
    const withModifiers = (list: typeof items) => ({
      variants: list,
      modifiers: list.flatMap((i) => (i.modifiers ?? []).filter((m) => optionNameById.has(m.optionId))),
    });
    const sold = items.filter((i) => i.quantity > 0);
    const cancelled = items.filter((i) => i.quantity < 0);
    if (sold.length) await consumeRecipes(tx, organizationId, withModifiers(sold), { type: "SALE", occurredAt, foodSaleId: sale.id, branchId: stockBranch, saleBranchId: saleBranch });
    if (cancelled.length) {
      await consumeRecipes(tx, organizationId, withModifiers(cancelled), { type: "SALE_CANCELLATION", occurredAt, foodSaleId: sale.id, branchId: stockBranch, saleBranchId: saleBranch });
    }

    // Lealtad va al final y en la misma transacción: la visita queda ligada a esta venta o no queda.
    const loyalty = loyaltyOn
      ? await applyPosOrderLoyalty(
          tx,
          {
            organizationId,
            saleId: sale.id,
            externalOrderId,
            branchId: sale.branchId,
            grossAmount: body.grossAmount!,
            occurredAt,
            cancelsSaleId: isCancel ? (original?.id ?? null) : null,
          },
          loyaltyReq
        )
      : null;
    return { saleId: sale.id, loyalty };
  });
  await auditPosLoyalty(organizationId, outcome.saleId, outcome.loyalty);
  return outcome;
}
