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
  | "prompts:manage"
  | "team:manage"
  | "requests:create"
  | "reports:view"
  | "settings:view"
  | "settings:manage"
  // Food: menú, recetas, precios, costos, inventario, compras y proveedores.
  // Agente y Visor pueden ver Food pero no cambiarlo.
  | "food:manage"
  // Lealtad (módulo LOYALTY): configurar el programa (nombre, meta, recompensa).
  | "loyalty:manage"
  // Lealtad: registrar visitas y canjear recompensas en caja. Lo tiene también
  // el Agente (personal de caja). Ver el tablero no pide permiso aparte.
  | "loyalty:operate";

const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  SUPER_ADMIN: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "prompts:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
    "food:manage", "loyalty:manage", "loyalty:operate",
  ],
  ADMIN: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "prompts:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
    "food:manage", "loyalty:manage", "loyalty:operate",
  ],
  OWNER: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "prompts:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
    "food:manage", "loyalty:manage", "loyalty:operate",
  ],
  MANAGER: [
    "leads:create", "leads:update_status",
    "opportunities:create", "opportunities:manage",
    "automations:view",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "prompts:manage",
    "requests:create", "reports:view", "settings:view",
    "food:manage", "loyalty:manage", "loyalty:operate",
  ],
  AGENT: [
    "leads:create", "leads:update_status",
    "opportunities:create", "opportunities:manage",
    "automations:view",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply",
    "requests:create",
    "loyalty:operate",
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

// Monthly subscription cost per plan, in USD. The single source of truth for
// what a client actually pays — used anywhere real cost needs to be compared
// against real revenue (e.g. ROI reporting), instead of each caller hardcoding
// its own price table. null = precio personalizado por cliente: el monto real
// vive en Organization.customMonthlyPriceUsd (lo captura un admin).
export const PLAN_PRICES: Record<string, number | null> = {
  starter: 299,
  professional: 699,
  enterprise: null,
};

export function hasCustomPrice(plan: string): boolean {
  return PLAN_PRICES[plan] === null;
}

/** Precio mensual en USD de una organización, o null si su plan es personalizado y aún no tiene precio pactado. */
export function getMonthlyPlanPrice(plan: string, customMonthlyPriceUsd: number | null): number | null {
  if (!(plan in PLAN_PRICES)) return PLAN_PRICES.starter;
  return hasCustomPrice(plan) ? customMonthlyPriceUsd : PLAN_PRICES[plan];
}

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
