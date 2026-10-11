import { prisma } from "./prisma";

/** Máximo de sucursales adicionales (activas o archivadas) por organización. */
export const MAX_BRANCHES = 20;

/**
 * Filtro de sucursal para consultas de ventas.
 *   undefined → todas las sucursales juntas
 *   null      → la sucursal principal (ventas sin sucursal)
 *   "<id>"    → una sucursal
 */
export type BranchFilter = string | null | undefined;

export const MAIN_BRANCH_PARAM = "main";

export function cleanBranchName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Condición de Prisma para FoodSale según el filtro. */
export function branchWhere(branch: BranchFilter): { branchId?: string | null } {
  return branch === undefined ? {} : { branchId: branch };
}

/** Sucursales adicionales de la organización (la principal es implícita). */
export async function listBranches(organizationId: string, { activeOnly = false } = {}) {
  return prisma.branch.findMany({
    where: { organizationId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Lee el parámetro `?branch=` de la URL: ausente o desconocido → todas; "main" → principal;
 * un id válido de la organización → esa sucursal. Nunca da acceso a sucursales de otra organización.
 */
export function parseBranchParam(param: string | undefined, branches: { id: string }[]): BranchFilter {
  if (!param) return undefined;
  if (param === MAIN_BRANCH_PARAM) return null;
  return branches.some((b) => b.id === param) ? param : undefined;
}
