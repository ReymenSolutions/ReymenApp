"use server";

import { dayKeyFromString } from "@/lib/business-day";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { assertManualSalesAllowed } from "@/lib/modules";
import { UserError } from "@/lib/user-error";
import { normalizeFoodUnit } from "@/lib/food-units";
import { applyStockMovements, consumeRecipes } from "@/lib/food-inventory";
import { requireFoodManager } from "@/lib/guards";


// ─── FOOD OPS — Server Actions ──────────────────────────────────────
// Mismo patrón que src/actions/leads.ts (ver DOCUMENTACION_TECNICA.md §18):
// auth → module gate → validar → mutar con organizationId del lado
// servidor (nunca del formulario) → auditar → revalidatePath. Solo cubre
// Ventas, Inventario y Proveedores -- Recetas y Operación todavía no
// tienen modelo (ver el comentario en prisma/schema.prisma).

const createSaleSchema = z.object({
  occurredAt: z.string().min(1),
  channel: z.string().optional(),
  grossAmount: z.coerce.number().positive(),
  netAmount: z.coerce.number().positive(),
  notes: z.string().optional(),
});

export async function createFoodSale(formData: FormData) {
  const session = await requireFoodManager();
  await assertManualSalesAllowed(session.user.organizationId);

  const parsed = createSaleSchema.safeParse({
    occurredAt: formData.get("occurredAt"),
    channel: formData.get("channel") || undefined,
    grossAmount: formData.get("grossAmount"),
    netAmount: formData.get("netAmount"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) throw new UserError("Datos de venta inválidos");
  if (parsed.data.netAmount > parsed.data.grossAmount) {
    throw new UserError("El neto no puede ser mayor que el bruto");
  }

  const sale = await prisma.foodSale.create({
    data: {
      organizationId: session.user.organizationId,
      occurredAt: new Date(parsed.data.occurredAt),
      channel: parsed.data.channel ?? null,
      grossAmount: parsed.data.grossAmount,
      netAmount: parsed.data.netAmount,
      notes: parsed.data.notes ?? null,
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.sale_create",
    resource: "FoodSale",
    resourceId: sale.id,
    metadata: { grossAmount: parsed.data.grossAmount, channel: parsed.data.channel ?? null },
  });

  revalidatePath("/portal/food/sales");
  revalidatePath("/portal/food");
}

/** Busca una venta manual de la organización; las del POS se corrigen cancelando en el POS. */
async function findManualSale(saleId: string, organizationId: string) {
  const sale = await prisma.foodSale.findFirst({ where: { id: saleId, organizationId }, select: { id: true, source: true } });
  if (!sale) throw new UserError("Venta no encontrada");
  if (sale.source === "POS") throw new UserError("Las ventas del POS no se editan aquí; cancélala en el POS");
  return sale;
}

export async function updateFoodSale(
  saleId: string,
  data: { occurredAt: string; channel?: string; grossAmount: number; netAmount: number; notes?: string }
) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = createSaleSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Datos de venta inválidos");
  if (parsed.data.netAmount > parsed.data.grossAmount) throw new UserError("El neto no puede ser mayor que el bruto");
  await findManualSale(saleId, organizationId);

  await prisma.foodSale.update({
    where: { id: saleId },
    data: {
      occurredAt: new Date(parsed.data.occurredAt),
      channel: parsed.data.channel?.trim() || null,
      grossAmount: parsed.data.grossAmount,
      netAmount: parsed.data.netAmount,
      notes: parsed.data.notes?.trim() || null,
    },
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.sale_update",
    resource: "FoodSale",
    resourceId: saleId,
    metadata: { grossAmount: parsed.data.grossAmount, netAmount: parsed.data.netAmount },
  });
  revalidatePath("/portal/food/sales");
  revalidatePath("/portal/food");
}

export async function deleteFoodSale(saleId: string) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  await findManualSale(saleId, organizationId);

  await prisma.foodSale.delete({ where: { id: saleId } });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.sale_delete",
    resource: "FoodSale",
    resourceId: saleId,
  });
  revalidatePath("/portal/food/sales");
  revalidatePath("/portal/food");
}

const createInventoryItemSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  category: z.enum(["EDIBLE", "NON_EDIBLE"]).default("EDIBLE"),
  currentStock: z.coerce.number().min(0),
  minStock: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0).optional(),
});

export async function createFoodInventoryItem(formData: FormData) {
  const session = await requireFoodManager();

  const parsed = createInventoryItemSchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit"),
    category: formData.get("category") || undefined,
    currentStock: formData.get("currentStock") || 0,
    minStock: formData.get("minStock") || 0,
    unitCost: formData.get("unitCost") || undefined,
  });
  if (!parsed.success) throw new UserError("Datos de insumo inválidos");
  const unit = normalizeFoodUnit(parsed.data.unit);
  if (!unit) throw new UserError("Elige una unidad de la lista");

  const organizationId = session.user.organizationId;
  const duplicate = await prisma.foodInventoryItem.findFirst({ where: { organizationId, name: parsed.data.name }, select: { id: true } });
  if (duplicate) throw new UserError("Ya existe un insumo con ese nombre");

  // Se crea en 0 y la existencia inicial entra como ajuste, para que el
  // historial de movimientos explique la existencia desde el primer día.
  // Dos envíos casi simultáneos pasan la revisión de arriba; la base los
  // detiene con su índice único (organizationId, name) y aquí se convierte en
  // el mismo aviso en vez de un error genérico.
  const item = await prisma
    .$transaction(async (tx) => {
      const created = await tx.foodInventoryItem.create({
        data: {
          organizationId,
          name: parsed.data.name,
          unit,
          category: parsed.data.category,
          currentStock: 0,
          minStock: parsed.data.minStock,
          unitCost: parsed.data.unitCost ?? null,
        },
      });
      await applyStockMovements(tx, organizationId, [{ inventoryItemId: created.id, delta: parsed.data.currentStock }], {
        type: "ADJUSTMENT",
        note: "Existencia inicial",
        userId: session.user.id,
      });
      return created;
    })
    .catch((e: unknown) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UserError("Ya existe un insumo con ese nombre");
      throw e;
    });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.inventory_item_create",
    resource: "FoodInventoryItem",
    resourceId: item.id,
    metadata: { name: item.name },
  });

  revalidatePath("/portal/food/inventory");
  revalidatePath("/portal/food");
}

const createSupplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function createFoodSupplier(formData: FormData) {
  const session = await requireFoodManager();

  const parsed = createSupplierSchema.safeParse({
    name: formData.get("name"),
    contactName: formData.get("contactName") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
  });
  if (!parsed.success) throw new UserError("Datos de proveedor inválidos");

  const supplier = await prisma.foodSupplier.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      contactName: parsed.data.contactName ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email || null,
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.supplier_create",
    resource: "FoodSupplier",
    resourceId: supplier.id,
    metadata: { name: supplier.name },
  });

  revalidatePath("/portal/food/suppliers");
  revalidatePath("/portal/food");
}

// ─── FOOD OPS — Platillos, gastos fijos y rentabilidad (Fase 2) ──────

const dishVariantIngredientSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

const dishVariantSchema = z.object({
  /** Id de la variante existente al editar: se actualiza en su lugar y conserva su historial. */
  variantId: z.string().optional(),
  label: z.string().min(1, "Nombre de variante requerido"),
  price: z.coerce.number().positive("El precio debe ser mayor a 0"),
  ingredients: z.array(dishVariantIngredientSchema).min(1, "Agrega al menos un insumo"),
});

const dishSchema = z
  .object({
    name: z.string().min(1, "Nombre requerido"),
    categoryId: z.string().nullable().optional(),
    modifierGroupIds: z.array(z.string()).optional(),
    variants: z.array(dishVariantSchema).min(1, "Agrega al menos una variante"),
  })
  .refine((data) => new Set(data.variants.map((v) => v.label.trim().toLowerCase())).size === data.variants.length, {
    message: "Los nombres de las variantes deben ser distintos",
    path: ["variants"],
  });

type DishInput = {
  name: string;
  categoryId?: string | null;
  modifierGroupIds?: string[];
  variants: { variantId?: string; label: string; price: number; ingredients: { inventoryItemId: string; quantity: number }[] }[];
};

/** Todos los insumos usados en recetas deben ser de esta organización. */
async function assertInventoryItemsOwnedByOrg(organizationId: string, itemIds: string[]) {
  const unique = [...new Set(itemIds)];
  if (unique.length === 0) return;
  const owned = await prisma.foodInventoryItem.count({ where: { id: { in: unique }, organizationId } });
  if (owned !== unique.length) throw new UserError("Uno o más insumos no son válidos");
}

/**
 * Empareja lo que llega del formulario con lo que ya existe: primero por id,
 * luego por nombre. Lo emparejado se actualiza en su lugar -- conserva su id,
 * que es el que usa el POS y el que ata ventas y consumos --; lo demás se crea.
 */
function matchExisting<T extends { name: string; id?: string }>(incoming: T[], existing: { id: string; name: string }[]) {
  const byId = new Set(existing.map((e) => e.id));
  const used = new Set<string>();
  const targets: (string | undefined)[] = incoming.map((i) => {
    if (i.id && byId.has(i.id) && !used.has(i.id)) {
      used.add(i.id);
      return i.id;
    }
    return undefined;
  });
  incoming.forEach((i, idx) => {
    if (targets[idx]) return;
    const match = existing.find((e) => !used.has(e.id) && e.name.trim().toLowerCase() === i.name.trim().toLowerCase());
    if (match) {
      used.add(match.id);
      targets[idx] = match.id;
    }
  });
  return { targets, keep: [...used] };
}

/** Confirma que categoryId (si viene) y todos los modifierGroupIds pertenecen a esta organización. */
async function assertDishRefsOwnedByOrg(organizationId: string, categoryId?: string | null, modifierGroupIds?: string[]) {
  if (categoryId) {
    const category = await prisma.foodDishCategory.findFirst({ where: { id: categoryId, organizationId } });
    if (!category) throw new UserError("Categoría no encontrada");
  }
  if (modifierGroupIds && modifierGroupIds.length > 0) {
    const owned = await prisma.foodModifierGroup.count({ where: { id: { in: modifierGroupIds }, organizationId, isActive: true } });
    if (owned !== new Set(modifierGroupIds).size) throw new UserError("Uno o más grupos de modificadores no son válidos");
  }
}

export async function createFoodDish(data: DishInput) {
  const session = await requireFoodManager();

  const parsed = dishSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos de platillo inválidos");

  const existing = await prisma.foodDish.findUnique({
    where: { organizationId_name: { organizationId: session.user.organizationId, name: parsed.data.name } },
  });
  if (existing) throw new UserError("Ya existe un platillo con ese nombre");

  await assertDishRefsOwnedByOrg(session.user.organizationId, parsed.data.categoryId, parsed.data.modifierGroupIds);
  await assertInventoryItemsOwnedByOrg(session.user.organizationId, parsed.data.variants.flatMap((v) => v.ingredients.map((i) => i.inventoryItemId)));

  const dish = await prisma.foodDish.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      categoryId: parsed.data.categoryId || null,
      variants: {
        create: parsed.data.variants.map((v) => ({
          organizationId: session.user.organizationId!,
          label: v.label,
          price: v.price,
          ingredients: { create: v.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity })) },
        })),
      },
      modifierGroups: {
        create: (parsed.data.modifierGroupIds ?? []).map((groupId) => ({ groupId })),
      },
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_create",
    resource: "FoodDish",
    resourceId: dish.id,
    metadata: { name: dish.name, variants: parsed.data.variants.length },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function updateFoodDish(dishId: string, data: DishInput) {
  const session = await requireFoodManager();

  const parsed = dishSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos de platillo inválidos");

  const dish = await prisma.foodDish.findFirst({ where: { id: dishId, organizationId: session.user.organizationId } });
  if (!dish) throw new UserError("Platillo no encontrado");

  await assertDishRefsOwnedByOrg(session.user.organizationId, parsed.data.categoryId, parsed.data.modifierGroupIds);

  const organizationId = session.user.organizationId;
  await assertInventoryItemsOwnedByOrg(organizationId, parsed.data.variants.flatMap((v) => v.ingredients.map((i) => i.inventoryItemId)));

  // Las variantes se actualizan en su lugar (no se borran y recrean): su id
  // es el que el POS manda en cada venta y el que ata el historial de ventas
  // y de consumo de insumos, que se perdían en cada edición.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.foodDishVariant.findMany({ where: { dishId }, select: { id: true, label: true } });
    const { targets, keep } = matchExisting(
      parsed.data.variants.map((v) => ({ id: v.variantId, name: v.label })),
      existing.map((v) => ({ id: v.id, name: v.label }))
    );
    // Lo que se quitó del formulario: se borra si nunca se vendió; si ya tiene
    // ventas o consumo registrado se desactiva, para no perder ese historial.
    const removed = existing.filter((v) => !keep.includes(v.id));
    const incomingLabels = new Set(parsed.data.variants.map((v) => v.label.trim().toLowerCase()));
    for (const v of removed) {
      const [sales, usages] = await Promise.all([
        tx.foodDishSale.count({ where: { variantId: v.id } }),
        tx.foodRecipeUsage.count({ where: { variantId: v.id } }),
      ]);
      if (sales === 0 && usages === 0) {
        await tx.foodDishVariant.delete({ where: { id: v.id } });
      } else {
        // Si su nombre lo ocupa ahora otra variante, se le cambia para no chocar con @@unique([dishId, label]).
        const label = incomingLabels.has(v.label.trim().toLowerCase()) ? `${v.label} (anterior ${v.id.slice(-4)})` : v.label;
        await tx.foodDishVariant.update({ where: { id: v.id }, data: { isActive: false, label } });
      }
    }
    // Nombre temporal para poder intercambiar nombres sin chocar con @@unique([dishId, label]).
    for (const id of keep) await tx.foodDishVariant.update({ where: { id }, data: { label: `__${id}` } });

    for (const [idx, v] of parsed.data.variants.entries()) {
      const ingredients = v.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity }));
      const target = targets[idx];
      if (target) {
        await tx.foodDishVariantIngredient.deleteMany({ where: { variantId: target } });
        await tx.foodDishVariant.update({
          where: { id: target },
          // Volver a agregar una variante desactivada (mismo nombre) la reactiva.
          data: { label: v.label, price: v.price, isActive: true, ingredients: { create: ingredients } },
        });
      } else {
        await tx.foodDishVariant.create({
          data: { dishId, organizationId, label: v.label, price: v.price, ingredients: { create: ingredients } },
        });
      }
    }

    await tx.foodDishModifierGroup.deleteMany({ where: { dishId } });
    await tx.foodDish.update({
      where: { id: dishId },
      data: {
        name: parsed.data.name,
        categoryId: parsed.data.categoryId || null,
        modifierGroups: { create: (parsed.data.modifierGroupIds ?? []).map((groupId) => ({ groupId })) },
      },
    });
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_update",
    resource: "FoodDish",
    resourceId: dishId,
    metadata: { name: parsed.data.name, variants: parsed.data.variants.length },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function toggleFoodDishActive(dishId: string, isActive: boolean) {
  const session = await requireFoodManager();

  const dish = await prisma.foodDish.findFirst({ where: { id: dishId, organizationId: session.user.organizationId } });
  if (!dish) throw new UserError("Platillo no encontrado");

  await prisma.foodDish.update({ where: { id: dishId }, data: { isActive } });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: isActive ? "food.dish_activate" : "food.dish_deactivate",
    resource: "FoodDish",
    resourceId: dishId,
    metadata: { name: dish.name },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

// ─── FOOD OPS — Categorías de menú (Fase 17) ─────────────────────────

const dishCategorySchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  sortOrder: z.coerce.number().int().optional(),
});

export async function createFoodDishCategory(data: { name: string; sortOrder?: number }) {
  const session = await requireFoodManager();

  const parsed = dishCategorySchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos de categoría inválidos");

  const existing = await prisma.foodDishCategory.findUnique({
    where: { organizationId_name: { organizationId: session.user.organizationId, name: parsed.data.name } },
  });
  if (existing) throw new UserError("Ya existe una categoría con ese nombre");

  const category = await prisma.foodDishCategory.create({
    data: { organizationId: session.user.organizationId, name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? 0 },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_category_create",
    resource: "FoodDishCategory",
    resourceId: category.id,
    metadata: { name: category.name },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

export async function updateFoodDishCategory(categoryId: string, data: { name: string; sortOrder?: number }) {
  const session = await requireFoodManager();

  const parsed = dishCategorySchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos de categoría inválidos");

  const category = await prisma.foodDishCategory.findFirst({ where: { id: categoryId, organizationId: session.user.organizationId } });
  if (!category) throw new UserError("Categoría no encontrada");

  await prisma.foodDishCategory.update({
    where: { id: categoryId },
    data: { name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? category.sortOrder },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_category_update",
    resource: "FoodDishCategory",
    resourceId: categoryId,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

/** Borra la categoría -- los platillos que la tenían quedan sin categoría (onDelete: SetNull), nunca se borran. */
export async function deleteFoodDishCategory(categoryId: string) {
  const session = await requireFoodManager();

  const category = await prisma.foodDishCategory.findFirst({ where: { id: categoryId, organizationId: session.user.organizationId } });
  if (!category) throw new UserError("Categoría no encontrada");

  await prisma.foodDishCategory.delete({ where: { id: categoryId } });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_category_delete",
    resource: "FoodDishCategory",
    resourceId: categoryId,
    metadata: { name: category.name },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

// ─── FOOD OPS — Grupos de modificadores (Fase 17) ────────────────────

const modifierOptionSchema = z.object({
  /** Id de la opción existente al editar: se actualiza en su lugar. */
  optionId: z.string().optional(),
  name: z.string().min(1, "Nombre de opción requerido"),
  priceDelta: z.coerce.number().min(0, "El precio adicional no puede ser negativo"),
  // Mini-receta por unidad del platillo; negativa para "Sin ..." (devuelve insumo).
  ingredients: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1, "Selecciona un insumo"),
        quantity: z.coerce.number().refine((n) => Number.isFinite(n) && n !== 0, "La cantidad no puede ser 0"),
      })
    )
    .default([])
    .refine((list) => new Set(list.map((i) => i.inventoryItemId)).size === list.length, "Un insumo aparece dos veces en la opción"),
});

const modifierGroupSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  minSelect: z.coerce.number().int().min(0),
  maxSelect: z.coerce.number().int().min(1),
  options: z.array(modifierOptionSchema).min(1, "Agrega al menos una opción"),
});

type ModifierGroupInput = {
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { optionId?: string; name: string; priceDelta: number; ingredients?: { inventoryItemId: string; quantity: number }[] }[];
};

function optionIngredients(o: { ingredients: { inventoryItemId: string; quantity: number }[] }) {
  return o.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity }));
}

export async function createFoodModifierGroup(data: ModifierGroupInput) {
  const session = await requireFoodManager();

  const parsed = modifierGroupSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos de modificador inválidos");
  if (parsed.data.minSelect > parsed.data.maxSelect) throw new UserError("El mínimo no puede ser mayor al máximo");

  const existing = await prisma.foodModifierGroup.findUnique({
    where: { organizationId_name: { organizationId: session.user.organizationId, name: parsed.data.name } },
  });
  if (existing) throw new UserError("Ya existe un grupo de modificadores con ese nombre");
  await assertInventoryItemsOwnedByOrg(session.user.organizationId, parsed.data.options.flatMap((o) => o.ingredients.map((i) => i.inventoryItemId)));

  const group = await prisma.foodModifierGroup.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      minSelect: parsed.data.minSelect,
      maxSelect: parsed.data.maxSelect,
      options: {
        create: parsed.data.options.map((o, idx) => ({
          name: o.name,
          priceDelta: o.priceDelta,
          sortOrder: idx,
          ingredients: { create: optionIngredients(o) },
        })),
      },
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.modifier_group_create",
    resource: "FoodModifierGroup",
    resourceId: group.id,
    metadata: { name: group.name, options: parsed.data.options.length },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

export async function updateFoodModifierGroup(groupId: string, data: ModifierGroupInput) {
  const session = await requireFoodManager();

  const parsed = modifierGroupSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos de modificador inválidos");
  if (parsed.data.minSelect > parsed.data.maxSelect) throw new UserError("El mínimo no puede ser mayor al máximo");

  const group = await prisma.foodModifierGroup.findFirst({ where: { id: groupId, organizationId: session.user.organizationId, isActive: true } });
  if (!group) throw new UserError("Grupo de modificadores no encontrado");

  await assertInventoryItemsOwnedByOrg(session.user.organizationId, parsed.data.options.flatMap((o) => o.ingredients.map((i) => i.inventoryItemId)));

  // Opciones en su lugar, igual que las variantes de un platillo: su id es el
  // que el POS manda con cada venta y el que ata el consumo de insumos.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.foodModifierOption.findMany({ where: { groupId }, select: { id: true, name: true } });
    const { targets, keep } = matchExisting(
      parsed.data.options.map((o) => ({ id: o.optionId, name: o.name })),
      existing
    );
    // Igual que con las variantes: con ventas o consumo se desactiva, sin ellos se borra.
    for (const o of existing.filter((e) => !keep.includes(e.id))) {
      const [sales, usages] = await Promise.all([
        tx.foodModifierOptionSale.count({ where: { optionId: o.id } }),
        tx.foodRecipeUsage.count({ where: { modifierOptionId: o.id } }),
      ]);
      if (sales === 0 && usages === 0) await tx.foodModifierOption.delete({ where: { id: o.id } });
      else await tx.foodModifierOption.update({ where: { id: o.id }, data: { isActive: false } });
    }
    for (const [idx, o] of parsed.data.options.entries()) {
      const target = targets[idx];
      if (target) {
        await tx.foodModifierOptionIngredient.deleteMany({ where: { optionId: target } });
        await tx.foodModifierOption.update({
          where: { id: target },
          data: { name: o.name, priceDelta: o.priceDelta, sortOrder: idx, isActive: true, ingredients: { create: optionIngredients(o) } },
        });
      } else {
        await tx.foodModifierOption.create({
          data: { groupId, name: o.name, priceDelta: o.priceDelta, sortOrder: idx, ingredients: { create: optionIngredients(o) } },
        });
      }
    }
    await tx.foodModifierGroup.update({
      where: { id: groupId },
      data: { name: parsed.data.name, minSelect: parsed.data.minSelect, maxSelect: parsed.data.maxSelect },
    });
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.modifier_group_update",
    resource: "FoodModifierGroup",
    resourceId: groupId,
    metadata: { name: parsed.data.name, options: parsed.data.options.length },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

/**
 * Elimina el grupo: se desvincula de los platillos que lo tenían. Si alguna
 * de sus opciones ya se vendió (o descontó insumos), el grupo se desactiva
 * en vez de borrarse, para conservar sus opciones y su historial; su nombre
 * se libera para poder crear otro igual.
 */
export async function deleteFoodModifierGroup(groupId: string) {
  const session = await requireFoodManager();

  const group = await prisma.foodModifierGroup.findFirst({
    where: { id: groupId, organizationId: session.user.organizationId, isActive: true },
    include: { options: { select: { id: true } } },
  });
  if (!group) throw new UserError("Grupo de modificadores no encontrado");

  const optionIds = group.options.map((o) => o.id);
  const [sales, usages] = await Promise.all([
    prisma.foodModifierOptionSale.count({ where: { optionId: { in: optionIds } } }),
    prisma.foodRecipeUsage.count({ where: { modifierOptionId: { in: optionIds } } }),
  ]);
  const archived = sales > 0 || usages > 0;

  if (archived) {
    await prisma.$transaction([
      prisma.foodDishModifierGroup.deleteMany({ where: { groupId } }),
      prisma.foodModifierGroup.update({
        where: { id: groupId },
        data: { isActive: false, name: `${group.name} (anterior ${groupId.slice(-4)})` },
      }),
    ]);
  } else {
    await prisma.foodModifierGroup.delete({ where: { id: groupId } });
  }

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: archived ? "food.modifier_group_archive" : "food.modifier_group_delete",
    resource: "FoodModifierGroup",
    resourceId: groupId,
    metadata: { name: group.name },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

const operatingCostSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  amountMonthly: z.coerce.number().positive("El monto debe ser mayor a 0"),
});

export async function createFoodOperatingCost(data: { name: string; amountMonthly: number }) {
  const session = await requireFoodManager();

  const parsed = operatingCostSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos de gasto inválidos");

  const cost = await prisma.foodOperatingCost.create({
    data: { organizationId: session.user.organizationId, name: parsed.data.name, amountMonthly: parsed.data.amountMonthly },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.operating_cost_create",
    resource: "FoodOperatingCost",
    resourceId: cost.id,
    metadata: { name: cost.name, amountMonthly: parsed.data.amountMonthly },
  });

  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function updateFoodOperatingCost(costId: string, data: { name: string; amountMonthly: number }) {
  const session = await requireFoodManager();

  const parsed = operatingCostSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos de gasto inválidos");

  const cost = await prisma.foodOperatingCost.findFirst({ where: { id: costId, organizationId: session.user.organizationId } });
  if (!cost) throw new UserError("Gasto no encontrado");

  await prisma.foodOperatingCost.update({
    where: { id: costId },
    data: { name: parsed.data.name, amountMonthly: parsed.data.amountMonthly },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.operating_cost_update",
    resource: "FoodOperatingCost",
    resourceId: costId,
    metadata: { name: parsed.data.name, amountMonthly: parsed.data.amountMonthly },
  });

  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function toggleFoodOperatingCostActive(costId: string, isActive: boolean) {
  const session = await requireFoodManager();

  const cost = await prisma.foodOperatingCost.findFirst({ where: { id: costId, organizationId: session.user.organizationId } });
  if (!cost) throw new UserError("Gasto no encontrado");

  await prisma.foodOperatingCost.update({ where: { id: costId }, data: { isActive } });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: isActive ? "food.operating_cost_activate" : "food.operating_cost_deactivate",
    resource: "FoodOperatingCost",
    resourceId: costId,
    metadata: { name: cost.name },
  });

  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

const dishSaleEntrySchema = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().min(0),
});

const logDishSalesSchema = z.object({
  date: z.string().min(1),
  entries: z.array(dishSaleEntrySchema),
});

/**
 * Guarda "cuántas unidades de cada variante se vendieron" para UN día de
 * negocio. Volver a guardar para la misma variante/día REEMPLAZA la
 * cantidad (no la suma) -- así se puede corregir un error de captura sin
 * duplicar el conteo. Entradas con quantity=0 se guardan igual (permite
 * "hoy no vendí nada de esta variante" como dato real, no como omisión).
 */
export async function logFoodDishSales(data: { date: string; entries: { variantId: string; quantity: number }[] }) {
  const session = await requireFoodManager();
  await assertManualSalesAllowed(session.user.organizationId);

  const parsed = logDishSalesSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Datos de venta por platillo inválidos");
  if (parsed.data.entries.length === 0) return;

  const organizationId = session.user.organizationId;
  // La fecha capturada ES el día de negocio: su clave es esa misma fecha a las 00:00 UTC (ver business-day.ts).
  const occurredAt = dayKeyFromString(parsed.data.date.slice(0, 10));

  const variantIds = parsed.data.entries.map((e) => e.variantId);
  const ownedCount = await prisma.foodDishVariant.count({ where: { id: { in: variantIds }, dish: { organizationId } } });
  if (ownedCount !== new Set(variantIds).size) throw new UserError("Una o más variantes no son válidas");

  await prisma.$transaction(async (tx) => {
    // Esta captura REEMPLAZA la cantidad del día, así que al inventario solo
    // se le aplica la diferencia contra lo que ya estaba guardado.
    const previous = await tx.foodDishSale.findMany({
      where: { variantId: { in: variantIds }, occurredAt },
      select: { variantId: true, quantity: true },
    });
    const previousByVariant = new Map(previous.map((p) => [p.variantId, p.quantity]));
    for (const entry of parsed.data.entries) {
      await tx.foodDishSale.upsert({
        where: { variantId_occurredAt: { variantId: entry.variantId, occurredAt } },
        update: { quantity: entry.quantity },
        create: { organizationId, variantId: entry.variantId, occurredAt, quantity: entry.quantity },
      });
    }
    const changes = parsed.data.entries
      .map((e) => ({ variantId: e.variantId, quantity: e.quantity - (previousByVariant.get(e.variantId) ?? 0) }))
      .filter((c) => c.quantity !== 0);
    await consumeRecipes(tx, organizationId, { variants: changes }, {
      type: "MANUAL_DISH_SALES",
      occurredAt,
      note: parsed.data.date,
      userId: session.user.id,
    });
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.dish_sales_log",
    resource: "FoodDishSale",
    metadata: { date: parsed.data.date, variantCount: parsed.data.entries.length },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function updateFoodTargetCostPct(pct: number) {
  const session = await requireFoodManager();

  const parsed = z.coerce.number().int().min(1).max(90).safeParse(pct);
  if (!parsed.success) throw new UserError("El % objetivo debe estar entre 1 y 90");

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { foodTargetCostPct: parsed.data },
  });

  revalidatePath("/portal/food/profitability");
}
