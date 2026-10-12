import { z } from "zod";
import type { Blueprint } from "../types";

const configSchema = z.object({
  channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
  /** Visitas mínimas para considerar a alguien cliente habitual. */
  minVisits: z.number().int().min(2).max(50).default(3),
  /** No se considera en riesgo antes de estos días sin venir. */
  minDays: z.number().int().min(7).max(365).default(21),
  /** En riesgo cuando lleva más de `factor` veces su intervalo habitual entre visitas. */
  factor: z.number().min(1.5).max(10).default(2.5),
  /** Pasado este tiempo ya se da por perdido: no se le insiste. */
  maxDays: z.number().int().min(30).max(720).default(180),
  cooldownDays: z.number().int().min(1).max(3650).default(60),
  quietStart: z.number().int().min(0).max(23).default(21),
  quietEnd: z.number().int().min(0).max(23).default(9),
});
type Config = z.infer<typeof configSchema>;

/** Escribe a clientes habituales que llevan mucho más de lo normal sin venir. Un mensaje por ausencia, con enfriamiento. */
export const customerRecovery: Blueprint<Config> = {
  key: "customer_recovery",
  version: 1,
  name: "Recuperación de clientes",
  description: "Si un cliente habitual lleva mucho más de lo normal sin venir (más de 2.5 veces su intervalo típico), le escribe para que regrese. Solo con su consentimiento, un mensaje por ausencia.",
  trigger: "customer.at_risk",
  requiredModules: ["REYMEN_POS"],
  status: "active",
  configSchema,
  defaultConfig: configSchema.parse({}),
  decide: (event, ctx) => {
    const customer = ctx.customer;
    if (!customer) return { kind: "skip", reason: "no_customer" };
    const p = (event.payload ?? {}) as { lastVisitAt?: string; daysSince?: number };
    // Si regresó después de detectarlo, ya no hace falta.
    if (p.lastVisitAt && customer.lastVisitAt && customer.lastVisitAt.getTime() > new Date(p.lastVisitAt).getTime()) return { kind: "skip", reason: "already_returned" };
    return {
      kind: "act",
      action: { type: "message", channel: "whatsapp", templateKey: "customer_recovery_v1", variables: { name: customer.name ?? "", businessName: ctx.organization.name, daysSince: String(p.daysSince ?? "") } },
    };
  },
  contactRules: (config) => ({ channel: config.channel, cooldownDays: config.cooldownDays, quietHours: { start: config.quietStart, end: config.quietEnd } }),
};
