import { z } from "zod";
import type { Blueprint } from "../types";
import { COMMON, UNIT, NOTIFY_FIELDS } from "../config-ui";
import { E164, NOTIFY_MODES } from "../notify";
import type { StockLevel } from "@/lib/food-inventory";

const configSchema = z.object({
  /** Además de la campana del portal: correo y/o WhatsApp (vía n8n). */
  notify: z.enum(NOTIFY_MODES).default("app"),
  /** WhatsApp del responsable (+código de país). */
  whatsappTo: z.string().regex(E164).optional().or(z.literal("")),
  /** "low" avisa desde que baja del mínimo; "critical" solo cuando está agotado o casi. */
  minLevel: z.enum(["low", "critical"]).default("low"),
});
type Config = z.infer<typeof configSchema>;

type LevelPayload = { name?: string; unit?: string; level?: StockLevel; currentStock?: number; minStock?: number };

const fmt = (n: number | undefined) => (typeof n === "number" ? String(Math.round(n * 1000) / 1000) : "?");

/** Aviso al equipo cuando un insumo baja del mínimo o llega a nivel crítico. Un aviso por insumo y nivel; nunca bloquea una venta. */
export const inventoryLowAlert: Blueprint<Config> = {
  key: "inventory_low_alert",
  version: 1,
  name: "Alerta de inventario bajo",
  description: "Avisa al equipo (campana del portal) cuando un insumo baja de su mínimo o se agota. Un aviso por insumo y nivel hasta que se recupere.",
  trigger: "inventory.level_changed",
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
    minLevel: { group: "when", kind: "select", label: { es: "Avisar desde el nivel", en: "Alert from level" }, help: { es: "\"Bajo\" avisa en cuanto un insumo baja de su mínimo; \"Crítico\" solo cuando está agotado o casi.", en: "\"Low\" alerts as soon as a supply drops below its minimum; \"Critical\" only when it is out or nearly out." }, options: { low: { es: "Bajo (por debajo del mínimo)", en: "Low (below minimum)" }, critical: { es: "Crítico (agotado o casi)", en: "Critical (out or nearly out)" } } },
  },
  decide: (event, _ctx, config) => {
    const p = (event.payload ?? {}) as LevelPayload;
    if (!p.level || p.level === "ok") return { kind: "skip", reason: "not_low" };
    if (config.minLevel === "critical" && p.level !== "critical") return { kind: "skip", reason: "below_min_level" };
    const critical = p.level === "critical";
    const name = p.name ?? "Insumo";
    return {
      kind: "act",
      action: {
        type: "alert",
        severity: critical ? "critical" : "warning",
        title: critical ? `${name}: nivel crítico` : `${name}: por debajo del mínimo`,
        body: `Quedan ${fmt(p.currentStock)} ${p.unit ?? ""} (mínimo ${fmt(p.minStock)}).`.replace(/\s+\)/, ")"),
        href: "/portal/food/inventory",
      },
    };
  },
  // Es un aviso interno: no hay contacto con clientes (el motor no consulta la política de contacto).
  contactRules: () => ({ channel: "whatsapp", cooldownDays: 0, quietHours: null }),
};
