// Revisiones de acceso compartidas por las acciones de servidor. Antes cada
// archivo tenía su propia copia (requireAdmin en 2 archivos, la misma
// condición escrita a mano ~20 veces y requireSettingsManage en 4).
import type { UserRole } from "@prisma/client";
import { auth, isAdmin } from "./auth";
import { can, type Action } from "./permissions";
import { UserError } from "./user-error";
import { assertModuleEnabled } from "./modules";

/** Sesión de un admin de la plataforma (ADMIN o SUPER_ADMIN), o lanza "No autorizado". */
export async function requireAdmin() {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new UserError("No autorizado");
  return session;
}

/** Sesión de un usuario de una organización con el permiso indicado, o lanza "No autorizado". */
export async function requireOrgPermission(action: Action) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, action)) throw new UserError("No autorizado");
  return session as typeof session & { user: { organizationId: string } };
}

/**
 * Toda acción que cambia algo de Food: sesión de la organización con permiso
 * food:manage (Dueño, Admin o Gerente) y el módulo Food activo. Antes solo se
 * revisaba la sesión, así que un Visor podía cambiar precios o recetas.
 */
export async function requireFoodManager() {
  const session = await requireOrgPermission("food:manage");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");
  return session;
}

/**
 * Caja de Lealtad: registrar visitas y canjear recompensas. Sesión de la
 * organización con loyalty:operate (incluye al Agente, que es quien cobra) y
 * el módulo Food activo — Lealtad es parte de Reymen Food.
 */
export async function requireLoyaltyOperator() {
  const session = await requireOrgPermission("loyalty:operate");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");
  return session;
}
