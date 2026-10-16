import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const visitPolicySchema = z.object({
  enabled: z.boolean(),
  value: z.number().int().min(1),
  unit: z.enum(["minutes", "hours", "days"]),
}).refine(p => p.value * ({ minutes: 1, hours: 60, days: 1440 }[p.unit]) <= 525600, "El intervalo máximo es de 365 días.");

export async function getVisitPolicy(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { loyaltyVisitCooldownEnabled: true, loyaltyVisitCooldownMinutes: true } });
  const minutes = org.loyaltyVisitCooldownMinutes;
  const unit = minutes % 1440 === 0 ? "days" : minutes % 60 === 0 ? "hours" : "minutes";
  return { enabled: org.loyaltyVisitCooldownEnabled, value: minutes / ({ minutes: 1, hours: 60, days: 1440 }[unit]), unit, minutes };
}

export async function setVisitPolicy(organizationId: string, input: unknown, actor: { deviceId: string; employeeId: string }) {
  const data = visitPolicySchema.parse(input);
  const minutes = data.value * ({ minutes: 1, hours: 60, days: 1440 }[data.unit]);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
    const previous = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { loyaltyVisitCooldownEnabled: true, loyaltyVisitCooldownMinutes: true } });
    await tx.organization.update({ where: { id: organizationId }, data: { loyaltyVisitCooldownEnabled: data.enabled, loyaltyVisitCooldownMinutes: minutes } });
    await tx.auditLog.create({ data: { organizationId, action: "loyalty.pos_visit_policy", resource: "Organization", resourceId: organizationId, metadata: { previous, enabled: data.enabled, minutes, ...actor } } });
  });
  return getVisitPolicy(organizationId);
}
