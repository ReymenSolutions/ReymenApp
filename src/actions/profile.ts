"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { UserRole } from "@prisma/client";
import { UserError } from "@/lib/user-error";

export async function updateAvatar(imageData: string) {
  const session = await auth();
  if (!session?.user.id) throw new UserError("No autorizado");

  const isDataUri = imageData.startsWith("data:image/");
  const isUrl = imageData.startsWith("http://") || imageData.startsWith("https://");

  if (!isDataUri && !isUrl) throw new UserError("Formato de imagen inválido");
  if (isDataUri && imageData.length > 300 * 1024) throw new UserError("Imagen demasiado grande (máx. 300KB)");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: imageData },
  });

  revalidatePath("/portal");
  revalidatePath("/admin");
  return { success: true };
}

export async function removeAvatar() {
  const session = await auth();
  if (!session?.user.id) throw new UserError("No autorizado");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { image: null },
  });

  revalidatePath("/portal");
  revalidatePath("/admin");
  return { success: true };
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Mínimo 8 caracteres"),
});

export async function changePassword(data: { currentPassword: string; newPassword: string }) {
  const session = await auth();
  if (!session?.user.id) throw new UserError("No autorizado");

  const parsed = passwordSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.passwordHash) throw new UserError("Usuario no encontrado");

  const isValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!isValid) throw new UserError("Contraseña actual incorrecta");

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: newHash, sessionVersion: { increment: 1 } },
  });

  await logAudit({
    organizationId: session.user.organizationId ?? undefined,
    userId: session.user.id,
    action: "profile.changePassword",
    resource: "User",
    resourceId: session.user.id,
    metadata: {},
  });

  return { success: true };
}

export async function updatePreferences(data: { theme?: string; language?: string }) {
  const session = await auth();
  if (!session?.user.id) throw new UserError("No autorizado");

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(data.theme !== undefined && { theme: data.theme }),
      ...(data.language !== undefined && { language: data.language }),
    },
  });

  return { success: true };
}

export async function updateOrgLogo(logoUrl: string | null) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  const allowed: UserRole[] = ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"];
  if (!allowed.includes(session.user.role as UserRole)) throw new UserError("Sin permisos");

  if (logoUrl) {
    const isDataUri = logoUrl.startsWith("data:image/");
    const isHttpUrl = logoUrl.startsWith("http://") || logoUrl.startsWith("https://");
    if (!isDataUri && !isHttpUrl) throw new UserError("Formato de imagen inválido");
    if (isDataUri && logoUrl.length > 500 * 1024) throw new UserError("Imagen demasiado grande (máx. 500KB)");
    if (isHttpUrl) {
      const parsed = z.string().url("URL inválida").safeParse(logoUrl);
      if (!parsed.success) throw new UserError("URL de logo inválida");
    }
  }

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { logoUrl: logoUrl ?? null },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "org.updateLogo",
    resource: "Organization",
    resourceId: session.user.organizationId,
    metadata: { logoUrl },
  });

  revalidatePath("/portal", "layout");
  revalidatePath("/admin", "layout");
  return { success: true };
}
