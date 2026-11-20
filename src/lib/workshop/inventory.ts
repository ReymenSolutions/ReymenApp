import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = typeof prisma | Prisma.TransactionClient;

/** Existencia derivada: las salidas restan; los ajustes usan cantidad firmada y requieren motivo. */
export async function workshopStock(db: Db, organizationId: string, partId: string): Promise<Prisma.Decimal> {
  const movements = await db.workshopInventoryMovement.findMany({
    where: { organizationId, partId },
    select: { tipo: true, cantidad: true },
  });
  return movements.reduce((sum, movement) => sum.plus(movement.tipo === "SALIDA_ORDEN" ? movement.cantidad.neg() : movement.cantidad), new Prisma.Decimal(0));
}
