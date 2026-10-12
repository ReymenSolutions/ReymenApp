import { z } from "zod";
import type { ActionSpec, Blueprint } from "../types";
import { COMMON, UNIT } from "../config-ui";
import { createFeedbackRequest, feedbackUrl } from "@/lib/feedback";

const configSchema = z.object({
  channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
  /** Minutos después de la compra en que se pide la opinión. */
  delayMinutes: z.number().int().min(15).max(1440).default(120),
  /** Un cliente recibe a lo más una solicitud en este lapso. */
  cooldownDays: z.number().int().min(0).max(365).default(7),
  quietStart: z.number().int().min(0).max(23).default(21),
  quietEnd: z.number().int().min(0).max(23).default(9),
  /** Reseña pública (Google, etc.), https. Se ofrece a TODOS los que responden, sin importar su calificación. */
  reviewUrl: z.string().url().startsWith("https://").optional().or(z.literal("")),
});
type Config = z.infer<typeof configSchema>;

/** Pide la opinión del cliente un rato después de su compra, con un enlace a un formulario de Reymen. */
export const postVisitFeedback: Blueprint<Config> = {
  key: "post_visit_feedback",
  version: 1,
  name: "Opinión después de la visita",
  description: "Un rato después de la compra le manda al cliente (con su consentimiento) un enlace para calificar su visita. Una calificación de 3 o menos abre un caso de seguimiento y avisa a dueños y gerentes. La invitación a reseña pública se ofrece a todos los que respondan.",
  trigger: "sale.completed",
  requiredModules: ["REYMEN_POS"],
  overlapCategories: ["follow_up"],
  status: "active",
  configSchema,
  defaultConfig: configSchema.parse({}),
  configUi: {
    channel: COMMON.channel,
    delayMinutes: { group: "when", kind: "number", label: { es: "Pedir la opinión después de", en: "Ask for feedback after" }, help: { es: "Tiempo entre la compra y el mensaje. Si cae en horas de silencio, sale a la mañana siguiente.", en: "Time between the purchase and the message. If it falls in quiet hours it goes out the next morning." }, unit: UNIT.minutes },
    cooldownDays: { group: "limits", kind: "number", label: { es: "A lo más una solicitud cada", en: "At most one request every" }, help: { es: "Un cliente que compra seguido no recibe una solicitud por cada compra.", en: "A customer who buys often does not get a request for every purchase." }, unit: UNIT.days },
    quietStart: COMMON.quietStart, quietEnd: COMMON.quietEnd,
    reviewUrl: { group: "extras", kind: "url", label: { es: "Enlace para reseña pública", en: "Public review link" }, help: { es: "Opcional (https, p. ej. Google). Se ofrece a TODOS los que responden, sin importar su calificación.", en: "Optional (https, e.g. Google). Offered to EVERYONE who answers, regardless of their rating." } },
  },
  decide: (_event, ctx) => {
    if (!ctx.customer) return { kind: "skip", reason: "no_customer" };
    return { kind: "act", action: { type: "message", channel: "whatsapp", templateKey: "post_visit_feedback_v1", variables: { name: ctx.customer.name ?? "", businessName: ctx.organization.name, feedbackUrl: "" } } };
  },
  // La solicitud (y su enlace único) se crea justo antes de registrar la ejecución; en dry-run no se escribe nada.
  prepare: async ({ organizationId, event, customer, action, dryRun }): Promise<ActionSpec> => {
    if (action.type !== "message") return action;
    const saleId = ((event.payload ?? {}) as { saleId?: string }).saleId ?? null;
    const url = dryRun ? feedbackUrl("(se genera al enviar)") : feedbackUrl((await createFeedbackRequest(organizationId, customer.id, saleId)).token);
    return { ...action, variables: { ...action.variables, feedbackUrl: url } };
  },
  contactRules: (config) => ({ channel: config.channel, cooldownDays: config.cooldownDays, quietHours: { start: config.quietStart, end: config.quietEnd }, delayMinutes: config.delayMinutes }),
};
