"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getPlan } from "@/lib/plans";
import type { ModuleSource, ModuleStatus, PlatformModule } from "@prisma/client";
import { requireAdmin } from "@/lib/guards";
import { ALL_MODULES, hasModule } from "@/lib/modules";
import { UserError } from "@/lib/user-error";

const setModuleSchema = z.object({
  orgId: z.string(),
  module: z.enum(ALL_MODULES as [PlatformModule, ...PlatformModule[]]),
  /** NOT_ENABLED = quitar el derecho por completo (el módulo vuelve a "sin habilitar", sin fila). */
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED", "NOT_ENABLED"]),
  source: z.enum(["SUBSCRIBED", "ADMIN_GRANTED"]),
  notes: z.string().optional(),
});

/** Grants, suspends, cancels, or removes (NOT_ENABLED) a single module for an organization. Upserts — a module with no row yet is treated as not-enabled by every guard, so this both creates a new entitlement and updates an existing one. */
export async function setOrganizationModule(
  data: z.infer<typeof setModuleSchema>
) {
  const session = await requireAdmin();

  const { orgId, module, status, source, notes } = setModuleSchema.parse(data);

  // Reymen POS manda sus ventas al módulo Food: sin Food no tendría dónde caer.
  if (module === "REYMEN_POS" && status === "ACTIVE" && !(await hasModule(orgId, "FOOD_OPS"))) {
    throw new UserError("Para activar Reymen POS primero activa Reymen Foods");
  }

  if (status === "NOT_ENABLED") {
    const existing = await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: orgId, module } } });
    if (existing) await prisma.organizationModule.delete({ where: { id: existing.id } });
    await logAudit({
      userId: session.user.id,
      organizationId: orgId,
      action: "client.module_change",
      resource: "OrganizationModule",
      resourceId: existing?.id ?? null,
      metadata: { module, status, previousStatus: existing?.status ?? null },
    });
    revalidatePath(`/admin/clients/${orgId}`);
    return { success: true };
  }

  const timestamps: { suspendedAt?: Date | null; cancelledAt?: Date | null } = {};
  if (status === "SUSPENDED") timestamps.suspendedAt = new Date();
  if (status === "CANCELLED") timestamps.cancelledAt = new Date();
  if (status === "ACTIVE") {
    timestamps.suspendedAt = null;
    timestamps.cancelledAt = null;
  }

  const entitlement = await prisma.organizationModule.upsert({
    where: { organizationId_module: { organizationId: orgId, module } },
    create: { organizationId: orgId, module, status, source, notes, ...timestamps },
    update: { status, source, notes, ...timestamps },
  });

  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.module_change",
    resource: "OrganizationModule",
    resourceId: entitlement.id,
    metadata: { module, status, source },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true };
}

/**
 * Activates whichever modules the org's current plan (Admin → Planes) includes
 * that aren't already ACTIVE — additive only. Never suspends or cancels a
 * module the org already has, even one outside the plan's list (an
 * ADMIN_GRANTED courtesy module stays exactly as it is). This is the one
 * place ModuleSource.SUBSCRIBED actually gets tied to a plan; it's always an
 * explicit admin click here, never triggered by the Stripe webhook — a plan
 * change through Stripe (checkout or the billing portal) still only updates
 * Organization.plan, same as it always has.
 */
export async function syncModulesToPlan(orgId: string) {
  const session = await requireAdmin();

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } });
  const planModules = (await getPlan(org.plan)).modules;

  const existing = await prisma.organizationModule.findMany({
    where: { organizationId: orgId, module: { in: planModules } },
  });
  const activeSet = new Set(existing.filter((m) => m.status === "ACTIVE").map((m) => m.module));
  const toActivate = planModules.filter((m) => !activeSet.has(m));

  for (const platformModule of toActivate) {
    const entitlement = await prisma.organizationModule.upsert({
      where: { organizationId_module: { organizationId: orgId, module: platformModule } },
      create: { organizationId: orgId, module: platformModule, status: "ACTIVE", source: "SUBSCRIBED" },
      update: { status: "ACTIVE", source: "SUBSCRIBED", suspendedAt: null, cancelledAt: null },
    });
    await logAudit({
      userId: session.user.id,
      organizationId: orgId,
      action: "client.module_change",
      resource: "OrganizationModule",
      resourceId: entitlement.id,
      metadata: { module: platformModule, status: "ACTIVE", source: "SUBSCRIBED", reason: "plan_sync" },
    });
  }

  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true, activatedModules: toActivate };
}

export interface ModuleEntitlementView {
  module: PlatformModule;
  status: ModuleStatus | null;
  source: ModuleSource | null;
  updatedAt: Date | null;
  notes: string | null;
}


/** Every module's current state for an org, including ones with no row yet (shown as not-enabled). */
export async function getOrganizationModules(orgId: string): Promise<ModuleEntitlementView[]> {
  // Es una acción de servidor (endpoint público): sin esta revisión cualquiera
  // podía leer los módulos de cualquier organización, notas de admin incluidas.
  await requireAdmin();

  const rows = await prisma.organizationModule.findMany({ where: { organizationId: orgId } });
  const byModule = new Map(rows.map((r) => [r.module, r]));

  return ALL_MODULES.map((module) => {
    const row = byModule.get(module);
    return {
      module,
      status: row?.status ?? null,
      source: row?.source ?? null,
      updatedAt: row?.updatedAt ?? null,
      notes: row?.notes ?? null,
    };
  });
}
