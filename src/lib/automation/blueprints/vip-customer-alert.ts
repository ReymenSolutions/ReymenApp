import { z } from "zod";
import type { Blueprint } from "../types";
import { NOTIFY_FIELDS, UNIT } from "../config-ui";
import { E164, NOTIFY_MODES } from "../notify";
import { formatMoney } from "@/lib/utils";

const configSchema = z.object({
  /** Además de la campana del portal: correo y/o WhatsApp (vía n8n). */
  notify: z.enum(NOTIFY_MODES).default("app"),
  /** WhatsApp del responsable (+código de país). */
  whatsappTo: z.string().regex(E164).optional().or(z.literal("")),
  /** Visitas a partir de las cuales un cliente es VIP. */
  minVisits: z.number().int().min(2).max(500).default(5),
  /** Gasto acumulado (en la moneda del negocio) a partir del cual un cliente es VIP. */
  minSpent: z.number().min(0).max(10_000_000).default(3000),
});
type Config = z.infer<typeof configSchema>;

type VipPayload = { customerId?: string; visitCount?: number; totalSpent?: number };

/** Avisa al equipo cuando un cliente llega a VIP (muchas visitas Y buen gasto) para que lo atiendan como merece. Un aviso por cliente. */
export const vipCustomerAlert: Blueprint<Config> = {
  key: "vip_customer_alert",
  version: 1,
  name: "Aviso de cliente VIP",
  description: "Avisa al equipo cuando un cliente llega a las visitas y al gasto que definiste como VIP, para saludarlo y cuidarlo. Un aviso por cliente; no le escribe al cliente.",
  trigger: "customer.vip",
  audience: "internal",
  requiredModules: ["REYMEN_POS"],
  overlapCategories: ["notifications"],
  status: "active",
  configSchema,
  defaultConfig: configSchema.parse({}),
  crossCheck: (c) => (c.notify.includes("whatsapp") && !c.whatsappTo ? { key: "whatsappTo", code: "required" as const } : null),
  configUi: {
    notify: NOTIFY_FIELDS.notify,
    whatsappTo: NOTIFY_FIELDS.whatsappTo,
    minVisits: { group: "when", kind: "number", label: { es: "Visitas para ser VIP", en: "Visits to be VIP" }, help: { es: "Se avisa cuando un cliente llega a este número de visitas (y además al gasto de abajo).", en: "Alerts when a customer reaches this number of visits (and also the spend below)." }, unit: UNIT.visits },
    minSpent: { group: "when", kind: "number", label: { es: "Gasto para ser VIP", en: "Spend to be VIP" }, help: { es: "Gasto acumulado del cliente. Debe cumplir las visitas y este gasto a la vez.", en: "The customer's accumulated spend. They must meet both the visits and this spend." } },
  },
  decide: (event, ctx, config) => {
    const p = (event.payload ?? {}) as VipPayload;
    const customer = ctx.customer;
    if (!customer) return { kind: "skip", reason: "no_customer" };
    // Entre que se detectó y que se procesó, la configuración pudo haber subido el listón.
    if (customer.visitCount < config.minVisits || Number(customer.totalSpent) < config.minSpent) return { kind: "skip", reason: "not_vip" };
    const name = customer.name ?? "Un cliente";
    return {
      kind: "act",
      action: {
        type: "alert",
        severity: "warning",
        title: `${name} ya es cliente VIP`,
        body: `${p.visitCount ?? customer.visitCount} visitas y ${formatMoney(Number(p.totalSpent ?? customer.totalSpent))} gastados.`,
        href: `/portal/customers?q=${encodeURIComponent(customer.phoneKey)}`,
      },
    };
  },
  // Es un aviso interno: no hay contacto con clientes (el motor no consulta la política de contacto).
  contactRules: () => ({ channel: "whatsapp", cooldownDays: 0, quietHours: null }),
};
