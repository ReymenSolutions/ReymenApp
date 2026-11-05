"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PlatformModule, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { getPlan, getPlans, invalidatePlanCache, ORG_PLAN_SELECT, limitsFor, toPlanDef, type PlanDef } from "@/lib/plans";
import { ALL_MODULES } from "@/lib/modules";
import { setMonthlyBudget } from "@/lib/ai/budget";
import { syncSmartcardMemberLimitForPlan } from "@/lib/smartcard-link";
import { listOrgsOverAgentCap, type OverCapRow } from "@/lib/agent-cap";
import { PLAN_ACCENTS } from "@/lib/plan-accent";

// ─── Admin → Planes: el catálogo comercial se edita aquí y se actualiza en todo lo conectado ───────────────────────

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
  maxAutomationRuns: limit.optional(),
  aiBudgetMxn: money,
  maxAiAgents: limit,
  modules: z.array(z.nativeEnum(PlatformModule)).max(Object.values(PlatformModule).length),
  features: z.array(z.object({ es: z.string().trim().min(1).max(120), en: z.string().trim().min(1).max(120) })).max(14),
  stripePriceId: z.string().trim().max(120).nullable().optional(),
  accent: z.enum(PLAN_ACCENTS).default("slate"),
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
        priceMxn: d.priceMxn, maxLeads: d.maxLeads, maxUsers: d.maxUsers, maxAutomations: d.maxAutomations, maxAutomationRuns: d.maxAutomationRuns,
        aiBudgetMxn: d.aiBudgetMxn, maxAiAgents: d.maxAiAgents, modules: d.modules, features: d.features,
        stripePriceId: d.stripePriceId || null, accent: d.accent, sortOrder: d.sortOrder, isActive: d.isActive,
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
        maxLeads: d.maxLeads, maxUsers: d.maxUsers, maxAutomations: d.maxAutomations, maxAutomationRuns: d.maxAutomationRuns, aiBudgetMxn: d.aiBudgetMxn, maxAiAgents: d.maxAiAgents,
        modules: d.modules, features: d.features, stripePriceId: d.stripePriceId || null, accent: d.accent, sortOrder: d.sortOrder, isActive: d.isActive, updatedById: session.user.id,
      },
    });
    await tx.planRevision.create({ data: { planId: row.id, version: row.version, snapshot: snapshotOf(toPlanDef(row)), changedById: session.user.id } });
    return row;
  });
  await logAudit({ userId: session.user.id, action: "plan.create", resource: "Plan", resourceId: created.id, metadata: { key: data.key, name: d.name, priceMxn: d.priceMxn } });
  propagate();
  return { success: true, key: data.key };
}

export type CustomPlanClient = {
  id: string;
  name: string;
  plan: string;
  planName: string;
  /** true = plan «A la medida» completo (módulos y límites propios); false = solo precio pactado sobre su plan. */
  customPlan: boolean;
  priceMxn: number;
  listPriceMxn: number;
  modules: PlatformModule[];
  limits: { leads: number | null; users: number | null; automations: number | null; aiAgents: number | null };
};

/** Clientes «A la medida» y los que solo tienen precio pactado sobre un plan: lo que pagan, su plan base, módulos y límites. */
export async function listCustomPlanClients(): Promise<CustomPlanClient[]> {
  await requireAdmin();
  const [orgs, plans] = await Promise.all([
    prisma.organization.findMany({
      where: { isActive: true, OR: [{ customPlan: true }, { customMonthlyPriceMxn: { not: null } }] },
      select: { id: true, name: true, customMonthlyPriceMxn: true, ...ORG_PLAN_SELECT, modules: { where: { status: "ACTIVE" }, select: { module: true } } },
      orderBy: { name: "asc" },
    }),
    getPlans({ includeInactive: true }),
  ]);
  return Promise.all(orgs.map(async (o) => {
    const plan = plans.find((p) => p.key === o.plan) ?? (await getPlan(o.plan));
    const l = limitsFor(o, plan);
    return {
      id: o.id, name: o.name, plan: o.plan, planName: plan.name, customPlan: o.customPlan,
      priceMxn: o.customMonthlyPriceMxn !== null ? Number(o.customMonthlyPriceMxn) : plan.priceMxn, listPriceMxn: plan.priceMxn,
      modules: o.modules.map((m) => m.module), limits: { leads: l.leads, users: l.users, automations: l.automations, aiAgents: l.aiAgents },
    };
  }));
}

/** Clientes activos para elegir a quién darle un plan «A la medida». */
export async function listClientsForCustomPlan(): Promise<{ id: string; name: string; customPlan: boolean }[]> {
  await requireAdmin();
  return prisma.organization.findMany({ where: { isActive: true }, select: { id: true, name: true, customPlan: true }, orderBy: { name: "asc" } });
}

export type CustomPlanState = {
  orgId: string;
  name: string;
  customPlan: boolean;
  basePlan: string;
  priceMxn: number | null;
  aiBudgetMxn: number;
  modules: PlatformModule[];
  limits: { leads: number | null; users: number | null; automations: number | null; aiAgents: number | null };
};

/** Cómo está hoy un cliente, para abrir el editor «A la medida» con sus valores (o los de su plan, si aún no es a la medida). */
export async function getCustomPlanState(orgId: string): Promise<CustomPlanState> {
  await requireAdmin();
  const org = await prisma.organization.findUnique({
    where: { id: z.string().min(1).parse(orgId) },
    select: { id: true, name: true, customMonthlyPriceMxn: true, ...ORG_PLAN_SELECT, aiBudgetSetting: { select: { monthlyBudgetMxn: true } }, modules: { where: { status: "ACTIVE" }, select: { module: true } } },
  });
  if (!org) throw new UserError("Cliente no encontrado");
  const plan = await getPlan(org.plan);
  const l = limitsFor(org, plan);
  return {
    orgId: org.id, name: org.name, customPlan: org.customPlan, basePlan: org.plan,
    priceMxn: org.customMonthlyPriceMxn !== null ? Number(org.customMonthlyPriceMxn) : null,
    aiBudgetMxn: org.aiBudgetSetting?.monthlyBudgetMxn != null ? Number(org.aiBudgetSetting.monthlyBudgetMxn) : plan.aiBudgetMxn,
    modules: org.modules.map((m) => m.module),
    limits: { leads: l.leads, users: l.users, automations: l.automations, aiAgents: l.aiAgents },
  };
}

const count = (max: number) => z.number().int().min(0).max(max).nullable();
const customPlanSchema = z.object({
  orgId: z.string().min(1),
  basePlan: z.string().min(1),
  priceMxn: z.number().positive().max(1_000_000),
  aiBudgetMxn: z.number().min(0).max(1_000_000),
  modules: z.array(z.enum(ALL_MODULES as [PlatformModule, ...PlatformModule[]])).max(ALL_MODULES.length),
  limits: z.object({ leads: count(10_000_000), users: count(10_000), automations: count(10_000), aiAgents: count(100) }),
});
export type CustomPlanInput = z.input<typeof customPlanSchema>;

/**
 * Guarda el plan «A la medida» de un cliente: precio pactado, plan base (referencia de facturación), presupuesto de IA,
 * límites propios (null = ilimitado) y módulos. Encender un módulo lo activa; apagar uno activo lo cancela (se conserva su
 * historial y se puede volver a encender). Nunca borra datos ni apaga agentes ya activos: si un límite queda por debajo de lo
 * que el cliente ya usa, conserva lo que tiene pero no puede crear más.
 */
export async function saveCustomPlan(input: CustomPlanInput) {
  const session = await requireAdmin();
  const parsed = customPlanSchema.safeParse(input);
  if (!parsed.success) throw new UserError("Revisa el precio, el presupuesto y las cantidades");
  const d = parsed.data;
  const modules = new Set(d.modules);
  if (modules.has("REYMEN_POS") && !modules.has("FOOD_OPS")) throw new UserError("Reymen POS necesita Reymen Foods encendido");

  const catalog = await getPlans({ includeInactive: true });
  const org = await prisma.organization.findUnique({ where: { id: d.orgId }, select: { id: true, plan: true, customPlan: true, customMonthlyPriceMxn: true } });
  if (!org) throw new UserError("Cliente no encontrado");
  const base = catalog.find((p) => p.key === d.basePlan);
  if (!base || (!base.isActive && org.plan !== d.basePlan)) throw new UserError("Plan base inválido");
  const before = await getCustomPlanState(d.orgId);

  const changedModules = await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: d.orgId },
      data: {
        plan: d.basePlan, customPlan: true, customMonthlyPriceMxn: d.priceMxn,
        customMaxLeads: d.limits.leads, customMaxUsers: d.limits.users, customMaxAutomations: d.limits.automations, customMaxAiAgents: d.limits.aiAgents,
      },
    });
    const rows = await tx.organizationModule.findMany({ where: { organizationId: d.orgId } });
    const changes: { module: PlatformModule; status: "ACTIVE" | "CANCELLED" }[] = [];
    for (const m of ALL_MODULES) {
      const row = rows.find((r) => r.module === m);
      if (modules.has(m) && row?.status !== "ACTIVE") {
        await tx.organizationModule.upsert({
          where: { organizationId_module: { organizationId: d.orgId, module: m } },
          create: { organizationId: d.orgId, module: m, status: "ACTIVE", source: "ADMIN_GRANTED", notes: "Plan A la medida" },
          update: { status: "ACTIVE", suspendedAt: null, cancelledAt: null },
        });
        changes.push({ module: m, status: "ACTIVE" });
      } else if (!modules.has(m) && row?.status === "ACTIVE") {
        await tx.organizationModule.update({ where: { id: row.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
        changes.push({ module: m, status: "CANCELLED" });
      }
    }
    return changes;
  });
  await setMonthlyBudget(d.orgId, d.aiBudgetMxn, session.user.id);
  const smartcardMemberLimit = await syncSmartcardMemberLimitForPlan(d.orgId, d.basePlan);

  await logAudit({
    userId: session.user.id, organizationId: d.orgId, action: "client.custom_plan", resource: "Organization", resourceId: d.orgId,
    metadata: { before: { customPlan: before.customPlan, basePlan: before.basePlan, priceMxn: before.priceMxn, aiBudgetMxn: before.aiBudgetMxn, limits: before.limits }, after: { basePlan: d.basePlan, priceMxn: d.priceMxn, aiBudgetMxn: d.aiBudgetMxn, limits: d.limits }, modules: changedModules, smartcardMemberLimit },
  });
  propagate();
  revalidatePath(`/admin/clients/${d.orgId}`);
  return { success: true, modulesChanged: changedModules.length };
}

/**
 * Quita el plan «A la medida»: el cliente vuelve a su plan base con su precio de lista y los límites de ese plan. Sus módulos
 * se quedan como están (se ajustan en Cliente → Módulos); el presupuesto de IA vuelve al predeterminado del plan.
 */
export async function removeCustomPlan(orgId: string) {
  const session = await requireAdmin();
  const id = z.string().min(1).parse(orgId);
  const org = await prisma.organization.findUnique({ where: { id }, select: { plan: true, customPlan: true } });
  if (!org) throw new UserError("Cliente no encontrado");
  if (!org.customPlan) return { success: true };
  await prisma.organization.update({
    where: { id },
    data: { customPlan: false, customMonthlyPriceMxn: null, customMaxLeads: null, customMaxUsers: null, customMaxAutomations: null, customMaxAiAgents: null },
  });
  await setMonthlyBudget(id, null, session.user.id);
  const smartcardMemberLimit = await syncSmartcardMemberLimitForPlan(id, org.plan);
  await logAudit({ userId: session.user.id, organizationId: id, action: "client.custom_plan_removed", resource: "Organization", resourceId: id, metadata: { basePlan: org.plan, smartcardMemberLimit } });
  propagate();
  revalidatePath(`/admin/clients/${id}`);
  return { success: true };
}

/** Clientes con más agentes IA activos que su tope (conservan lo que tienen pero no pueden activar más). */
export async function listClientsOverAgentCap(): Promise<OverCapRow[]> {
  await requireAdmin();
  return listOrgsOverAgentCap();
}
