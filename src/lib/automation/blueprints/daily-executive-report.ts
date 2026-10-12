import { z } from "zod";
import type { Blueprint } from "../types";
import { COMMON, UNIT, NOTIFY_FIELDS } from "../config-ui";
import { E164, NOTIFY_MODES } from "../notify";
import type { DailyReport } from "../report";

const configSchema = z.object({
  /** Además de la campana del portal: correo y/o WhatsApp (vía n8n). */
  notify: z.enum(NOTIFY_MODES).default("email"),
  /** WhatsApp del responsable (+código de país). */
  whatsappTo: z.string().regex(E164).optional().or(z.literal("")),
  /** Hora local (0–23) a partir de la cual se manda el reporte del día anterior. */
  sendHour: z.number().int().min(0).max(23).default(8),
});
type Config = z.infer<typeof configSchema>;

/** Resumen diario para dueños y gerentes (por correo y en la actividad del portal), con los números del día anterior. */
export const dailyExecutiveReport: Blueprint<Config> = {
  key: "daily_executive_report",
  version: 1,
  name: "Reporte ejecutivo diario",
  description: "Cada mañana manda a dueños y gerentes el resumen del día anterior: ventas, tickets, comparativos, top productos, cancelaciones, stock crítico y merma.",
  trigger: "report.daily_due",
  audience: "internal",
  requiredModules: ["FOOD_OPS"],
  overlapCategories: ["notifications"],
  status: "active",
  configSchema,
  defaultConfig: configSchema.parse({}),
  crossCheck: (c) => (c.notify.includes("whatsapp") && !c.whatsappTo ? { key: "whatsappTo", code: "required" as const } : null),
  configUi: {
    notify: NOTIFY_FIELDS.notify,
    whatsappTo: NOTIFY_FIELDS.whatsappTo,
    sendHour: { group: "when", kind: "hour", label: { es: "Enviar a partir de las", en: "Send from" }, help: { es: "Hora local del negocio. Se manda el resumen del día anterior, una vez al día.", en: "Local business time. The previous day's summary is sent once a day." } },
  },
  decide: (event) => {
    const report = (event.payload ?? {}) as Partial<DailyReport>;
    if (!report.date || !report.today) return { kind: "skip", reason: "no_report" };
    return { kind: "act", action: { type: "report", title: `Reporte del ${report.date}`, date: report.date, report: report as DailyReport } };
  },
  contactRules: () => ({ channel: "whatsapp", cooldownDays: 0, quietHours: null }),
};
