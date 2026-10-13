"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { previewPosSalesPurge, purgePosSales, purgeRange, type PosSalesPurgeSummary } from "@/lib/food-purge";
import { DEFAULT_TIMEZONE } from "@/lib/business-day";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";

/** Fechas válidas o un error para mostrar; los errores de base de datos no se muestran tal cual. */
function checkRange(from: string, to: string) {
  try {
    purgeRange(from, to, DEFAULT_TIMEZONE); // solo valida las fechas; la zona real se toma de la organización al ejecutar
  } catch (e) {
    throw new UserError((e as Error).message);
  }
}

const rangeSchema = z.object({
  orgId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Para la vista previa: cuántas ventas del POS hay en el rango (no borra nada). */
export async function previewPosSalesPurgeAction(data: z.infer<typeof rangeSchema>): Promise<PosSalesPurgeSummary> {
  await requireAdmin();
  const { orgId, from, to } = rangeSchema.parse(data);
  checkRange(from, to);
  return previewPosSalesPurge(orgId, from, to);
}

/**
 * Borra las ventas del POS del rango (ventas de prueba) y deshace su efecto
 * en inventario y conteos. Solo administradores de la plataforma; pide
 * escribir BORRAR y queda en la bitácora.
 */
export async function purgePosSalesAction(data: z.infer<typeof rangeSchema> & { confirm: string }): Promise<PosSalesPurgeSummary> {
  const session = await requireAdmin();
  const { orgId, from, to } = rangeSchema.parse(data);
  if (data.confirm !== "BORRAR") throw new UserError("Escribe BORRAR para confirmar");
  checkRange(from, to);
  const result = await purgePosSales(orgId, from, to);
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.food_pos_sales_purge",
    resource: "FoodSale",
    metadata: { from, to, sales: result.sales, grossAmount: result.grossAmount, units: result.units, recordedUnits: result.recordedUnits },
  });
  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/portal/food", "layout");
  return result;
}
