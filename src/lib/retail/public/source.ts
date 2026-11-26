// Solo servidor. De dónde saca la web pública sus datos y cómo aparta: el ÚNICO archivo de la web que toca el núcleo
// del módulo Retail (docs/retail/WEB-CONTRACT.md).
//
// ESTADO (23 nov 2026): el núcleo todavía no existe (enum RETAIL, RetailItem, RetailLocationSettings y createHold los
// construye Codex en la Fase 1). Mientras tanto la tienda no se publica: getStorefront devuelve null (404) y
// requestHold responde NOT_READY. Cuando el núcleo llegue, solo cambia este archivo:
//   1. getStorefront: org por slug + hasModule(org, "RETAIL"); tiendas = Branch + RetailLocationSettings tipo TIENDA;
//      prendas = RetailItem que cumplan isPublishable (catalog.ts), con precio final del RetailDiscountPlan APLICADO y
//      vigente para la web. NUNCA seleccionar el costo.
//   2. requestHold: llamar createHold({ channel: "WEB", leadSource: "web", ... }) del núcleo.
import { cache } from "react";
import type { HoldResult, Storefront } from "./types";

/** Una sola consulta por petición aunque la llamen el layout, la página y los metadatos. */
export const getStorefront = cache(async (slug: string): Promise<Storefront | null> => {
  void slug;
  return null;
});

export async function requestHold(input: { organizationId: string; itemId: string; customer: { name: string; phone: string } }): Promise<HoldResult> {
  void input;
  return { ok: false, reason: "NOT_READY" };
}
