import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import type { PlatformModule } from "@prisma/client";
import { UserError } from "./user-error";

/**
 * Commercial module entitlements — distinct from RBAC (permissions.ts,
 * what a user may do) and from feature flags (gradual rollout of
 * experimental functionality within an already-enabled module). This
 * answers "does this organization's account have access to this line of
 * business at all."
 */
// Kept in Spanish — used as-is in thrown error messages (assertModuleEnabled
// below), which aren't routed through the UI lang toggle. UI code that
// displays module names to the user should use getModuleLabel(lang) instead.
export const MODULE_LABEL: Record<PlatformModule, string> = {
  CRM: "CRM",
  AI_WHATSAPP: "Asistente IA / WhatsApp",
  AUTOMATIONS: "Automatizaciones",
  NFC_QR: "Smart Cards NFC/QR",
  MARKETING_ADS: "Marketing / Ads",
  FOOD_OPS: "Reymen Foods",
  REYMEN_POS: "Reymen POS",
  LOYALTY: "Reymen Loyalty (Lealtad)",
};

const MODULE_LABEL_EN: Record<PlatformModule, string> = {
  CRM: "CRM",
  AI_WHATSAPP: "AI Assistant / WhatsApp",
  AUTOMATIONS: "Automations",
  NFC_QR: "Smart Cards NFC/QR",
  MARKETING_ADS: "Marketing / Ads",
  FOOD_OPS: "Reymen Foods",
  REYMEN_POS: "Reymen POS",
  LOYALTY: "Reymen Loyalty",
};

/** Todos los módulos, en el orden en que se muestran. */
export const ALL_MODULES: PlatformModule[] = ["CRM", "AI_WHATSAPP", "AUTOMATIONS", "NFC_QR", "MARKETING_ADS", "FOOD_OPS", "REYMEN_POS", "LOYALTY"];

export function getModuleLabel(lang: "es" | "en"): Record<PlatformModule, string> {
  return lang === "es" ? MODULE_LABEL : MODULE_LABEL_EN;
}

export async function hasModule(organizationId: string, module: PlatformModule): Promise<boolean> {
  const entitlement = await prisma.organizationModule.findUnique({
    where: { organizationId_module: { organizationId, module } },
    select: { status: true },
  });
  return entitlement?.status === "ACTIVE";
}

/** For Server Actions: throws a clear, user-facing error if the module isn't enabled. */
export async function assertModuleEnabled(organizationId: string, module: PlatformModule): Promise<void> {
  if (!(await hasModule(organizationId, module))) {
    throw new UserError(`Tu organización no tiene el módulo "${MODULE_LABEL[module]}" habilitado.`);
  }
}

/**
 * Las organizaciones que venden con Reymen POS reciben sus ventas por el
 * webhook del POS; capturarlas a mano en el portal las duplicaría ("Registrar
 * venta") o reemplazaría lo que mandó el POS ("Ventas de hoy por platillo").
 */
export const MANUAL_SALES_BLOCKED_MESSAGE =
  "Las ventas llegan desde Reymen POS; la captura manual está desactivada para no duplicarlas ni reemplazarlas.";

export async function assertManualSalesAllowed(organizationId: string): Promise<void> {
  if (await hasModule(organizationId, "REYMEN_POS")) throw new UserError(MANUAL_SALES_BLOCKED_MESSAGE);
}

/** For Server Component pages: redirects instead of throwing, since there's no toast to catch an error. */
export async function requireModule(organizationId: string, module: PlatformModule): Promise<void> {
  if (!(await hasModule(organizationId, module))) {
    redirect("/portal/dashboard");
  }
}

export async function getEnabledModules(organizationId: string): Promise<PlatformModule[]> {
  const rows = await prisma.organizationModule.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { module: true },
  });
  return rows.map((r) => r.module);
}
