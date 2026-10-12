import { z } from "zod";
import type { Blueprint } from "../types";
import { COMMON, CONTROL_FIELD, UNIT } from "../config-ui";

const configSchema = z.object({
  /** % de clientes elegibles que quedan como grupo de control (no reciben el mensaje). 0 = apagado. */
  controlGroupPct: z.number().int().min(0).max(50).default(0),
  channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
  /** Días desde su primera visita sin que haya vuelto. */
  afterDays: z.number().int().min(3).max(90).default(14),
  /** Pasado este tiempo desde su primera visita ya no se le escribe (evita mensajes a clientes de hace años al encenderla). */
  maxDays: z.number().int().min(7).max(365).default(60),
  /** Un cliente recibe este mensaje una sola vez en este lapso. */
  cooldownDays: z.number().int().min(1).max(3650).default(365),
  quietStart: z.number().int().min(0).max(23).default(21),
  quietEnd: z.number().int().min(0).max(23).default(9),
});
type Config = z.infer<typeof configSchema>;

/** Invita a volver al cliente que vino una sola vez y no regresó (con su consentimiento). Una vez por cliente. */
export const secondVisit: Blueprint<Config> = {
  key: "second_visit",
  version: 1,
  name: "Segunda visita",
  description: "Si un cliente vino una sola vez y pasan N días sin que regrese, le escribe para invitarlo a volver (solo con su consentimiento y una vez por cliente).",
  trigger: "customer.second_visit_due",
  requiredModules: ["REYMEN_POS"],
  overlapCategories: ["retention"],
  status: "active",
  configSchema,
  defaultConfig: configSchema.parse({}),
  crossCheck: (c) => (c.afterDays >= c.maxDays ? { key: "afterDays", code: "must_be_less", other: "maxDays" } : null),
  configUi: {
    controlGroupPct: CONTROL_FIELD,
    channel: COMMON.channel,
    afterDays: { group: "when", kind: "number", label: { es: "Escribir después de", en: "Message after" }, help: { es: "Días desde su primera visita sin que haya vuelto.", en: "Days since their first visit without coming back." }, unit: UNIT.days },
    maxDays: { group: "limits", kind: "number", label: { es: "No escribir pasados", en: "Do not message after" }, help: { es: "Pasado este tiempo desde su primera visita ya no se le escribe (evita mensajes a clientes de hace años al encenderla).", en: "After this time since their first visit they are no longer messaged (avoids writing to customers from years ago when switched on)." }, unit: UNIT.days },
    cooldownDays: { group: "limits", kind: "number", label: { es: "Un mensaje cada", en: "One message every" }, help: { es: "Un cliente recibe este mensaje una sola vez en este lapso.", en: "A customer receives this message only once in this period." }, unit: UNIT.days },
    quietStart: COMMON.quietStart, quietEnd: COMMON.quietEnd,
  },
  decide: (_event, ctx) => {
    const customer = ctx.customer;
    if (!customer) return { kind: "skip", reason: "no_customer" };
    // Entre que se detectó y que se procesó, el cliente pudo haber regresado.
    if (customer.visitCount !== 1) return { kind: "skip", reason: "already_returned" };
    return { kind: "act", action: { type: "message", channel: "whatsapp", templateKey: "second_visit_v1", variables: { name: customer.name ?? "", businessName: ctx.organization.name } } };
  },
  contactRules: (config) => ({ channel: config.channel, cooldownDays: config.cooldownDays, quietHours: { start: config.quietStart, end: config.quietEnd } }),
};
