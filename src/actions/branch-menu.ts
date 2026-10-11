"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";

async function requireManager() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "settings:manage")) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");
  return session;
}

const refresh = () => {
  revalidatePath("/portal/settings");
  revalidatePath("/portal/food/branch-menu");
};

/** Interruptor "menú por sucursal". Apagarlo no borra lo configurado: solo deja de aplicarse. */
export async function setMenuPerBranch(enabled: boolean) {
  const session = await requireManager();
  const orgId = session.user.organizationId!;
  await prisma.organization.update({ where: { id: orgId }, data: { menuPerBranch: !!enabled } });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: enabled ? "branch.menu_enable" : "branch.menu_disable", resource: "Organization", resourceId: orgId });
  refresh();
  return { success: true };
}

/**
 * Interruptor "inventario por sucursal". Encendido: la Principal conserva la existencia actual y cada
 * sucursal empieza en 0 (se llena con compras, conteos o traspasos). Apagado: todo vuelve a salir del
 * inventario general; las existencias de las sucursales se conservan pero no se usan.
 */
export async function setInventoryPerBranch(enabled: boolean) {
  const session = await requireManager();
  const orgId = session.user.organizationId!;
  await prisma.organization.update({ where: { id: orgId }, data: { inventoryPerBranch: !!enabled } });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: enabled ? "branch.inventory_enable" : "branch.inventory_disable", resource: "Organization", resourceId: orgId });
  revalidatePath("/portal/settings");
  revalidatePath("/portal/food");
  revalidatePath("/portal/food/inventory");
  return { success: true };
}

async function ownedBranch(orgId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId: orgId } });
  if (!branch) throw new UserError("Sucursal no encontrada");
  return branch;
}

/** Muestra u oculta un platillo en una sucursal. */
export async function setBranchDishAvailable(branchId: string, dishId: string, available: boolean) {
  const session = await requireManager();
  const orgId = session.user.organizationId!;
  const branch = await ownedBranch(orgId, branchId);
  const dish = await prisma.foodDish.findFirst({ where: { id: dishId, organizationId: orgId }, select: { id: true, name: true } });
  if (!dish) throw new UserError("Platillo no encontrado");
  await prisma.branchDish.upsert({
    where: { branchId_dishId: { branchId, dishId } },
    create: { organizationId: orgId, branchId, dishId, isActive: available },
    update: { isActive: available },
  });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "branch.dish_availability", resource: "BranchDish", resourceId: dishId, metadata: { branch: branch.name, dish: dish.name, available } });
  refresh();
  return { success: true };
}

const priceSchema = z.number().finite().min(0).max(1_000_000);

/** Precio propio de una variante en una sucursal; null vuelve al precio base. */
export async function setBranchVariantPrice(branchId: string, variantId: string, price: number | null) {
  const session = await requireManager();
  const orgId = session.user.organizationId!;
  const branch = await ownedBranch(orgId, branchId);
  const variant = await prisma.foodDishVariant.findFirst({ where: { id: variantId, organizationId: orgId }, select: { id: true, label: true, dish: { select: { name: true } } } });
  if (!variant) throw new UserError("Platillo no encontrado");
  if (price === null) {
    await prisma.branchVariantPrice.deleteMany({ where: { branchId, variantId } });
  } else {
    const parsed = priceSchema.safeParse(price);
    if (!parsed.success) throw new UserError("El precio no es válido");
    const rounded = Math.round(parsed.data * 100) / 100;
    await prisma.branchVariantPrice.upsert({
      where: { branchId_variantId: { branchId, variantId } },
      create: { organizationId: orgId, branchId, variantId, price: rounded },
      update: { price: rounded },
    });
  }
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "branch.variant_price", resource: "BranchVariantPrice", resourceId: variantId, metadata: { branch: branch.name, dish: variant.dish.name, variant: variant.label, price } });
  refresh();
  return { success: true };
}
