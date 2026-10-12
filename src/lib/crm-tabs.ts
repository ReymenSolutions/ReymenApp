import type { PlatformModule } from "@prisma/client";

export type CrmTabKey = "today" | "contacts" | "pipeline" | "appointments" | "customers" | "inbox";

export type CrmTabDef = { key: CrmTabKey; href: string };

/**
 * Pestañas del CRM y de qué módulo depende cada una. Las direcciones son las de siempre (no se rompe ningún
 * enlace guardado): solo se agrupan bajo una entrada "CRM" del menú.
 * - Hoy, Contactos y Pipeline: módulo CRM.
 * - Citas: siempre (no depende de un módulo).
 * - Clientes del negocio: Reymen Foods.
 * - Inbox: CRM o Asistente IA.
 */
export function getCrmTabs(enabled: PlatformModule[]): CrmTabDef[] {
  const has = (m: PlatformModule) => enabled.includes(m);
  const tabs: CrmTabDef[] = [];
  if (has("CRM")) tabs.push({ key: "today", href: "/portal/today" });
  if (has("CRM")) tabs.push({ key: "contacts", href: "/portal/leads" });
  if (has("CRM")) tabs.push({ key: "pipeline", href: "/portal/pipeline" });
  if (has("CRM") || has("AI_WHATSAPP")) tabs.push({ key: "inbox", href: "/portal/inbox" });
  tabs.push({ key: "appointments", href: "/portal/appointments" });
  if (has("FOOD_OPS")) tabs.push({ key: "customers", href: "/portal/customers" });
  return tabs;
}

/** Rutas que pertenecen al CRM: el menú marca "CRM" como activo en cualquiera de ellas. */
export const CRM_PATHS = ["/portal/today", "/portal/leads", "/portal/pipeline", "/portal/appointments", "/portal/customers", "/portal/inbox", "/portal/conversations"];
