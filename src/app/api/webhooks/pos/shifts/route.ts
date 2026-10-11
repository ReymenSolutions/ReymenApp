import { NextResponse } from "next/server";
import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processShiftClosed } from "@/lib/pos-events";
import { hasModule } from "@/lib/modules";

// Evento del POS (shift.closed): mismo esquema de firma e idempotencia que /api/webhooks/pos/orders
// (HMAC con el secreto de la organización, x-reymen-event-id). Sin el módulo "Reymen POS" responde 403
// con code pos_module_disabled: el POS lo deja pendiente y lo reenvía cuando se active.
export const POST = createOrgWebhookHandler({
  rateLimitKey: "pos-shifts",
  source: "pos",
  eventType: "shift.closed",
  process: processShiftClosed,
  precheck: async (organizationId) => {
    const [pos, food] = await Promise.all([hasModule(organizationId, "REYMEN_POS"), hasModule(organizationId, "FOOD_OPS")]);
    if (pos && food) return null;
    return NextResponse.json({ error: "Reymen POS no está activado para este negocio en Reymen.", code: "pos_module_disabled" }, { status: 403 });
  },
  failureResponse: (error) => NextResponse.json({ error }, { status: 422 }),
});
