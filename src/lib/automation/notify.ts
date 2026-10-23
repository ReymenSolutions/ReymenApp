import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/email";
import { dailyReportEmail } from "@/lib/email-templates";
import { getAppUrl } from "@/lib/app-url";
import type { ActionSpec } from "./types";

// ── Avisos internos por WhatsApp o correo (vía n8n) ──────────────────────────
// Reymen decide a QUIÉN (dueños y gerentes activos, y el WhatsApp del responsable si se configuró) y QUÉ dice el
// mensaje (asunto, texto y HTML ya armados). n8n solo lo entrega por el canal: no consulta nada ni decide nada.

export const NOTIFY_MODES = ["app", "email", "whatsapp", "email_whatsapp"] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];
/** Modo por defecto de los avisos de calificaciones bajas (el blueprint y el aviso comparten este valor). */
export const DEFAULT_FEEDBACK_NOTIFY: NotifyMode = "email";

/** WhatsApp del responsable en formato internacional (+521…). */
export const E164 = /^\+[1-9]\d{9,14}$/;

export function notifyChannels(mode: NotifyMode | undefined): { email: boolean; whatsapp: boolean } {
  return { email: mode === "email" || mode === "email_whatsapp", whatsapp: mode === "whatsapp" || mode === "email_whatsapp" };
}

export type NotifyRecipient = { channel: "email"; email: string; name: string | null } | { channel: "whatsapp"; phone: string; name: string | null };

/** Destinatarios del aviso según el modo configurado. Vacío = solo la campana del portal. */
export async function resolveNotifyRecipients(organizationId: string, config: { notify?: NotifyMode; whatsappTo?: string }): Promise<NotifyRecipient[]> {
  const { email, whatsapp } = notifyChannels(config.notify);
  const out: NotifyRecipient[] = [];
  if (email) {
    const users = await prisma.user.findMany({ where: { organizationId, isActive: true, role: { in: ["OWNER", "SUPER_ADMIN", "MANAGER"] } }, select: { email: true, name: true }, orderBy: { createdAt: "asc" } });
    for (const u of users) out.push({ channel: "email", email: u.email, name: u.name });
  }
  if (whatsapp && config.whatsappTo && E164.test(config.whatsappTo)) out.push({ channel: "whatsapp", phone: config.whatsappTo, name: null });
  return out;
}

export type NotifyContent = { title: string; subject: string; text: string; html: string };

const money = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Texto, asunto y HTML del aviso, armados por Reymen (n8n solo los entrega). */
export function buildNotifyContent(organizationName: string, action: Extract<ActionSpec, { type: "alert" | "report" }>): NotifyContent {
  const portal = `${getAppUrl()}/portal/automations`;
  if (action.type === "alert") {
    const subject = `${action.title} — ${organizationName}`;
    const text = `${action.title}\n${action.body}\n${getAppUrl()}${action.href}`;
    return { title: action.title, subject, text, html: `<p><strong>${escapeHtml(action.title)}</strong></p><p>${escapeHtml(action.body)}</p><p><a href="${escapeHtml(getAppUrl() + action.href)}">Abrir Reymen</a></p>` };
  }
  const r = action.report;
  const mail = dailyReportEmail(organizationName, r, portal);
  const lines = [
    `Reporte del ${r.date} — ${organizationName}`,
    `Ventas: ${money(r.today.gross)} (${r.today.tickets} tickets, promedio ${money(r.today.avgTicket)})`,
    `vs. ayer: ${r.vsPreviousDayPct ?? "—"}% · vs. semana pasada: ${r.vsLastWeekPct ?? "—"}%`,
    `Cancelaciones: ${r.today.cancellations} (${money(r.today.cancelledAmount)})`,
    ...(r.topProducts.length ? [`Lo más vendido: ${r.topProducts.map((p) => `${p.name} (${p.quantity})`).join(", ")}`] : []),
    ...(r.criticalStock.length ? [`Stock crítico: ${r.criticalStock.map((i) => `${i.name} ${i.currentStock} ${i.unit}`).join(", ")}`] : []),
    portal,
  ];
  return { title: action.title, subject: mail.subject, text: lines.join("\n"), html: mail.html };
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** La acción interna con sus destinatarios y su contenido listos para el despachador (si hay a quién avisar por fuera). */
export async function withNotification(organizationId: string, organizationName: string, action: Extract<ActionSpec, { type: "alert" | "report" }>, config: { notify?: NotifyMode; whatsappTo?: string }) {
  const recipients = await resolveNotifyRecipients(organizationId, config);
  return { action: { ...action, recipients, content: recipients.length ? buildNotifyContent(organizationName, action) : undefined }, external: recipients.length > 0 };
}

export { stripHtml };
