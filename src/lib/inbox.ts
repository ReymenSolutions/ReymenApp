import { hasModule } from "@/lib/modules";
import { UserError } from "@/lib/user-error";

/** El inbox lo ve quien tiene el CRM o la IA de WhatsApp (los dos trabajan sobre las mismas conversaciones). */
export async function hasInboxAccess(organizationId: string): Promise<boolean> {
  return (await hasModule(organizationId, "CRM")) || (await hasModule(organizationId, "AI_WHATSAPP"));
}

export async function assertInboxAccess(organizationId: string): Promise<void> {
  if (!(await hasInboxAccess(organizationId))) throw new UserError(`Tu organización no tiene el módulo "Inbox (CRM o Asistente IA)" habilitado.`);
}
