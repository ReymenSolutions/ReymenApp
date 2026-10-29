"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createOrgUserRecord } from "@/lib/org-users";
import type { UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { withPlanCapacity } from "@/lib/plan-limits";
import { invalidateSessionCache } from "@/lib/session-guard";
import { EDITABLE_ROLES, checkUserEdit, checkUserCreate, checkUserDelete, isPlatformRole } from "@/lib/user-edit-rules";

const ORG_USER_ROLES = ["OWNER", "MANAGER", "AGENT", "VIEWER"] as const;
const STANDALONE_USER_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;

const createOrgUserSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(ORG_USER_ROLES),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export async function createOrgUser(orgId: string, data: { name: string; email: string; role: string; password: string }) {
  const session = await requireAdmin();

  const parsed = createOrgUserSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos inválidos");

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new UserError("Cliente no encontrado");

  await createOrgUserRecord({
    organizationId: orgId,
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role as UserRole,
    password: parsed.data.password,
    actorUserId: session.user.id,
    auditAction: "admin.user.create",
  });

  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true };
}

const updateOrgUserSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  role: z.enum(ORG_USER_ROLES),
});

export async function updateOrgUser(userId: string, data: { name: string; role: string }) {
  const session = await requireAdmin();

  const parsed = updateOrgUserSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos inválidos");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.organizationId) throw new UserError("Usuario no encontrado");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name, role: parsed.data.role as UserRole },
  });

  await logAudit({
    organizationId: user.organizationId,
    userId: session.user.id,
    action: "admin.user.update",
    resource: "User",
    resourceId: userId,
    metadata: { name: updated.name, role: updated.role },
  });

  revalidatePath(`/admin/clients/${user.organizationId}`);
  return { success: true };
}

const editUserSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres"),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  role: z.enum(EDITABLE_ROLES),
  organizationId: z.string().min(1).nullable(),
  // Opcional: restablece la contraseña (y cierra las sesiones abiertas de esa persona).
  password: z.union([z.literal(""), z.string().min(8, "Mínimo 8 caracteres")]).optional(),
});

/**
 * Edita a cualquier usuario desde Admin → Usuarios: nombre, email, rol, organización y, opcionalmente, contraseña.
 * Un super administrador puede además ser miembro (p. ej. dueño) de una organización: SUPER_ADMIN con organizationId.
 * Las reglas de quién puede cambiar qué están en lib/user-edit-rules.
 */
export async function updateUserAsAdmin(
  userId: string,
  data: { name: string; email: string; role: string; organizationId: string | null; password?: string }
) {
  const session = await requireAdmin();

  const parsed = editUserSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos inválidos");
  const next = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new UserError("Usuario no encontrado");

  if (next.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: next.organizationId }, select: { id: true } });
    if (!org) throw new UserError("Organización no encontrada");
  }
  const activeSuperAdmins = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
  const blocked = checkUserEdit({
    actor: { id: session.user.id, role: session.user.role },
    target: { id: target.id, role: target.role, organizationId: target.organizationId },
    next: { role: next.role, organizationId: next.organizationId },
    activeSuperAdmins,
  });
  if (blocked) throw new UserError(blocked);

  if (next.email !== target.email.toLowerCase()) {
    const taken = await prisma.user.findFirst({ where: { email: { equals: next.email, mode: "insensitive" }, id: { not: userId } }, select: { id: true } });
    if (taken) throw new UserError("Ya existe un usuario con ese email");
  }

  const passwordChanged = !!next.password;
  const data2: Parameters<typeof prisma.user.update>[0]["data"] = { name: next.name, email: next.email, role: next.role, organizationId: next.organizationId };
  if (passwordChanged) data2.passwordHash = await bcrypt.hash(next.password!, 12);
  // Rol, organización, email o contraseña distintos → las sesiones abiertas dejan de valer y la persona vuelve a entrar con los datos nuevos.
  const sessionAffected = passwordChanged || next.role !== target.role || next.organizationId !== target.organizationId || next.email !== target.email.toLowerCase();
  if (sessionAffected) data2.sessionVersion = { increment: 1 };

  const movingIntoOrg = !!next.organizationId && next.organizationId !== target.organizationId;
  const updated = movingIntoOrg
    ? await withPlanCapacity(next.organizationId!, "users", (tx) => tx.user.update({ where: { id: userId }, data: data2 }))
    : await prisma.user.update({ where: { id: userId }, data: data2 });
  invalidateSessionCache(userId);

  await logAudit({
    organizationId: updated.organizationId ?? target.organizationId ?? undefined,
    userId: session.user.id,
    action: "admin.user.update",
    resource: "User",
    resourceId: userId,
    metadata: {
      email: updated.email, name: updated.name, role: updated.role, organizationId: updated.organizationId,
      before: { email: target.email, role: target.role, organizationId: target.organizationId },
      passwordReset: passwordChanged,
    },
  });

  revalidatePath("/admin/users");
  if (target.organizationId) revalidatePath(`/admin/clients/${target.organizationId}`);
  if (updated.organizationId && updated.organizationId !== target.organizationId) revalidatePath(`/admin/clients/${updated.organizationId}`);
  return { success: true, signedOut: sessionAffected && userId === session.user.id };
}

export async function setUserActive(userId: string, isActive: boolean) {
  const session = await requireAdmin();
  if (userId === session.user.id) throw new UserError("No puedes desactivarte a ti mismo");

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new UserError("Usuario no encontrado");
  // Only a SUPER_ADMIN can deactivate another platform admin.
  if (target.role === "SUPER_ADMIN" && session.user.role !== "SUPER_ADMIN") {
    throw new UserError("Sin permisos para modificar a un super administrador");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });

  await logAudit({
    organizationId: user.organizationId ?? undefined,
    userId: session.user.id,
    action: isActive ? "admin.user.activate" : "admin.user.deactivate",
    resource: "User",
    resourceId: userId,
    metadata: { email: user.email },
  });

  revalidatePath("/admin/users");
  if (user.organizationId) revalidatePath(`/admin/clients/${user.organizationId}`);
  return { success: true };
}

const createStandaloneUserSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(STANDALONE_USER_ROLES),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

// Platform users with no organization — SUPER_ADMIN/ADMIN accounts only.
// Restricted to SUPER_ADMIN so a regular admin can't mint new admin accounts.
export async function createStandaloneUser(data: { name: string; email: string; role: string; password: string }) {
  const session = await auth();
  if (!session || session.user.role !== "SUPER_ADMIN") throw new UserError("No autorizado");

  const parsed = createStandaloneUserSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos inválidos");

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) throw new UserError("Ya existe un usuario con ese email");

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role as UserRole,
      organizationId: null,
    },
  });

  await logAudit({
    userId: session.user.id,
    action: "admin.user.create",
    resource: "User",
    resourceId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

/** Organizaciones para elegir a qué cliente pertenece un usuario. */
export async function getOrgOptions() {
  await requireAdmin();
  return prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres"),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  role: z.enum(EDITABLE_ROLES),
  organizationId: z.string().min(1).nullable(),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

/**
 * Alta desde Admin → Usuarios con cualquier rol y, si corresponde, ligado a una organización (un super admin también
 * puede ser miembro de una). Con organización pasa por el mismo camino que el alta desde el cliente (límite del plan,
 * correo de bienvenida y auditoría); sin organización solo se crean administradores de la plataforma.
 */
export async function createUserAsAdmin(data: { name: string; email: string; role: string; organizationId: string | null; password: string }) {
  const session = await requireAdmin();
  const parsed = createUserSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Datos inválidos");
  const input = parsed.data;

  const blocked = checkUserCreate({ actorRole: session.user.role, role: input.role, organizationId: input.organizationId });
  if (blocked) throw new UserError(blocked);

  if (input.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { id: true } });
    if (!org) throw new UserError("Organización no encontrada");
    await createOrgUserRecord({
      organizationId: input.organizationId,
      name: input.name,
      email: input.email,
      role: input.role as UserRole,
      password: input.password,
      actorUserId: session.user.id,
      auditAction: "admin.user.create",
    });
    revalidatePath(`/admin/clients/${input.organizationId}`);
  } else {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new UserError("Ya existe un usuario con ese email");
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 12), role: input.role as UserRole, organizationId: null },
    });
    await logAudit({ userId: session.user.id, action: "admin.user.create", resource: "User", resourceId: user.id, metadata: { email: user.email, role: user.role } });
  }
  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * Elimina definitivamente a un usuario. Lo que hizo (notas, oportunidades, mensajes, visitas) se conserva sin autor;
 * la bitácora de auditoría guarda quién lo eliminó. Para quitarle el acceso sin perder la relación, usa Desactivar.
 */
export async function deleteUserAsAdmin(userId: string) {
  const session = await requireAdmin();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new UserError("Usuario no encontrado");
  const activeSuperAdmins = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
  const blocked = checkUserDelete({ actor: { id: session.user.id, role: session.user.role }, target: { id: target.id, role: target.role, isActive: target.isActive }, activeSuperAdmins });
  if (blocked) throw new UserError(blocked);

  await prisma.user.delete({ where: { id: userId } });
  invalidateSessionCache(userId);

  await logAudit({
    organizationId: target.organizationId ?? undefined,
    userId: session.user.id,
    action: "admin.user.delete",
    resource: "User",
    resourceId: userId,
    metadata: { email: target.email, name: target.name, role: target.role, platformRole: isPlatformRole(target.role) },
  });

  revalidatePath("/admin/users");
  if (target.organizationId) revalidatePath(`/admin/clients/${target.organizationId}`);
  return { success: true };
}

export async function getAllUsers() {
  await requireAdmin();

  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      organizationId: true,
      organization: { select: { id: true, name: true } },
    },
  });
}
