import type { Plan, PlatformModule } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Catálogo de planes ───────────────────────────────────────────────────────────────────────────────────────────
// Fuente ÚNICA de nombre, precio, límites, presupuesto de IA, módulos y "qué incluye" de cada plan; se edita en Admin → Planes.
// Todo lo que antes leía constantes de código (validación de límites, ROI, presupuesto de IA, módulos, SmartCard, Cambiar plan,
// Configuración del portal, métricas) lee de aquí. `Organization.plan` guarda la llave del plan.

export type PlanFeature = { es: string; en: string };

/** Un plan en el formato que usa la app (números en lugar de Decimal; null = ilimitado). Serializable hacia componentes de cliente. */
export type PlanDef = {
  key: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  priceMxn: number;
  limits: { leads: number | null; users: number | null; automations: number | null };
  aiBudgetMxn: number;
  /** Tope de agentes IA activos; null = sin tope. */
  maxAiAgents: number | null;
  modules: PlatformModule[];
  features: PlanFeature[];
  stripePriceId: string | null;
  /** Color de diferenciación (ver plan-accent.ts). */
  accent: string;
  sortOrder: number;
  isActive: boolean;
  version: number;
};

export type PlanResource = keyof PlanDef["limits"];

export function toPlanDef(row: Plan): PlanDef {
  const features = Array.isArray(row.features) ? (row.features as unknown[]).flatMap((f) => (f && typeof f === "object" && typeof (f as PlanFeature).es === "string" ? [{ es: (f as PlanFeature).es, en: typeof (f as PlanFeature).en === "string" ? (f as PlanFeature).en : (f as PlanFeature).es }] : [])) : [];
  return {
    key: row.key,
    name: row.name,
    nameEn: row.nameEn,
    description: row.description,
    descriptionEn: row.descriptionEn,
    priceMxn: Number(row.priceMxn),
    limits: { leads: row.maxLeads, users: row.maxUsers, automations: row.maxAutomations },
    aiBudgetMxn: Number(row.aiBudgetMxn),
    maxAiAgents: row.maxAiAgents,
    modules: row.modules,
    features,
    stripePriceId: row.stripePriceId,
    accent: row.accent,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    version: row.version,
  };
}

// Las pantallas y validaciones leen el catálogo muchas veces por petición: se guarda unos segundos en memoria y se invalida al
// editar un plan (en otra instancia del servidor el cambio llega, a más tardar, al vencer este tiempo).
const TTL_MS = 15_000;
let cache: { at: number; plans: PlanDef[] } | null = null;

export function invalidatePlanCache() {
  cache = null;
}

/** Todos los planes en su orden (por defecto solo los activos; `includeInactive` también los retirados). */
export async function getPlans(opts: { includeInactive?: boolean } = {}): Promise<PlanDef[]> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const rows = await prisma.plan.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    cache = { at: Date.now(), plans: rows.map(toPlanDef) };
  }
  return opts.includeInactive ? cache.plans : cache.plans.filter((p) => p.isActive);
}

/**
 * El plan de una llave. Una llave que ya no existe se trata como el plan de entrada (Starter), igual que antes: un cliente nunca
 * se queda sin plan por un dato viejo. Un plan inactivo sigue valiendo para quienes ya lo tienen.
 */
export async function getPlan(key: string): Promise<PlanDef> {
  const all = await getPlans({ includeInactive: true });
  const found = all.find((p) => p.key === key) ?? all.find((p) => p.key === "starter") ?? all[0];
  if (!found) throw new Error("plan_catalog_empty");
  return found;
}

export const planName = (plan: Pick<PlanDef, "name" | "nameEn">, lang: string) => (lang === "en" && plan.nameEn ? plan.nameEn : plan.name);
export const planDescription = (plan: Pick<PlanDef, "description" | "descriptionEn">, lang: string) => (lang === "en" && plan.descriptionEn ? plan.descriptionEn : plan.description);

/** Precio mensual en MXN de una organización: el pactado con ella si lo hay, si no el de lista de su plan. */
export function monthlyPriceMxn(plan: Pick<PlanDef, "priceMxn">, customMonthlyPriceMxn: number | null): number {
  return customMonthlyPriceMxn !== null && customMonthlyPriceMxn > 0 ? customMonthlyPriceMxn : plan.priceMxn;
}

/** Etiqueta de un plan por su llave (para listados y métricas). */
export async function planLabels(lang: string): Promise<Record<string, string>> {
  return Object.fromEntries((await getPlans({ includeInactive: true })).map((p) => [p.key, planName(p, lang)]));
}

// ── Plan «A la medida» (Custom Service) ──────────────────────────────────────────────────────────────────────────
// No es una fila del catálogo: es un cliente con customPlan = true, sus propios límites (Organization.customMax*, null =
// ilimitado) y los módulos que el admin le encendió. Conserva un plan base (Organization.plan) como referencia de
// facturación. Toda validación de capacidad pasa por limitsFor / getOrgLimits para respetar ambos casos.

export const CUSTOM_PLAN_NAME = { es: "A la medida", en: "Custom Service" } as const;
export const customPlanName = (lang: string) => (lang === "en" ? CUSTOM_PLAN_NAME.en : CUSTOM_PLAN_NAME.es);

export const ORG_PLAN_SELECT = {
  plan: true,
  customPlan: true,
  customMaxLeads: true,
  customMaxUsers: true,
  customMaxAutomations: true,
  customMaxAiAgents: true,
  aiAgentsCapOverride: true,
} as const;

export type OrgPlanFields = {
  plan: string;
  customPlan: boolean;
  customMaxLeads: number | null;
  customMaxUsers: number | null;
  customMaxAutomations: number | null;
  customMaxAiAgents: number | null;
  aiAgentsCapOverride: number | null;
};

export type OrgLimits = PlanDef["limits"] & {
  custom: boolean;
  /** Tope de agentes IA activos; null = sin tope. */
  aiAgents: number | null;
  aiAgentsSource: "custom" | "override" | "plan";
};

/** Límites que de verdad aplican a una organización: los suyos si es «A la medida», si no los de su plan (más el tope de agentes pactado). */
export function limitsFor(org: OrgPlanFields, plan: PlanDef): OrgLimits {
  if (org.customPlan) {
    return { custom: true, leads: org.customMaxLeads, users: org.customMaxUsers, automations: org.customMaxAutomations, aiAgents: org.customMaxAiAgents, aiAgentsSource: "custom" };
  }
  const override = org.aiAgentsCapOverride;
  return { custom: false, ...plan.limits, aiAgents: override !== null ? override : plan.maxAiAgents, aiAgentsSource: override !== null ? "override" : "plan" };
}

export async function getOrgLimits(organizationId: string): Promise<OrgLimits> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: ORG_PLAN_SELECT });
  return limitsFor(org, await getPlan(org.plan));
}

/** Nombre del plan de una organización para mostrar: «A la medida» o el del catálogo. */
export const orgPlanName = (org: { customPlan: boolean }, plan: Pick<PlanDef, "name" | "nameEn">, lang: string) => (org.customPlan ? customPlanName(lang) : planName(plan, lang));
