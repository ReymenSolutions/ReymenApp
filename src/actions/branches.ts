"use server";

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import { MAX_BRANCHES, cleanBranchName } from "@/lib/branches";

async function requireManager() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "settings:manage")) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");
  return session;
}

function refresh() {
  revalidatePath("/portal/settings");
  revalidatePath("/portal/food");
}

export async function createBranch(name: string) {
  const session = await requireManager();
  const orgId = session.user.organizationId!;
  const clean = cleanBranchName(name);
  if (!clean) throw new UserError("Escribe el nombre de la sucursal");
  const existing = await prisma.branch.findMany({ where: { organizationId: orgId }, select: { name: true, isActive: true } });
  if (existing.length >= MAX_BRANCHES) throw new UserError(`Alcanzaste el máximo de ${MAX_BRANCHES} sucursales`);
  if (clean.toLowerCase() === "principal" || existing.some((b) => b.isActive && b.name.toLowerCase() === clean.toLowerCase())) {
    throw new UserError("Ya tienes una sucursal con ese nombre");
  }
  const branch = await prisma.branch.create({ data: { organizationId: orgId, name: clean } });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "branch.create", resource: "Branch", resourceId: branch.id, metadata: { name: clean } });
  refresh();
  return { success: true, branchId: branch.id };
}

export async function renameBranch(branchId: string, name: string) {
  const session = await requireManager();
  const orgId = session.user.organizationId!;
  const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId: orgId } });
  if (!branch) throw new UserError("Sucursal no encontrada");
  const clean = cleanBranchName(name);
  if (!clean) throw new UserError("Escribe el nombre de la sucursal");
  const clash = await prisma.branch.findFirst({ where: { organizationId: orgId, isActive: true, id: { not: branch.id }, name: { equals: clean, mode: "insensitive" } } });
  if (clash || clean.toLowerCase() === "principal") throw new UserError("Ya tienes una sucursal con ese nombre");
  await prisma.branch.update({ where: { id: branch.id }, data: { name: clean } });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "branch.rename", resource: "Branch", resourceId: branch.id, metadata: { from: branch.name, to: clean } });
  refresh();
  return { success: true };
}

/** Archiva o reactiva una sucursal: sus ventas se conservan. */
export async function setBranchActive(branchId: string, isActive: boolean) {
  const session = await requireManager();
  const orgId = session.user.organizationId!;
  const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId: orgId } });
  if (!branch) throw new UserError("Sucursal no encontrada");
  if (isActive && (await prisma.branch.count({ where: { organizationId: orgId, isActive: true, id: { not: branch.id }, name: { equals: branch.name, mode: "insensitive" } } })) > 0) {
    throw new UserError("Ya tienes una sucursal con ese nombre");
  }
  await prisma.branch.update({ where: { id: branch.id }, data: { isActive } });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: isActive ? "branch.restore" : "branch.archive", resource: "Branch", resourceId: branch.id, metadata: { name: branch.name } });
  refresh();
  return { success: true };
}
