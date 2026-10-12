import type { PlatformModule, UserRole } from "@prisma/client";

export type Action =
  | "leads:create"
  | "leads:delete"
  | "leads:update_status"
  | "opportunities:create"
  | "opportunities:manage"
  | "pipeline:manage"
  | "automations:view"
  | "automations:manage"
  | "conversations:view"
  | "conversations:escalate"
  | "conversations:resolve"
  | "conversations:reply"
  | "conversations:assign"
  | "knowledge_base:manage"
  | "team:manage"
  | "requests:create"
  | "reports:view"
  | "settings:view"
  | "settings:manage"
  // Food: menú, recetas, precios, costos, inventario, compras y proveedores.
  // Agente y Visor pueden ver Food pero no cambiarlo.
  | "food:manage";

const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  SUPER_ADMIN: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
    "food:manage",
  ],
  ADMIN: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
    "food:manage",
  ],
  OWNER: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
    "food:manage",
  ],
  MANAGER: [
    "leads:create", "leads:update_status",
    "opportunities:create", "opportunities:manage",
    "automations:view",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage",
    "requests:create", "reports:view", "settings:view",
    "food:manage",
  ],
  AGENT: [
    "leads:create", "leads:update_status",
    "opportunities:create", "opportunities:manage",
    "automations:view",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply",
    "requests:create",
  ],
  VIEWER: [
    "leads:update_status",
    "automations:view",
    "conversations:view",
    "reports:view",
  ],
  CLIENT: [
    "leads:create",
    "requests:create",
    "reports:view",
    "settings:view",
  ],
};

export function can(role: UserRole, action: Action): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

// Sin tope real. Antes Enterprise usaba 99 / 99999 como "ilimitado" y cada
// pantalla comparaba contra su propio número mágico (=== 99, >= 99999); con
// Infinity el límite de verdad no existe (assertPlanCapacity nunca bloquea)
// y las pantallas preguntan isUnlimited() en vez de adivinar el número.
export const UNLIMITED = Number.POSITIVE_INFINITY;

export function isUnlimited(limit: number): boolean {
  return limit === UNLIMITED;
}

export const PLAN_LIMITS: Record<string, { leads: number; users: number; automations: number; label: string }> = {
  starter:      { leads: 500,       users: 2,         automations: 3,         label: "Starter" },
  professional: { leads: 5000,      users: 10,        automations: 15,        label: "Professional" },
  enterprise:   { leads: UNLIMITED, users: UNLIMITED, automations: UNLIMITED, label: "Enterprise" },
};

// Precio mensual de lista por plan, en MXN: la fuente única de lo que paga un cliente (ROI y facturación lo leen de
// aquí en lugar de repetir su propia tabla). Un cliente puede tener un precio pactado distinto
// (Organization.customMonthlyPriceMxn), que reemplaza al de lista sin tocar el catálogo general.
export const PLAN_PRICES_MXN: Record<string, number> = {
  starter: 999,
  professional: 1999,
  enterprise: 3999,
};

/** Precio mensual en MXN de una organización: el pactado si lo hay, si no el de lista de su plan (plan desconocido = Starter). */
export function getMonthlyPlanPriceMxn(plan: string, customMonthlyPriceMxn: number | null): number {
  if (customMonthlyPriceMxn !== null && customMonthlyPriceMxn > 0) return customMonthlyPriceMxn;
  return PLAN_PRICES_MXN[plan] ?? PLAN_PRICES_MXN.starter;
}

// Presupuesto interno de IA por plan (MXN al mes): el costo máximo que Reymen asume por ese cliente. Valor de partida hasta que
// el catálogo de planes viva en la base de datos (se lee solo desde src/lib/ai/budget.ts). Un admin puede fijar otro por cliente.
export const PLAN_AI_BUDGET_MXN: Record<string, number> = {
  starter: 75,
  professional: 200,
  enterprise: 500,
};

// Which PlatformModules each plan tier commercially includes — a catalog
// reference only. It does NOT drive OrganizationModule automatically: the
// module axis stays a separate, explicit entitlement (see modules.ts) that
// an admin grants/suspends by hand, or aligns to this list on purpose via
// syncModulesToPlan() (src/actions/admin/modules.ts). An org can carry
// modules its plan doesn't list (e.g. AI_WHATSAPP granted as a courtesy on
// Starter) — that's expected, not a mismatch to "fix".
export const PLAN_MODULES: Record<string, PlatformModule[]> = {
  starter: ["CRM"],
  professional: ["CRM", "AUTOMATIONS"],
  enterprise: ["CRM", "AUTOMATIONS", "AI_WHATSAPP"],
};
