import { z } from "zod";
import type { Blueprint } from "../types";
import { COMMON, UNIT } from "../config-ui";

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
  overlapCategories: ["retention"],
  status: "active",
  configSchema,
  defaultConfig: configSchema.parse({}),
  crossCheck: (c) => (c.minDays >= c.maxDays ? { key: "minDays", code: "must_be_less", other: "maxDays" } : null),
  configUi: {
    channel: COMMON.channel,
    minVisits: { group: "who", kind: "number", label: { es: "Visitas mínimas", en: "Minimum visits" }, help: { es: "Cuántas veces tiene que haber venido para considerarlo cliente habitual.", en: "How many times they must have visited to count as a regular." }, unit: UNIT.visits },
    minDays: { group: "when", kind: "number", label: { es: "Mínimo sin venir", en: "Minimum time away" }, help: { es: "No se considera en riesgo antes de estos días sin venir, aunque su ritmo sea muy corto.", en: "Not considered at risk before this many days away, even if their pace is very short." }, unit: UNIT.days },
    factor: { group: "when", kind: "number", label: { es: "Veces su ritmo habitual", en: "Times their usual pace" }, help: { es: "En riesgo cuando lleva más de esta cantidad de veces el tiempo que suele tardar entre visitas (ejemplo: viene cada 12 días y 2.5 → 30 días).", en: "At risk when away for more than this many times their usual gap between visits (e.g. every 12 days and 2.5 → 30 days)." }, unit: UNIT.times },
    maxDays: { group: "limits", kind: "number", label: { es: "Darlo por perdido a los", en: "Give up after" }, help: { es: "Pasado este tiempo sin venir ya no se le insiste.", en: "After this much time away they are no longer chased." }, unit: UNIT.days },
    cooldownDays: { group: "limits", kind: "number", label: { es: "Un mensaje cada", en: "One message every" }, help: { es: "Mínimo entre dos mensajes de recuperación al mismo cliente.", en: "Minimum gap between two recovery messages to the same customer." }, unit: UNIT.days },
    quietStart: COMMON.quietStart, quietEnd: COMMON.quietEnd,
  },
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
