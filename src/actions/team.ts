"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { createOrgUserRecord } from "@/lib/org-users";
import type { UserRole } from "@prisma/client";
import { UserError } from "@/lib/user-error";
import { isAdmin } from "@/lib/roles";

const inviteSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  role: z.enum(["MANAGER", "AGENT", "VIEWER"]),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export async function inviteTeamMember(data: {
  name: string;
  email: string;
  role: string;
  password: string;
}) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "team:manage")) throw new UserError("Sin permisos para gestionar el equipo");

  const parsed = inviteSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos inválidos");

  await createOrgUserRecord({
    organizationId: session.user.organizationId,
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role as UserRole,
    password: parsed.data.password,
    actorUserId: session.user.id,
    auditAction: "team.invite",
  });

  revalidatePath("/portal/settings");
  return { success: true };
}

export async function removeTeamMember(userId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "team:manage")) throw new UserError("Sin permisos");

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: session.user.organizationId },
  });

  if (!user) throw new UserError("Usuario no encontrado");
  if (user.id === session.user.id) throw new UserError("No puedes eliminarte a ti mismo");
  if (user.role === "OWNER") throw new UserError("No puedes eliminar al propietario");
  if (isAdmin(user.role)) throw new UserError("Este usuario es administrador de la plataforma; se gestiona desde Administración");

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "team.remove",
    resource: "User",
    resourceId: userId,
    metadata: { email: user.email },
  });

  revalidatePath("/portal/settings");
  return { success: true };
}

const updateSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  role: z.enum(["MANAGER", "AGENT", "VIEWER"]),
});

export async function updateTeamMember(userId: string, data: { name: string; role: string }) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "team:manage")) throw new UserError("Sin permisos para gestionar el equipo");

  const parsed = updateSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: session.user.organizationId },
  });

  if (!user) throw new UserError("Usuario no encontrado");
  if (user.id === session.user.id) throw new UserError("No puedes editarte a ti mismo desde aquí");
  if (user.role === "OWNER") throw new UserError("No puedes modificar al propietario");
  if (isAdmin(user.role)) throw new UserError("Este usuario es administrador de la plataforma; se gestiona desde Administración");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name: parsed.data.name, role: parsed.data.role as UserRole },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "team.update",
    resource: "User",
    resourceId: userId,
    metadata: { email: updated.email, name: updated.name, role: updated.role },
  });

  revalidatePath("/portal/settings");
  return { success: true };
}
