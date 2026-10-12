import { prisma } from "./prisma";
import { getPlan } from "./plans";
import { UserError } from "./user-error";

type PlanResource = "leads" | "users" | "automations";

const RESOURCE_LABEL: Record<PlanResource, string> = {
  leads: "leads",
  users: "usuarios",
  automations: "automatizaciones",
};

async function countResource(organizationId: string, resource: PlanResource): Promise<number> {
  switch (resource) {
    case "leads":
      return prisma.lead.count({ where: { organizationId, deletedAt: null } });
    case "users":
      return prisma.user.count({ where: { organizationId, isActive: true } });
    case "automations":
      return prisma.automation.count({ where: { organizationId, status: { not: "ARCHIVED" } } });
  }
}

/** Throws a clear, upgrade-prompting error once the org is at or over its plan's cap for that resource. */
export async function assertPlanCapacity(organizationId: string, resource: PlanResource): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { plan: true },
  });
  const limit = (await getPlan(org.plan)).limits[resource];
  // Sin tope (ilimitado): nunca se bloquea.
  if (limit === null) return;
  const currentCount = await countResource(organizationId, resource);

  if (currentCount >= limit) {
    throw new UserError(
      `Alcanzaste el límite de ${RESOURCE_LABEL[resource]} de tu plan (${limit}). Solicita más capacidad en Configuración.`
    );
  }
}
