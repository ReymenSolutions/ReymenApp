import type { PlatformModule } from "@prisma/client";

/**
 * Datos de la pantalla de Inicio del portal, sin acceso a la base: qué
 * atajos y qué avisos se muestran según los módulos contratados. Va aparte
 * de la página para poder probar las reglas.
 */

export interface HomeShortcut {
  key: string;
  href: string;
  /** Nombre de un ícono de lucide-react (ver HomeShortcuts). */
  icon: "utensils" | "inventory" | "list" | "chat" | "calendar" | "users" | "zap" | "card" | "chart" | "help" | "settings" | "truck";
  module?: PlatformModule;
}

// Orden pensado para alguien sin experiencia técnica: primero lo que se hace
// todos los días, al final ayuda y ajustes.
export const HOME_SHORTCUTS: HomeShortcut[] = [
  { key: "sales", href: "/portal/food/sales", icon: "utensils", module: "FOOD_OPS" },
  { key: "operations", href: "/portal/food/operations", icon: "chart", module: "FOOD_OPS" },
  { key: "inventory", href: "/portal/food/inventory", icon: "inventory", module: "FOOD_OPS" },
  { key: "delivery", href: "/portal/food/delivery", icon: "truck", module: "FOOD_OPS" },
  { key: "messages", href: "/portal/conversations", icon: "chat", module: "AI_WHATSAPP" },
  { key: "appointments", href: "/portal/appointments", icon: "calendar" },
  { key: "today", href: "/portal/today", icon: "list", module: "CRM" },
  { key: "clients", href: "/portal/leads", icon: "users", module: "CRM" },
  { key: "card", href: "/portal/smartcard", icon: "card", module: "NFC_QR" },
  { key: "automations", href: "/portal/automations", icon: "zap", module: "AUTOMATIONS" },
  { key: "reports", href: "/portal/reports", icon: "chart" },
  { key: "help", href: "/portal/requests", icon: "help" },
  { key: "settings", href: "/portal/settings", icon: "settings" },
];

export function shortcutsFor(enabled: PlatformModule[]): HomeShortcut[] {
  return HOME_SHORTCUTS.filter((s) => !s.module || enabled.includes(s.module));
}

export type DayPart = "morning" | "afternoon" | "evening";

/** Buenos días / tardes / noches según la hora del negocio (no la del servidor). */
export function dayPartIn(timeZone: string, now = new Date()): DayPart {
  let hour: number;
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  } catch {
    hour = now.getHours();
  }
  if (hour < 12) return "morning";
  if (hour < 19) return "afternoon";
  return "evening";
}

const TITLES = new Set(["dr", "dra", "lic", "licda", "ing", "arq", "mtro", "mtra", "prof", "sr", "sra", "srta", "c", "don", "doña", "mr", "mrs", "ms", "miss"]);

/** Primer nombre para saludar, sin título: "Dr. Carlos Ramírez" → "Carlos"; sin nombre, nada. */
export function firstNameOf(name: string | null | undefined): string | null {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const first = words.find((w) => !TITLES.has(w.replace(/\.$/, "").toLowerCase()));
  return first ?? null;
}
