"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { getPlans, invalidatePlanCache, toPlanDef, type PlanDef } from "@/lib/plans";

// ─── Admin → Planes: el catálogo comercial se edita aquí y se actualiza en todo lo conectado ───────────────────────

const MODULES = ["CRM", "AI_WHATSAPP", "AUTOMATIONS", "NFC_QR", "MARKETING_ADS", "FOOD_OPS", "REYMEN_POS"] as const;
const limit = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().min(0).max(10_000_000).nullable());
const money = z.coerce.number().min(0).max(1_000_000);

const planFields = z.object({
  name: z.string().trim().min(1).max(40),
  nameEn: z.string().trim().min(1).max(40),
  description: z.string().trim().max(300).default(""),
  descriptionEn: z.string().trim().max(300).default(""),
  priceMxn: money,
  maxLeads: limit,
  maxUsers: limit,
  maxAutomations: limit,
  aiBudgetMxn: money,
  maxAiAgents: limit,
  modules: z.array(z.enum(MODULES)).max(MODULES.length),
  features: z.array(z.object({ es: z.string().trim().min(1).max(120), en: z.string().trim().min(1).max(120) })).max(14),
  stripePriceId: z.string().trim().max(120).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});
export type PlanInput = z.input<typeof planFields>;

const KEY = /^[a-z][a-z0-9_-]{1,29}$/;

const PROPAGATES = ["/admin/plans", "/admin/clients", "/admin/metrics", "/admin/ai", "/portal/settings", "/portal/reports"];
function propagate() {
  invalidatePlanCache();
  for (const path of PROPAGATES) revalidatePath(path);
  revalidatePath("/admin/clients/[clientId]", "page");
}

export type PlanRow = PlanDef & { clients: number; revisions: { version: number; createdAt: Date; changedBy: string | null }[] };

/** Todos los planes (también los retirados) con cuántos clientes tiene cada uno y su historial de cambios. */
export async function listPlansForAdmin(): Promise<PlanRow[]> {
  await requireAdmin();
  const [plans, counts, revisions] = await Promise.all([
    getPlans({ includeInactive: true }),
    prisma.organization.groupBy({ by: ["plan"], _count: { id: true } }),
    prisma.planRevision.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { plan: { select: { key: true } } } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: revisions.map((r) => r.changedById).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const who = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  return plans.map((p) => ({
    ...p,
    clients: counts.find((c) => c.plan === p.key)?._count.id ?? 0,
    revisions: revisions.filter((r) => r.plan.key === p.key).slice(0, 5).map((r) => ({ version: r.version, createdAt: r.createdAt, changedBy: r.changedById ? (who.get(r.changedById) ?? null) : null })),
  }));
}

const snapshotOf = (p: PlanDef) => JSON.parse(JSON.stringify(p)) as Prisma.InputJsonValue;

/**
 * Edita un plan. El cambio aplica de inmediato a todos los clientes de ese plan (límites, precio de lista, presupuesto de IA,
 * "qué incluye", módulos…). Los precios pactados con un cliente (plan personalizado) no se tocan. Cada edición sube la versión,
 * guarda cómo quedó el plan y queda en la bitácora con el antes y el después.
 */
export async function updatePlan(key: string, data: PlanInput) {
  const session = await requireAdmin();
  const parsed = planFields.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los datos del plan");
  const d = parsed.data;

  const existing = await prisma.plan.findUnique({ where: { key } });
  if (!existing) throw new UserError("Plan no encontrado");
  if (!d.isActive && existing.isActive) {
    const otherActive = await prisma.plan.count({ where: { isActive: true, NOT: { key } } });
    if (otherActive === 0) throw new UserError("Debe quedar al menos un plan activo");
  }
  const before = toPlanDef(existing);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.plan.update({
      where: { key },
      data: {
        name: d.name, nameEn: d.nameEn, description: d.description, descriptionEn: d.descriptionEn,
        priceMxn: d.priceMxn, maxLeads: d.maxLeads, maxUsers: d.maxUsers, maxAutomations: d.maxAutomations,
        aiBudgetMxn: d.aiBudgetMxn, maxAiAgents: d.maxAiAgents, modules: d.modules, features: d.features,
        stripePriceId: d.stripePriceId || null, sortOrder: d.sortOrder, isActive: d.isActive,
        version: { increment: 1 }, updatedById: session.user.id,
      },
    });
    await tx.planRevision.create({ data: { planId: row.id, version: row.version, snapshot: snapshotOf(toPlanDef(row)), changedById: session.user.id } });
    return row;
  });
  const after = toPlanDef(updated);
  const changed = (Object.keys(after) as (keyof PlanDef)[]).filter((k) => k !== "version" && JSON.stringify(after[k]) !== JSON.stringify(before[k]));
  await logAudit({ userId: session.user.id, action: "plan.update", resource: "Plan", resourceId: updated.id, metadata: { key, version: updated.version, changes: Object.fromEntries(changed.map((k) => [k, { from: before[k], to: after[k] }])) } });
  propagate();
  return { success: true, version: updated.version, changed };
}

/** Crea un plan nuevo (una llave nueva; los clientes existentes no se tocan). */
export async function createPlan(data: PlanInput & { key: string }) {
  const session = await requireAdmin();
  if (!KEY.test(data.key ?? "")) throw new UserError("La llave del plan solo puede llevar minúsculas, números, guion y guion bajo");
  const parsed = planFields.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los datos del plan");
  const d = parsed.data;
  if (await prisma.plan.findUnique({ where: { key: data.key }, select: { id: true } })) throw new UserError("Ya existe un plan con esa llave");
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.plan.create({
      data: {
        key: data.key, name: d.name, nameEn: d.nameEn, description: d.description, descriptionEn: d.descriptionEn, priceMxn: d.priceMxn,
        maxLeads: d.maxLeads, maxUsers: d.maxUsers, maxAutomations: d.maxAutomations, aiBudgetMxn: d.aiBudgetMxn, maxAiAgents: d.maxAiAgents,
        modules: d.modules, features: d.features, stripePriceId: d.stripePriceId || null, sortOrder: d.sortOrder, isActive: d.isActive, updatedById: session.user.id,
      },
    });
    await tx.planRevision.create({ data: { planId: row.id, version: row.version, snapshot: snapshotOf(toPlanDef(row)), changedById: session.user.id } });
    return row;
  });
  await logAudit({ userId: session.user.id, action: "plan.create", resource: "Plan", resourceId: created.id, metadata: { key: data.key, name: d.name, priceMxn: d.priceMxn } });
  propagate();
  return { success: true, key: data.key };
}
