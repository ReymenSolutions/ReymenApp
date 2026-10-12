import { z } from "zod";
import type { Blueprint } from "../types";
import type { DailyReport } from "../report";

const configSchema = z.object({
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
  decide: (event) => {
    const report = (event.payload ?? {}) as Partial<DailyReport>;
    if (!report.date || !report.today) return { kind: "skip", reason: "no_report" };
    return { kind: "act", action: { type: "report", title: `Reporte del ${report.date}`, date: report.date, report: report as DailyReport } };
  },
  contactRules: () => ({ channel: "whatsapp", cooldownDays: 0, quietHours: null }),
};
