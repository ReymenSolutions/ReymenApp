import { z } from "zod";
import type { Blueprint } from "../types";
import { COMMON, CONTROL_FIELD, UNIT } from "../config-ui";

const configSchema = z.object({
  /** % de clientes elegibles que quedan como grupo de control (no reciben el mensaje). 0 = apagado. */
  controlGroupPct: z.number().int().min(0).max(50).default(0),
  channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
  /** Hora local (0–23) a partir de la cual se felicita a quien cumple años ese día. */
  sendHour: z.number().int().min(0).max(23).default(10),
  /** Un cliente recibe este mensaje una sola vez en este lapso (una felicitación por año). */
  cooldownDays: z.number().int().min(1).max(3650).default(300),
  quietStart: z.number().int().min(0).max(23).default(21),
  quietEnd: z.number().int().min(0).max(23).default(9),
});
type Config = z.infer<typeof configSchema>;

/** Felicita a quien cumple años hoy (solo con su consentimiento y con la fecha que dio). Una vez al año por cliente. */
export const birthdayCampaign: Blueprint<Config> = {
  key: "birthday_campaign",
  version: 1,
  name: "Campaña de cumpleaños",
  description: "El día del cumpleaños de un cliente le escribe para felicitarlo (solo con su consentimiento y con la fecha que él dio). Una vez al año por cliente.",
  trigger: "customer.birthday",
  requiredModules: ["REYMEN_POS"],
  overlapCategories: ["retention"],
  status: "active",
  configSchema,
  defaultConfig: configSchema.parse({}),
  configUi: {
    controlGroupPct: CONTROL_FIELD,
    channel: COMMON.channel,
    sendHour: { group: "when", kind: "hour", label: { es: "Felicitar a partir de las", en: "Send greetings from" }, help: { es: "Hora local del negocio. El mensaje sale el día del cumpleaños, no antes de esta hora.", en: "Local business time. The message goes out on the birthday, not before this hour." } },
    cooldownDays: { group: "limits", kind: "number", label: { es: "Un mensaje cada", en: "One message every" }, help: { es: "Un cliente recibe esta felicitación una sola vez en este lapso (por defecto, una al año).", en: "A customer receives this greeting only once in this period (by default, once a year)." }, unit: UNIT.days },
    quietStart: COMMON.quietStart, quietEnd: COMMON.quietEnd,
  },
  decide: (_event, ctx) => {
    const customer = ctx.customer;
    if (!customer) return { kind: "skip", reason: "no_customer" };
    return { kind: "act", action: { type: "message", channel: "whatsapp", templateKey: "birthday_campaign_v1", variables: { name: customer.name ?? "", businessName: ctx.organization.name } } };
  },
  contactRules: (config) => ({ channel: config.channel, cooldownDays: config.cooldownDays, quietHours: { start: config.quietStart, end: config.quietEnd } }),
};
