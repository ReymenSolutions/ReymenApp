import type { PlatformModule } from "@prisma/client";

export type CrmTabKey = "today" | "inbox" | "contacts" | "pipeline" | "customers";

export type CrmTabDef = { key: CrmTabKey; href: string };

/**
 * Pestañas del CRM, en el orden en que trabaja un negocio: lo de hoy, la bandeja donde llegan los mensajes,
 * los leads, el pipeline y, con Foods, los clientes del negocio. Las direcciones son las de siempre (no se
 * rompe ningún enlace guardado): solo se agrupan bajo una entrada "CRM" del menú.
 * - Hoy, Leads y Pipeline: módulo CRM.
 * - Inbox: CRM o Agente IA.
 * - Clientes del negocio: Reymen Foods.
 * Citas NO es una pestaña: es una entrada propia del menú, visible siempre.
 */
export function getCrmTabs(enabled: PlatformModule[]): CrmTabDef[] {
  const has = (m: PlatformModule) => enabled.includes(m);
  const tabs: CrmTabDef[] = [];
  if (has("CRM")) tabs.push({ key: "today", href: "/portal/today" });
  if (has("CRM") || has("AI_WHATSAPP")) tabs.push({ key: "inbox", href: "/portal/inbox" });
  if (has("CRM")) tabs.push({ key: "contacts", href: "/portal/leads" });
  if (has("CRM")) tabs.push({ key: "pipeline", href: "/portal/pipeline" });
  if (has("FOOD_OPS")) tabs.push({ key: "customers", href: "/portal/customers" });
  return tabs;
}

/** Rutas que pertenecen al CRM: el menú marca "CRM" como activo en cualquiera de ellas. */
export const CRM_PATHS = ["/portal/today", "/portal/leads", "/portal/pipeline", "/portal/customers", "/portal/inbox", "/portal/conversations"];
