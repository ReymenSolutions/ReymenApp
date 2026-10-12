import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { sendEmail } from "@/lib/email";
import { feedbackAlertEmail } from "@/lib/email-templates";
import { getAppUrl } from "@/lib/app-url";
import { reportRecipients } from "@/lib/automation/internal-delivery";

// ── Opiniones post-visita ────────────────────────────────────────────────────
// La respuesta llega directo a la base desde un formulario de Reymen (enlace único por venta); no se interpreta
// texto libre de WhatsApp. Calificación ≤ 3 → caso abierto para seguimiento y aviso interno.

/** Hasta esta calificación (inclusive) se abre un caso de seguimiento. */
export const LOW_SCORE_MAX = 3;
export const COMMENT_MAX = 1000;

export function feedbackUrl(token: string): string {
  return `${getAppUrl()}/feedback/${token}`;
}

/** Crea (o recupera, para la misma venta) la solicitud de opinión y devuelve su token. Reprocesar el evento no crea otra. */
export async function createFeedbackRequest(organizationId: string, customerId: string, saleId: string | null): Promise<{ id: string; token: string }> {
  if (saleId) {
    const existing = await prisma.customerFeedback.findUnique({ where: { organizationId_saleId: { organizationId, saleId } }, select: { id: true, token: true } });
    if (existing) return existing;
  }
  return prisma.customerFeedback.create({ data: { organizationId, customerId, saleId, token: randomBytes(24).toString("hex") }, select: { id: true, token: true } });
}

export type PublicFeedbackView = { businessName: string; customerName: string | null; state: "pending" | "answered"; score: number | null; reviewUrl: string | null };

/** Lo que ve quien abre el enlace (y solo eso: nada interno de la organización). Null si el token no existe. */
export async function getPublicFeedback(token: string): Promise<PublicFeedbackView | null> {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const fb = await prisma.customerFeedback.findUnique({ where: { token }, include: { organization: { select: { id: true, name: true } } } });
  if (!fb) return null;
  const customer = await prisma.customer.findFirst({ where: { id: fb.customerId, organizationId: fb.organizationId }, select: { name: true } });
  return { businessName: fb.organization.name, customerName: customer?.name ?? null, state: fb.status === "REQUESTED" ? "pending" : "answered", score: fb.score, reviewUrl: await reviewUrlFor(fb.organizationId) };
}

/** Enlace a la reseña pública del negocio (config de la automatización), si lo configuró. Se ofrece a TODOS los que responden. */
async function reviewUrlFor(organizationId: string): Promise<string | null> {
  const automation = await prisma.automation.findUnique({ where: { organizationId_blueprintKey: { organizationId, blueprintKey: "post_visit_feedback" } }, select: { config: true } });
  const url = (automation?.config as { reviewUrl?: string } | null)?.reviewUrl?.trim();
  return url && /^https:\/\//i.test(url) ? url : null;
}

/** Guarda la respuesta del cliente (una sola vez por enlace). Con calificación ≤ 3 abre el caso y avisa a dueños y gerentes. */
export async function submitFeedback(token: string, input: { score: unknown; comment?: unknown }): Promise<{ lowScore: boolean }> {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new UserError("Enlace no válido");
  const score = Number(input.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new UserError("Elige una calificación del 1 al 5");
  const comment = typeof input.comment === "string" ? input.comment.replace(/\s+/g, " ").trim().slice(0, COMMENT_MAX) : "";
  const low = score <= LOW_SCORE_MAX;

  // Solo la primera respuesta cuenta: la condición REQUESTED en el UPDATE evita que dos envíos a la vez se pisen.
  const { count } = await prisma.customerFeedback.updateMany({ where: { token, status: "REQUESTED" }, data: { score, comment: comment || null, respondedAt: new Date(), status: low ? "OPEN" : "ANSWERED" } });
  if (count === 0) {
    const exists = await prisma.customerFeedback.findUnique({ where: { token }, select: { id: true } });
    if (!exists) throw new UserError("Enlace no válido");
    throw new UserError("Ya recibimos tu opinión, ¡gracias!");
  }
  if (low) await notifyLowScore(token);
  return { lowScore: low };
}

async function notifyLowScore(token: string) {
  try {
    const fb = await prisma.customerFeedback.findUnique({ where: { token }, include: { organization: { select: { name: true } } } });
    if (!fb) return;
    const customer = await prisma.customer.findFirst({ where: { id: fb.customerId, organizationId: fb.organizationId }, select: { name: true, phone: true } });
    const recipients = await reportRecipients(fb.organizationId);
    const mail = feedbackAlertEmail(fb.organization.name, { score: fb.score ?? 0, comment: fb.comment, customerName: customer?.name ?? null, customerPhone: customer?.phone ?? null }, `${getAppUrl()}/portal/automations`);
    await Promise.all(recipients.map((to) => sendEmail({ to, subject: mail.subject, html: mail.html }).catch(() => ({ sent: false }))));
  } catch (err) {
    // Un correo que no sale no debe perder la opinión (ya quedó guardada y visible en el portal).
    console.error("[feedback] no se pudo avisar de la calificación baja", err);
  }
}

/** El equipo cierra el seguimiento de un caso abierto. */
export async function resolveFeedback(organizationId: string, id: string, userId: string, note?: string): Promise<void> {
  const { count } = await prisma.customerFeedback.updateMany({
    where: { id, organizationId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedById: userId, resolvedAt: new Date(), resolutionNote: note?.trim().slice(0, COMMENT_MAX) || null },
  });
  if (count === 0) throw new UserError("Este caso ya no está abierto");
}
