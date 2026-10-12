import { z } from "zod";
import type { Blueprint } from "../types";

const configSchema = z.object({
  channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
  /** Un cliente recibe la bienvenida una sola vez en este lapso. */
  cooldownDays: z.number().int().min(1).max(3650).default(365),
  quietStart: z.number().int().min(0).max(23).default(21),
  quietEnd: z.number().int().min(0).max(23).default(9),
});
type Config = z.infer<typeof configSchema>;

/** Bienvenida al cliente que el POS registra por primera vez (solo con su consentimiento). */
export const welcomeNewCustomer: Blueprint<Config> = {
  key: "welcome_new_customer",
  version: 1,
  name: "Bienvenida a clientes nuevos",
  description: "Cuando un cliente deja su teléfono por primera vez en el POS (con su consentimiento), le da la bienvenida.",
  trigger: "customer.created",
  requiredModules: ["REYMEN_POS"],
  overlapCategories: ["onboarding"],
  status: "active",
  configSchema,
  defaultConfig: configSchema.parse({}),
  decide: (_event, ctx) => {
    const customer = ctx.customer;
    if (!customer) return { kind: "skip", reason: "no_customer" };
    return {
      kind: "act",
      action: {
        type: "message",
        channel: "whatsapp",
        templateKey: "welcome_new_customer_v1",
        variables: { name: customer.name ?? "", businessName: ctx.organization.name },
      },
    };
  },
  contactRules: (config) => ({ channel: config.channel, cooldownDays: config.cooldownDays, quietHours: { start: config.quietStart, end: config.quietEnd } }),
};
