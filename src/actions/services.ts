"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { assertModuleEnabled } from "@/lib/modules";
import { requireOrgPermission } from "@/lib/guards";
import { UserError } from "@/lib/user-error";


const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  durationMinutes: z.number().int().min(5).max(24 * 60),
  bufferMinutes: z.number().int().min(0).max(24 * 60).optional(),
  price: z.number().nonnegative().optional(),
});

export async function createService(data: z.infer<typeof createSchema>) {
  const session = await requireOrgPermission("settings:manage");
  await assertModuleEnabled(session.user.organizationId!, "CRM");
  const parsed = createSchema.parse(data);
  const orgId = session.user.organizationId!;

  const service = await prisma.service.create({
    data: {
      organizationId: orgId,
      name: parsed.name,
      description: parsed.description,
      durationMinutes: parsed.durationMinutes,
      bufferMinutes: parsed.bufferMinutes ?? 0,
      price: parsed.price,
    },
  });

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "service.create",
    resource: "Service",
    resourceId: service.id,
    metadata: { name: service.name },
  });

  revalidatePath("/portal/appointments/settings");
  revalidatePath("/portal/appointments");
  return { success: true, serviceId: service.id };
}

const updateSchema = z.object({
  serviceId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  durationMinutes: z.number().int().min(5).max(24 * 60).optional(),
  bufferMinutes: z.number().int().min(0).max(24 * 60).optional(),
  price: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function updateService(data: z.infer<typeof updateSchema>) {
  const session = await requireOrgPermission("settings:manage");
  await assertModuleEnabled(session.user.organizationId!, "CRM");
  const { serviceId, ...rest } = updateSchema.parse(data);
  const orgId = session.user.organizationId!;

  const service = await prisma.service.findFirst({ where: { id: serviceId, organizationId: orgId } });
  if (!service) throw new UserError("Servicio no encontrado");

  await prisma.service.update({ where: { id: serviceId }, data: rest });

  revalidatePath("/portal/appointments/settings");
  revalidatePath("/portal/appointments");
  return { success: true };
}

export async function deleteService(serviceId: string) {
  const session = await requireOrgPermission("settings:manage");
  await assertModuleEnabled(session.user.organizationId!, "CRM");
  const orgId = session.user.organizationId!;

  const service = await prisma.service.findFirst({
    where: { id: serviceId, organizationId: orgId },
    include: { _count: { select: { appointments: true } } },
  });
  if (!service) throw new UserError("Servicio no encontrado");
  if (service._count.appointments > 0) {
    throw new UserError("No se puede eliminar un servicio con citas asociadas. Desactívalo en su lugar.");
  }

  await prisma.service.delete({ where: { id: serviceId } });

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "service.delete",
    resource: "Service",
    resourceId: serviceId,
  });

  revalidatePath("/portal/appointments/settings");
  revalidatePath("/portal/appointments");
  return { success: true };
}
