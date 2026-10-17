import type { UserRole } from "@prisma/client";

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
  | "food:manage"
  // Lealtad (módulo LOYALTY): configurar el programa (nombre, meta, recompensa).
  | "loyalty:manage"
  // Lealtad: registrar visitas y canjear recompensas en caja. Lo tiene también
  // el Agente (personal de caja). Ver el tablero no pide permiso aparte.
  | "loyalty:operate"
  // Realty: configurar zonas, ajustes y campañas.
  | "realty:manage"
  // Realty: asesores — propiedades, prospectos, visitas y cierres.
  | "realty:operate";

const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  SUPER_ADMIN: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
    "food:manage", "loyalty:manage", "loyalty:operate", "realty:manage", "realty:operate",
  ],
  ADMIN: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
    "food:manage", "loyalty:manage", "loyalty:operate", "realty:manage", "realty:operate",
  ],
  OWNER: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
    "food:manage", "loyalty:manage", "loyalty:operate", "realty:manage", "realty:operate",
  ],
  MANAGER: [
    "leads:create", "leads:update_status",
    "opportunities:create", "opportunities:manage",
    "automations:view",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage",
    "requests:create", "reports:view", "settings:view",
    "food:manage", "loyalty:manage", "loyalty:operate", "realty:manage", "realty:operate",
  ],
  AGENT: [
    "leads:create", "leads:update_status",
    "opportunities:create", "opportunities:manage",
    "automations:view",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply",
    "requests:create",
    "loyalty:operate", "realty:operate",
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

// Sin tope real. Antes Business usaba 99 / 99999 como "ilimitado" y cada
// pantalla comparaba contra su propio número mágico (=== 99, >= 99999); con
// Infinity el límite de verdad no existe (assertPlanCapacity nunca bloquea)
// y las pantallas preguntan isUnlimited() en vez de adivinar el número.
export const UNLIMITED = Number.POSITIVE_INFINITY;

export function isUnlimited(limit: number): boolean {
  return limit === UNLIMITED;
}
