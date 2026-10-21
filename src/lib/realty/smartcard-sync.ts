// Solo servidor. Cuando cambia una propiedad (precio, título, fotos,
// estado o publicación), actualiza las tarjetas de producto que la muestran
// en perfiles de SmartCard (ver src/lib/smartcard-products.ts). Corre
// después de responder (after) para no hacer esperar al guardado; si
// SmartCard no está configurado, no hace nada.

import { after } from "next/server";
import { realtySource } from "@/lib/catalog/realty";
import { syncSmartcardProduct } from "@/lib/smartcard-products";

export async function syncPropertyToSmartcard(organizationId: string, propertyId: string): Promise<void> {
  const item = await realtySource.get(organizationId, propertyId);
  await syncSmartcardProduct(`realty:${propertyId}`, item);
}

export function schedulePropertySmartcardSync(organizationId: string, propertyId: string | null | undefined): void {
  if (!propertyId) return;
  const run = () => syncPropertyToSmartcard(organizationId, propertyId).catch((err) => console.error("[realty/smartcard-sync]", err instanceof Error ? err.message : err));
  try {
    after(run);
  } catch {
    // Fuera de una petición (scripts, pruebas): en línea.
    void run();
  }
}
