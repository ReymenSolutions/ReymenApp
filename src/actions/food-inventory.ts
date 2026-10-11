"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireFoodManager } from "@/lib/guards";
import { applyStockMovements, effectiveStockBranch, recalculateRecipeUsage } from "@/lib/food-inventory";
import { UserError } from "@/lib/user-error";
import { normalizeFoodUnit } from "@/lib/food-units";

// ─── FOOD OPS — Insumos, proveedores y compras ───────────────────────
// Editar insumos y proveedores, ajustar existencias por conteo físico, y el
// registro de compras. Todo cambio de existencia pasa por
// applyStockMovements() para que quede en la bitácora de movimientos.

function revalidateInventory() {
  revalidatePath("/portal/food/inventory");
  revalidatePath("/portal/food/purchases");
  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

// ── Insumos ──────────────────────────────────────────────────────────

const inventoryItemSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido"),
  unit: z.string().trim().min(1, "Unidad requerida"),
  category: z.enum(["EDIBLE", "NON_EDIBLE"]),
  minStock: z.number().min(0, "No puede ser negativo"),
  unitCost: z.number().min(0, "No puede ser negativo").nullable(),
});

/** Edita los datos de un insumo. La existencia NO se cambia aquí: para eso está adjustFoodInventoryStock (queda registrada). */
export async function updateFoodInventoryItem(itemId: string, data: z.input<typeof inventoryItemSchema>) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = inventoryItemSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos de insumo inválidos");

  const item = await prisma.foodInventoryItem.findFirst({ where: { id: itemId, organizationId } });
  if (!item) throw new UserError("Insumo no encontrado");
  // Una unidad escrita a mano antes de la lista se puede conservar tal cual
  // mientras no se cambie; cualquier unidad nueva debe ser de la lista.
  const unit = normalizeFoodUnit(parsed.data.unit) ?? (parsed.data.unit === item.unit ? item.unit : null);
  if (!unit) throw new UserError("Elige una unidad de la lista");

  const duplicate = await prisma.foodInventoryItem.findFirst({
    where: { organizationId, name: parsed.data.name, id: { not: itemId } },
    select: { id: true },
  });
  if (duplicate) throw new UserError("Ya existe un insumo con ese nombre");

  await prisma.foodInventoryItem.update({
    where: { id: itemId },
    data: {
      name: parsed.data.name,
      unit,
      category: parsed.data.category,
      minStock: parsed.data.minStock,
      unitCost: parsed.data.unitCost,
    },
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.inventory_item_update",
    resource: "FoodInventoryItem",
    resourceId: itemId,
    metadata: { before: { name: item.name, unitCost: item.unitCost?.toString() ?? null }, after: parsed.data },
  });
  revalidateInventory();
}

/** Desactivar oculta el insumo de compras y recetas nuevas sin perder su historial. */
export async function setFoodInventoryItemActive(itemId: string, isActive: boolean) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const item = await prisma.foodInventoryItem.findFirst({ where: { id: itemId, organizationId }, select: { id: true, name: true } });
  if (!item) throw new UserError("Insumo no encontrado");

  await prisma.foodInventoryItem.update({ where: { id: itemId }, data: { isActive } });
  await logAudit({
    organizationId,
    userId: session.user.id,
    action: isActive ? "food.inventory_item_activate" : "food.inventory_item_deactivate",
    resource: "FoodInventoryItem",
    resourceId: itemId,
    metadata: { name: item.name },
  });
  revalidateInventory();
}

/**
 * Borra un insumo dado de alta por error. Si ya está en una receta o en una
 * compra, se rechaza: borrarlo rompería ese historial, para eso está desactivar.
 */
export async function deleteFoodInventoryItem(itemId: string) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const item = await prisma.foodInventoryItem.findFirst({
    where: { id: itemId, organizationId },
    select: { name: true, _count: { select: { dishLinks: true, modifierLinks: true, purchaseItems: true } } },
  });
  if (!item) throw new UserError("Insumo no encontrado");
  if (item._count.dishLinks > 0 || item._count.modifierLinks > 0 || item._count.purchaseItems > 0) {
    throw new UserError("Este insumo se usa en recetas o compras; desactívalo en lugar de eliminarlo");
  }

  await prisma.foodInventoryItem.delete({ where: { id: itemId } });
  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.inventory_item_delete",
    resource: "FoodInventoryItem",
    resourceId: itemId,
    metadata: { name: item.name },
  });
  revalidateInventory();
}

/** Existencia actual de un insumo en la sucursal (o la general si branchId es null). */
async function currentStockOf(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], itemId: string, branchId: string | null): Promise<number> {
  if (!branchId) return Number((await tx.foodInventoryItem.findFirst({ where: { id: itemId }, select: { currentStock: true } }))?.currentStock ?? 0);
  return Number((await tx.branchStock.findUnique({ where: { branchId_inventoryItemId: { branchId, inventoryItemId: itemId } }, select: { currentStock: true } }))?.currentStock ?? 0);
}

const adjustSchema = z.object({
  countedStock: z.number().finite("Cantidad inválida"),
  note: z.string().trim().max(500).optional(),
  /** Sucursal contada (solo con inventario por sucursal; ausente = Principal / general). */
  branchId: z.string().nullable().optional(),
});

/** Conteo físico: fija la existencia al valor contado y registra la diferencia como ajuste. */
export async function adjustFoodInventoryStock(itemId: string, data: z.input<typeof adjustSchema>) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = adjustSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const branchId = await effectiveStockBranch(organizationId, parsed.data.branchId);
  await prisma.$transaction(async (tx) => {
    const item = await tx.foodInventoryItem.findFirst({ where: { id: itemId, organizationId }, select: { id: true } });
    if (!item) throw new UserError("Insumo no encontrado");
    const delta = parsed.data.countedStock - (await currentStockOf(tx, itemId, branchId));
    await applyStockMovements(tx, organizationId, [{ inventoryItemId: itemId, delta }], {
      type: "ADJUSTMENT",
      note: parsed.data.note || undefined,
      userId: session.user.id,
      branchId,
    });
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.inventory_adjust",
    resource: "FoodInventoryItem",
    resourceId: itemId,
    metadata: { countedStock: parsed.data.countedStock, note: parsed.data.note ?? null, branchId },
  });
  revalidateInventory();
}

// ── Ajustes rápidos ──────────────────────────────────────────────────
// Un solo formulario para los cuatro movimientos del día a día: ingreso de
// stock, producción de preparados, desecho y conteo. Varios insumos a la vez;
// todo en una transacción y agrupado con el mismo batchId.

const quickLineSchema = z.object({
  itemId: z.string().min(1, "Selecciona un insumo"),
  quantity: z.number().finite("Cantidad inválida").min(0, "No puede ser negativo"),
});

const quickAdjustSchema = z.object({
  kind: z.enum(["in", "production", "waste", "count"]),
  lines: z.array(quickLineSchema).max(100),
  /** Producción: el preparado que se obtiene. */
  output: quickLineSchema.optional(),
  note: z.string().trim().max(300).optional(),
  /** Sucursal (solo con inventario por sucursal; ausente = Principal / general). */
  branchId: z.string().nullable().optional(),
});

export type QuickAdjustInput = z.input<typeof quickAdjustSchema>;

export async function recordInventoryAdjustment(data: QuickAdjustInput): Promise<{ movements: number }> {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = quickAdjustSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos inválidos");
  const { kind, output } = parsed.data;
  const note = parsed.data.note || undefined;
  // Líneas sin cantidad (o en 0, salvo en conteo) no cuentan.
  const lines = parsed.data.lines.filter((l) => (kind === "count" ? true : l.quantity > 0));
  if (lines.length === 0 && kind !== "production") throw new UserError("Agrega al menos un insumo con cantidad");
  if (new Set(lines.map((l) => l.itemId)).size !== lines.length) throw new UserError("Un insumo aparece dos veces");
  if (kind === "waste" && !note) throw new UserError("Escribe el motivo del desecho");
  if (kind === "production") {
    if (!output || output.quantity <= 0) throw new UserError("Indica qué preparado y cuánto se produjo");
    if (lines.length === 0) throw new UserError("Agrega los insumos que se usaron");
    if (lines.some((l) => l.itemId === output.itemId)) throw new UserError("El preparado no puede ser también uno de sus insumos");
  }

  const ids = [...lines.map((l) => l.itemId), ...(output ? [output.itemId] : [])];
  const batchId = crypto.randomUUID();
  const branchId = await effectiveStockBranch(organizationId, parsed.data.branchId);
  const movements = await prisma.$transaction(async (tx) => {
    const items = await tx.foodInventoryItem.findMany({
      where: { organizationId, id: { in: ids }, isActive: true },
      select: { id: true, name: true, currentStock: true, unitCost: true },
    });
    if (items.length !== new Set(ids).size) throw new UserError("Insumo no encontrado");
    const byId = new Map(items.map((i) => [i.id, i]));
    const meta = { batchId, userId: session.user.id, branchId };

    if (kind === "in") {
      await applyStockMovements(tx, organizationId, lines.map((l) => ({ inventoryItemId: l.itemId, delta: l.quantity })), { ...meta, type: "STOCK_IN", note });
    } else if (kind === "waste") {
      await applyStockMovements(tx, organizationId, lines.map((l) => ({ inventoryItemId: l.itemId, delta: -l.quantity })), { ...meta, type: "WASTE", note });
    } else if (kind === "count") {
      const deltas: { inventoryItemId: string; delta: number }[] = [];
      for (const l of lines) deltas.push({ inventoryItemId: l.itemId, delta: l.quantity - (await currentStockOf(tx, l.itemId, branchId)) });
      await applyStockMovements(tx, organizationId, deltas, { ...meta, type: "ADJUSTMENT", note: note ? `Conteo de stock · ${note}` : "Conteo de stock" });
    } else if (output) {
      const outName = byId.get(output.itemId)!.name;
      const prodNote = note ? `Producción de ${outName} · ${note}` : `Producción de ${outName}`;
      await applyStockMovements(
        tx,
        organizationId,
        [{ inventoryItemId: output.itemId, delta: output.quantity }, ...lines.map((l) => ({ inventoryItemId: l.itemId, delta: -l.quantity }))],
        { ...meta, type: "PRODUCTION", note: prodNote },
      );
      // Costo del preparado = lo que costaron sus insumos ÷ lo producido,
      // solo si todos los insumos tienen costo (si no, quedaría por debajo).
      if (lines.every((l) => byId.get(l.itemId)!.unitCost !== null)) {
        const cost = lines.reduce((sum, l) => sum + Number(byId.get(l.itemId)!.unitCost) * l.quantity, 0) / output.quantity;
        await tx.foodInventoryItem.update({ where: { id: output.itemId }, data: { unitCost: Math.round(cost * 100) / 100 } });
      }
    }
    return tx.foodInventoryMovement.count({ where: { batchId } });
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: `food.inventory_${kind === "in" ? "stock_in" : kind}`,
    resource: "FoodInventoryMovement",
    resourceId: batchId,
    metadata: { lines: lines.length, output: output ?? null, note: note ?? null },
  });
  revalidateInventory();
  return { movements };
}

// ── Proveedores ──────────────────────────────────────────────────────

const supplierSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido"),
  contactName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional(),
});

export async function updateFoodSupplier(supplierId: string, data: z.input<typeof supplierSchema>) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = supplierSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos de proveedor inválidos");

  const supplier = await prisma.foodSupplier.findFirst({ where: { id: supplierId, organizationId }, select: { id: true } });
  if (!supplier) throw new UserError("Proveedor no encontrado");

  await prisma.foodSupplier.update({
    where: { id: supplierId },
    data: {
      name: parsed.data.name,
      contactName: parsed.data.contactName || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      notes: parsed.data.notes || null,
    },
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.supplier_update",
    resource: "FoodSupplier",
    resourceId: supplierId,
    metadata: { name: parsed.data.name },
  });
  revalidateSuppliers();
}

export async function setFoodSupplierActive(supplierId: string, isActive: boolean) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const supplier = await prisma.foodSupplier.findFirst({ where: { id: supplierId, organizationId }, select: { name: true } });
  if (!supplier) throw new UserError("Proveedor no encontrado");

  await prisma.foodSupplier.update({ where: { id: supplierId }, data: { isActive } });
  await logAudit({
    organizationId,
    userId: session.user.id,
    action: isActive ? "food.supplier_activate" : "food.supplier_deactivate",
    resource: "FoodSupplier",
    resourceId: supplierId,
    metadata: { name: supplier.name },
  });
  revalidateSuppliers();
}

/** Borra un proveedor sin compras. Con compras se rechaza: se desactiva para no perder de quién fue cada compra. */
export async function deleteFoodSupplier(supplierId: string) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const supplier = await prisma.foodSupplier.findFirst({
    where: { id: supplierId, organizationId },
    select: { name: true, _count: { select: { purchases: true } } },
  });
  if (!supplier) throw new UserError("Proveedor no encontrado");
  if (supplier._count.purchases > 0) throw new UserError("Este proveedor tiene compras registradas; desactívalo en lugar de eliminarlo");

  await prisma.foodSupplier.delete({ where: { id: supplierId } });
  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.supplier_delete",
    resource: "FoodSupplier",
    resourceId: supplierId,
    metadata: { name: supplier.name },
  });
  revalidateSuppliers();
}

function revalidateSuppliers() {
  revalidatePath("/portal/food/suppliers");
  revalidatePath("/portal/food/purchases");
  revalidatePath("/portal/food");
}

// ── Compras ──────────────────────────────────────────────────────────

const purchaseSchema = z.object({
  supplierId: z.string().nullable(),
  purchasedAt: z.string().min(1, "Fecha requerida"),
  notes: z.string().trim().max(2000).optional(),
  /** Sucursal que recibe la compra (solo con inventario por sucursal; ausente = Principal / general). */
  branchId: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1, "Selecciona un insumo"),
        quantity: z.number().positive("Cantidad debe ser mayor a 0"),
        unitCost: z.number().min(0, "No puede ser negativo"),
      })
    )
    .min(1, "Agrega al menos un insumo"),
});

/**
 * Registra una compra: suma cada cantidad a la existencia del insumo y deja
 * el costo unitario pagado como su costo actual (último costo de compra),
 * que es el que usan recetas y rentabilidad.
 */
export async function createFoodPurchase(data: z.input<typeof purchaseSchema>) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = purchaseSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos de compra inválidos");

  const purchasedAt = new Date(parsed.data.purchasedAt);
  if (Number.isNaN(purchasedAt.getTime())) throw new UserError("Fecha inválida");

  const itemIds = [...new Set(parsed.data.items.map((i) => i.inventoryItemId))];
  if (itemIds.length !== parsed.data.items.length) throw new UserError("Un insumo aparece dos veces en la compra");
  const owned = await prisma.foodInventoryItem.findMany({
    where: { id: { in: itemIds }, organizationId },
    select: { id: true, isActive: true, unitCost: true },
  });
  if (owned.length !== itemIds.length) throw new UserError("Uno o más insumos no son válidos");
  if (owned.some((i) => !i.isActive)) throw new UserError("Uno o más insumos están desactivados");
  if (parsed.data.supplierId) {
    const supplier = await prisma.foodSupplier.findFirst({ where: { id: parsed.data.supplierId, organizationId }, select: { isActive: true } });
    if (!supplier) throw new UserError("Proveedor no encontrado");
    if (!supplier.isActive) throw new UserError("Este proveedor está desactivado");
  }

  const total = Math.round(parsed.data.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0) * 100) / 100;
  const branchId = await effectiveStockBranch(organizationId, parsed.data.branchId);

  const purchase = await prisma.$transaction(async (tx) => {
    // Costo vigente de cada insumo antes de esta compra, para regresarlo si se anula.
    const before = await tx.foodInventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, unitCost: true } });
    const previousCost = new Map(before.map((i) => [i.id, i.unitCost]));
    const created = await tx.foodPurchase.create({
      data: {
        organizationId,
        supplierId: parsed.data.supplierId,
        purchasedAt,
        total,
        notes: parsed.data.notes || null,
        userId: session.user.id,
        branchId,
        items: {
          create: parsed.data.items.map((i) => ({
            inventoryItemId: i.inventoryItemId,
            quantity: i.quantity,
            unitCost: i.unitCost,
            previousUnitCost: previousCost.get(i.inventoryItemId) ?? null,
          })),
        },
      },
    });
    await applyStockMovements(
      tx,
      organizationId,
      parsed.data.items.map((i) => ({ inventoryItemId: i.inventoryItemId, delta: i.quantity })),
      { type: "PURCHASE", purchaseId: created.id, userId: session.user.id, branchId }
    );
    for (const i of parsed.data.items) {
      await tx.foodInventoryItem.update({ where: { id: i.inventoryItemId }, data: { unitCost: i.unitCost } });
    }
    return created;
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.purchase_create",
    resource: "FoodPurchase",
    resourceId: purchase.id,
    metadata: { total, items: parsed.data.items.length, branchId },
  });
  revalidateInventory();
  return { id: purchase.id };
}

/**
 * Anula una compra capturada por error: quita de la existencia lo que había
 * sumado y regresa el costo que tenía cada insumo antes de ella, salvo que
 * ese costo ya no sea el de esta compra (una compra posterior o una edición
 * manual lo cambió): entonces el costo vigente se respeta.
 */
export async function voidFoodPurchase(purchaseId: string, reason: string) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const trimmed = reason.trim();
  if (!trimmed) throw new UserError("Indica el motivo de la anulación");

  await prisma.$transaction(async (tx) => {
    const purchase = await tx.foodPurchase.findFirst({
      where: { id: purchaseId, organizationId },
      include: { items: true },
    });
    if (!purchase) throw new UserError("Compra no encontrada");
    if (purchase.voidedAt) throw new UserError("Esta compra ya está anulada");

    await tx.foodPurchase.update({ where: { id: purchaseId }, data: { voidedAt: new Date(), voidReason: trimmed } });
    await applyStockMovements(
      tx,
      organizationId,
      purchase.items.map((i) => ({ inventoryItemId: i.inventoryItemId, delta: -Number(i.quantity) })),
      { type: "PURCHASE_VOID", purchaseId, note: trimmed, userId: session.user.id, branchId: purchase.branchId }
    );
    for (const line of purchase.items) {
      const current = await tx.foodInventoryItem.findUnique({ where: { id: line.inventoryItemId }, select: { unitCost: true } });
      if (current?.unitCost === null || current?.unitCost === undefined || !current.unitCost.equals(line.unitCost)) continue;
      const later = await tx.foodPurchaseItem.count({
        where: {
          inventoryItemId: line.inventoryItemId,
          purchase: { organizationId, voidedAt: null, createdAt: { gt: purchase.createdAt } },
        },
      });
      if (later > 0) continue;
      await tx.foodInventoryItem.update({ where: { id: line.inventoryItemId }, data: { unitCost: line.previousUnitCost } });
    }
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.purchase_void",
    resource: "FoodPurchase",
    resourceId: purchaseId,
    metadata: { reason: trimmed },
  });
  revalidateInventory();
}

// ── Recálculo por cambio de receta ───────────────────────────────────

/**
 * Vuelve a calcular el consumo de insumos de las ventas desde `since` con
 * las recetas actuales y corrige la existencia por la diferencia.
 */
export async function recalculateFoodRecipeUsage(since: string) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const sinceDate = new Date(since);
  if (!since || Number.isNaN(sinceDate.getTime())) throw new UserError("Fecha inválida");
  if (sinceDate.getTime() > Date.now()) throw new UserError("La fecha no puede ser futura");

  const result = await prisma.$transaction(
    (tx) => recalculateRecipeUsage(tx, organizationId, sinceDate, { note: sinceDate.toLocaleDateString("es-MX"), userId: session.user.id }),
    { timeout: 60_000 }
  );

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.recipe_recalculate",
    resource: "FoodRecipeUsage",
    metadata: { since, ...result },
  });
  revalidateInventory();
  return result;
}

// ── Traspasos entre sucursales ───────────────────────────────────────

const transferSchema = z.object({
  /** null = la Principal. */
  fromBranchId: z.string().nullable(),
  toBranchId: z.string().nullable(),
  note: z.string().trim().max(300).optional(),
  lines: z
    .array(z.object({ itemId: z.string().min(1, "Selecciona un insumo"), quantity: z.number().finite("Cantidad inválida").positive("Cantidad debe ser mayor a 0") }))
    .min(1, "Agrega al menos un insumo")
    .max(100),
});

/**
 * Pasa existencias de una sucursal a otra (la Principal incluida): sale de una y entra a la otra en
 * la misma transacción, con el mismo batchId. Solo con inventario por sucursal encendido; el costo
 * del insumo no cambia (es general).
 */
export async function transferInventoryBetweenBranches(data: z.input<typeof transferSchema>): Promise<{ movements: number }> {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = transferSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos inválidos");
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { inventoryPerBranch: true } });
  if (!org?.inventoryPerBranch) throw new UserError("Activa el inventario por sucursal para hacer traspasos");
  const { fromBranchId, toBranchId } = parsed.data;
  if ((fromBranchId ?? null) === (toBranchId ?? null)) throw new UserError("El origen y el destino deben ser distintos");
  const from = await effectiveStockBranch(organizationId, fromBranchId);
  const to = await effectiveStockBranch(organizationId, toBranchId);
  if ((fromBranchId && !from) || (toBranchId && !to)) throw new UserError("Sucursal no encontrada");
  const ids = parsed.data.lines.map((l) => l.itemId);
  if (new Set(ids).size !== ids.length) throw new UserError("Un insumo aparece dos veces");

  const batchId = crypto.randomUUID();
  const movements = await prisma.$transaction(async (tx) => {
    const found = await tx.foodInventoryItem.count({ where: { organizationId, id: { in: ids }, isActive: true } });
    if (found !== ids.length) throw new UserError("Insumo no encontrado");
    const meta = { type: "TRANSFER" as const, batchId, userId: session.user.id, note: parsed.data.note || undefined };
    await applyStockMovements(tx, organizationId, parsed.data.lines.map((l) => ({ inventoryItemId: l.itemId, delta: -l.quantity })), { ...meta, branchId: from });
    await applyStockMovements(tx, organizationId, parsed.data.lines.map((l) => ({ inventoryItemId: l.itemId, delta: l.quantity })), { ...meta, branchId: to });
    return tx.foodInventoryMovement.count({ where: { batchId } });
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.inventory_transfer",
    resource: "FoodInventoryMovement",
    resourceId: batchId,
    metadata: { from: fromBranchId, to: toBranchId, lines: parsed.data.lines.length },
  });
  revalidateInventory();
  return { movements };
}
