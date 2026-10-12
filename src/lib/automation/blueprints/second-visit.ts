import { z } from "zod";
import type { Blueprint } from "../types";

const configSchema = z.object({
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
  status: "active",
  configSchema,
  defaultConfig: configSchema.parse({}),
  decide: (_event, ctx) => {
    const customer = ctx.customer;
    if (!customer) return { kind: "skip", reason: "no_customer" };
    // Entre que se detectó y que se procesó, el cliente pudo haber regresado.
    if (customer.visitCount !== 1) return { kind: "skip", reason: "already_returned" };
    return { kind: "act", action: { type: "message", channel: "whatsapp", templateKey: "second_visit_v1", variables: { name: customer.name ?? "", businessName: ctx.organization.name } } };
  },
  contactRules: (config) => ({ channel: config.channel, cooldownDays: config.cooldownDays, quietHours: { start: config.quietStart, end: config.quietEnd } }),
};
