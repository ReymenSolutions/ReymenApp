import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { dailyReportEmail } from "@/lib/email-templates";
import { getAppUrl } from "@/lib/app-url";
import type { ActionSpec } from "./types";

/** Dueños y gerentes activos de la organización (a quienes llegan los reportes). */
export async function reportRecipients(organizationId: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { organizationId, isActive: true, role: { in: ["OWNER", "MANAGER"] } }, select: { email: true } });
  return users.map((u) => u.email);
}

/**
 * Entrega de las acciones internas que salen del portal (hoy: el reporte diario por correo). Nunca lanza: un correo
 * que no sale no debe tumbar el procesamiento del evento (el reporte igual queda en la actividad del portal).
 */
export async function deliverInternalAction(organizationId: string, organizationName: string, action: ActionSpec): Promise<{ sent: number }> {
  if (action.type !== "report") return { sent: 0 };
  try {
    const recipients = await reportRecipients(organizationId);
    const mail = dailyReportEmail(organizationName, action.report, `${getAppUrl()}/portal/automations`);
    const results = await Promise.all(recipients.map((to) => sendEmail({ to, subject: mail.subject, html: mail.html }).catch(() => ({ sent: false }))));
    return { sent: results.filter((r) => r.sent).length };
  } catch (err) {
    console.error("[automation] no se pudo entregar la acción interna", err);
    return { sent: 0 };
  }
}
