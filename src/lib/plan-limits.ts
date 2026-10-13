import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getPlan } from "./plans";
import { UserError } from "./user-error";

type PlanResource = "leads" | "users" | "automations";

const RESOURCE_LABEL: Record<PlanResource, string> = {
  leads: "leads",
  users: "usuarios",
  automations: "automatizaciones",
};

async function countResource(organizationId: string, resource: PlanResource, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<number> {
  switch (resource) {
    case "leads":
      return db.lead.count({ where: { organizationId, deletedAt: null } });
    case "users":
      return db.user.count({ where: { organizationId, isActive: true } });
    case "automations":
      return db.automation.count({ where: { organizationId, status: { not: "ARCHIVED" } } });
  }
}

function capacityError(resource: PlanResource, limit: number) {
  return new UserError(`Alcanzaste el límite de ${RESOURCE_LABEL[resource]} de tu plan (${limit}). Solicita más capacidad en Configuración.`);
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
    throw capacityError(resource, limit);
  }
}

/**
 * Comprobar el tope y crear el recurso son dos pasos: sin exclusión, N peticiones simultáneas pasan todas la comprobación
 * y juntas rebasan el plan. Esta función los vuelve uno solo por organización y recurso: un candado de Postgres
 * (`pg_advisory_xact_lock`) serializa la comprobación y la creación, que ocurren en la MISMA transacción (`create`
 * recibe el cliente de la transacción y debe crear con él). Así no se necesita una segunda conexión mientras se espera
 * el candado, y la fila nueva ya es visible para la siguiente comprobación cuando el candado se libera.
 */
export async function withPlanCapacity<T>(
  organizationId: string,
  resource: PlanResource,
  create: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  // El tope se resuelve ANTES de abrir la transacción (usa el caché del catálogo y otra conexión).
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } });
  const limit = (await getPlan(org.plan)).limits[resource];

  return prisma.$transaction(
    async (tx) => {
      if (limit !== null) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plancap:${organizationId}:${resource}`}))`;
        if ((await countResource(organizationId, resource, tx)) >= limit) throw capacityError(resource, limit);
      }
      return create(tx);
    },
    { maxWait: 15_000, timeout: 30_000 }
  );
}
