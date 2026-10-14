// Ubicación de cada punto de venta (Principal + sucursales) para el mapa y las
// distancias de Lealtad. Solo servidor. El negocio escribe el CP y fija el pin
// en el mapa (Programa → Ubicación de las sucursales).

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import { isValidPoint, normalizePostalCode } from "./postal-zones";
import { MAIN_LOCATION_KEY, type LoyaltyLocationView } from "./locations-shared";

/** Principal + sucursales activas, con la ubicación guardada de cada una (o null). */
export async function listLocations(
  organizationId: string,
  orgName: string,
  branches: { id: string; name: string }[]
): Promise<LoyaltyLocationView[]> {
  const rows = await prisma.loyaltyLocation.findMany({ where: { organizationId } });
  const byKey = new Map(rows.map((r) => [r.branchKey, r]));
  const entries = [
    { key: MAIN_LOCATION_KEY, branchId: null as string | null, label: orgName },
    ...branches.map((b) => ({ key: b.id, branchId: b.id as string | null, label: b.name })),
  ];
  return entries.map((e) => {
    const r = byKey.get(e.key);
    return { ...e, postalCode: r?.postalCode ?? null, point: r ? { lat: r.latitude, lng: r.longitude } : null };
  });
}

export async function saveLocation(
  organizationId: string,
  userId: string,
  input: { branchKey: string; postalCode: string; lat: number; lng: number }
) {
  const postalCode = normalizePostalCode(input.postalCode);
  if (!postalCode) throw new UserError("El código postal debe tener 5 dígitos.");
  if (!isValidPoint(input.lat, input.lng)) throw new UserError("Marca la ubicación en el mapa.");
  let branchId: string | null = null;
  if (input.branchKey !== MAIN_LOCATION_KEY) {
    // Nunca una sucursal de otra organización.
    const branch = await prisma.branch.findFirst({ where: { id: input.branchKey, organizationId }, select: { id: true } });
    if (!branch) throw new UserError("Esa sucursal no existe.");
    branchId = branch.id;
  }
  const data = { postalCode, latitude: Math.round(input.lat * 1e6) / 1e6, longitude: Math.round(input.lng * 1e6) / 1e6, updatedById: userId };
  const saved = await prisma.loyaltyLocation.upsert({
    where: { organizationId_branchKey: { organizationId, branchKey: input.branchKey } },
    update: data,
    create: { organizationId, branchKey: input.branchKey, branchId, ...data },
  });
  await logAudit({
    organizationId,
    userId,
    action: "loyalty.location_update",
    resource: "LoyaltyLocation",
    resourceId: saved.id,
    metadata: { branchKey: input.branchKey, postalCode },
  });
  return saved;
}
