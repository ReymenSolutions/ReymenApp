import type { Prisma, PlatformModule } from "@prisma/client";

/** Reconcile subscribed products atomically with the plan change. Explicit admin grants/suspensions remain authoritative. */
export async function reconcilePlanEntitlements(tx: Prisma.TransactionClient, organizationId: string, modules: PlatformModule[]) {
  const existing = await tx.organizationModule.findMany({ where: { organizationId } });
  const overrides = new Set(existing.filter(row => row.source === "ADMIN_GRANTED").map(row => row.module));
  const desired = new Set(modules);
  for (const row of existing) {
    if (row.source === "SUBSCRIBED" && !desired.has(row.module) && row.status === "ACTIVE") {
      await tx.organizationModule.update({ where: { id: row.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
    }
  }
  for (const product of desired) {
    if (overrides.has(product)) continue;
    await tx.organizationModule.upsert({
      where: { organizationId_module: { organizationId, module: product } },
      create: { organizationId, module: product, source: "SUBSCRIBED", status: "ACTIVE" },
      update: { status: "ACTIVE", suspendedAt: null, cancelledAt: null },
    });
  }
}
