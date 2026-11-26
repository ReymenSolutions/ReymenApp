import type { Prisma } from "@prisma/client";

/** Provisional concepts approved in the Wolf specification; no commercial values are assumed. */
export const PROVISIONAL_WORKSHOP_SERVICES = [
  ["Afinación mayor", "Major tune-up"],
  ["Afinación menor", "Minor tune-up"],
  ["Cambio de aceite y filtros", "Oil and filter change"],
  ["Frenos", "Brakes"],
  ["Reparación de motor", "Engine repair"],
  ["Reparación de transmisión", "Transmission repair"],
  ["Suspensión", "Suspension"],
  ["Diagnóstico electrónico / escaneo", "Electronic diagnostics / scanning"],
  ["Revisión de 20 puntos", "20-point inspection"],
  ["Cambio de batería", "Battery replacement"],
  ["Rotación y balanceo", "Tire rotation and balancing"],
] as const;

/** Idempotent; does not overwrite names or prices that the workshop edited. */
export async function seedWorkshopServices(tx: Prisma.TransactionClient, organizationId: string) {
  if (await tx.workshopService.count({ where: { organizationId } })) return;
  await tx.workshopService.createMany({
    data: PROVISIONAL_WORKSHOP_SERVICES.map(([nameEs, nameEn]) => ({ organizationId, nameEs, nameEn, provisional: true })),
    skipDuplicates: true,
  });
}
