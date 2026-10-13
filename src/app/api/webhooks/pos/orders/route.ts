import { NextResponse } from "next/server";
import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processFoodPosOrder } from "@/lib/food";
import { hasModule } from "@/lib/modules";

/** Mensaje que el POS muestra tal cual al dueño cuando el módulo está apagado. */
const POS_MODULE_DISABLED_MESSAGE =
  "Reymen POS no está activado para este negocio en Reymen. Actívalo en Admin → Cliente → Módulos; las ventas pendientes se enviarán solas.";

// Órdenes cerradas de un POS externo -- mismo esquema de auth/idempotencia
// que los webhooks de n8n (§8 de la doc técnica): firma HMAC sobre el
// cuerpo crudo, atada a un timestamp fresco, contra el n8nWebhookSecret
// PROPIO de esa organización (no hay secreto compartido). x-reymen-event-id
// debe ser el id de la orden en el POS -- una reentrega con el mismo id se
// descarta como duplicado en vez de contar la venta dos veces.
export const POST = createOrgWebhookHandler({
  rateLimitKey: "pos-orders",
  source: "pos",
  eventType: "order.completed",
  // Sin id de evento un reenvío contaría la venta dos veces: el POS siempre lo manda (id de la orden en el POS).
  requireEventId: true,
  process: processFoodPosOrder,
  // Sin el módulo "Reymen POS" no se aceptan ventas del POS. 403 con un code
  // propio: el POS las deja pendientes y las reenvía cuando se active.
  precheck: async (organizationId) => {
    const [pos, food] = await Promise.all([hasModule(organizationId, "REYMEN_POS"), hasModule(organizationId, "FOOD_OPS")]);
    if (pos && food) return null;
    return NextResponse.json({ error: POS_MODULE_DISABLED_MESSAGE, code: "pos_module_disabled" }, { status: 403 });
  },
  // Una orden rechazada (p. ej. un platillo que no existe) es un error de
  // datos del POS, no del servidor: 422 con el motivo para que el POS lo muestre.
  failureResponse: (error) => NextResponse.json({ error }, { status: 422 }),
});
