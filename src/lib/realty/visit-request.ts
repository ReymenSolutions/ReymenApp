// Solo servidor. «Agendar visita» de la landing pública /p/<slug>: la persona elige día y hora y la solicitud entra al
// módulo de Citas del CRM (un Appointment + la visita de la propiedad, igual que las que agenda un asesor) y a la vista
// «Visitas» de Real Estate, ligada a su Lead. Los horarios salen de la Agenda del negocio (AvailabilityRule) y de las
// visitas ya apartadas; la cita queda «Programada» (por confirmar) y avisa por correo al asesor.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/app-url";
import { renderBrandedEmail } from "@/lib/email-template";
import { normalizeWhatsapp } from "@/lib/public-api";
import { getOrgTimezone, localDateString, zonedMinuteToUtc } from "@/lib/business-day";
import { OPEN_STATUSES } from "./constants";
import { ensureLeadForProspect } from "./lead-adapter";
import { InquiryError } from "./inquiry";
import { getPublicProperty } from "./public";
import { scheduleVisit } from "./service";

export const VISIT_MINUTES = 60;
/** Anticipación mínima para pedir una visita. */
export const MIN_NOTICE_MS = 2 * 60 * 60 * 1000;
export const MAX_DAYS_AHEAD = 30;
/** Sin horarios configurados en la Agenda: lunes a sábado, de 9:00 a 18:00. */
const DEFAULT_WINDOW = { startMinute: 9 * 60, endMinute: 18 * 60 };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIVE = ["SCHEDULED", "CONFIRMED"] as const;

/** Día de la semana (0 = domingo) de un "YYYY-MM-DD". */
function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

interface VisitProperty {
  id: string;
  organizationId: string;
  advisorUserId: string | null;
}

async function loadProperty(slug: string) {
  const pub = await getPublicProperty(slug);
  if (!pub || !(OPEN_STATUSES as string[]).includes(pub.status)) throw new InquiryError("unavailable");
  const prop = await prisma.realtyProperty.findUnique({ where: { id: pub.id }, select: { id: true, organizationId: true, title: true, slug: true, advisorUserId: true } });
  if (!prop) throw new InquiryError("unavailable");
  return prop;
}

/** Horarios libres de un día (instantes de inicio). Día en la zona de la organización, "YYYY-MM-DD". */
export async function listVisitSlots(prop: VisitProperty, day: string, now: Date = new Date()): Promise<{ tz: string; slots: Date[] }> {
  const tz = await getOrgTimezone(prop.organizationId);
  if (!DAY_RE.test(day)) throw new InquiryError("date_invalid");
  const today = localDateString(now, tz);
  if (day < today || day > addDays(today, MAX_DAYS_AHEAD)) throw new InquiryError("date_invalid");

  const weekday = weekdayOf(day);
  const rules = await prisma.availabilityRule.findMany({ where: { organizationId: prop.organizationId, isActive: true } });
  const windows = rules.length ? rules.filter((r) => r.dayOfWeek === weekday) : weekday >= 1 && weekday <= 6 ? [DEFAULT_WINDOW] : [];

  const candidates: Date[] = [];
  for (const w of windows) {
    for (let m = w.startMinute; m + VISIT_MINUTES <= w.endMinute; m += VISIT_MINUTES) candidates.push(zonedMinuteToUtc(day, m, tz));
  }
  const earliest = now.getTime() + MIN_NOTICE_MS;
  const open = candidates.filter((c) => c.getTime() >= earliest).sort((a, b) => a.getTime() - b.getTime());
  if (!open.length) return { tz, slots: [] };

  const dayStart = zonedMinuteToUtc(day, 0, tz);
  const dayEnd = zonedMinuteToUtc(day, 24 * 60, tz);
  const busy = await prisma.realtyPropertyVisit.findMany({
    where: {
      organizationId: prop.organizationId,
      OR: [{ propertyId: prop.id }, ...(prop.advisorUserId ? [{ advisorUserId: prop.advisorUserId }] : [])],
      appointment: { status: { in: [...LIVE] }, startTime: { lt: dayEnd }, endTime: { gt: dayStart } },
    },
    select: { appointment: { select: { startTime: true, endTime: true } } },
  });
  const free = open.filter((s) => {
    const end = s.getTime() + VISIT_MINUTES * 60_000;
    return !busy.some((b) => b.appointment.startTime.getTime() < end && b.appointment.endTime.getTime() > s.getTime());
  });
  return { tz, slots: free };
}

export async function getVisitSlots(slug: string, day: string, now: Date = new Date()) {
  const prop = await loadProperty(slug);
  const { tz, slots } = await listVisitSlots(prop, day, now);
  return { timezone: tz, slots: slots.map((s) => s.toISOString()) };
}

export const visitRequestSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(30),
  /** Inicio elegido: uno de los horarios que devolvió `getVisitSlots`. */
  startsAt: z.string().datetime(),
  notes: z.string().trim().max(300).optional(),
  consent: z.literal(true),
  /** Campo trampa. */
  website: z.string().max(200).optional(),
});

export type VisitRequestResult = { saved: true; visitId: string; startsAt: string; leadSaved: boolean };

export async function requestVisit(raw: unknown, ctx: { now?: Date } = {}): Promise<VisitRequestResult> {
  const d = visitRequestSchema.parse(raw);
  const now = ctx.now ?? new Date();
  const phone = normalizeWhatsapp(d.phone);
  if (!phone) throw new InquiryError("phone_invalid");

  const prop = await loadProperty(d.slug);
  const orgId = prop.organizationId;
  const start = new Date(d.startsAt);
  const tz = await getOrgTimezone(orgId);
  // Solo un horario que de verdad esté libre (Agenda del negocio, anticipación, visitas ya apartadas).
  const { slots } = await listVisitSlots(prop, localDateString(start, tz), now).catch((err) => {
    if (err instanceof InquiryError) throw new InquiryError("slot_unavailable");
    throw err;
  });
  if (!slots.some((s) => s.getTime() === start.getTime())) throw new InquiryError("slot_unavailable");

  // Contacto del CRM; si el plan ya no admite más contactos la visita se agenda igual, con los datos en la cita.
  let leadId: string | null = null;
  try {
    leadId = (await ensureLeadForProspect(orgId, null, { name: d.name, phone, source: "realty-landing" })).leadId;
  } catch (err) {
    if (!(err instanceof UserError)) throw err;
  }
  if (leadId && prop.advisorUserId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedTo: true } });
    if (!lead?.assignedTo) await prisma.lead.update({ where: { id: leadId }, data: { assignedTo: prop.advisorUserId } });
  }

  const description = [`Solicitud desde la landing de la propiedad. Por confirmar con la persona.`, `Contacto: ${d.name} · ${phone}`, d.notes ? `Comentario: ${d.notes}` : null].filter(Boolean).join("\n");
  let visitId: string;
  try {
    visitId = await scheduleVisit(orgId, null, { propertyId: prop.id, profileId: null, leadId, advisorUserId: prop.advisorUserId, startTime: start, durationMinutes: VISIT_MINUTES, notes: d.notes ?? null, description, source: "realty-landing" });
  } catch (err) {
    if (err instanceof UserError) throw new InquiryError("slot_unavailable");
    throw err;
  }
  await notifyAdvisor({ orgId, advisorUserId: prop.advisorUserId, visitId, propertyTitle: prop.title, name: d.name, phone, start, tz, notes: d.notes ?? null }).catch(() => undefined);
  return { saved: true, visitId, startsAt: start.toISOString(), leadSaved: leadId !== null };
}

async function notifyAdvisor(n: { orgId: string; advisorUserId: string | null; visitId: string; propertyTitle: string; name: string; phone: string; start: Date; tz: string; notes: string | null }) {
  const advisor = n.advisorUserId ? await prisma.user.findFirst({ where: { id: n.advisorUserId, organizationId: n.orgId, isActive: true }, select: { email: true } }) : null;
  const recipients = advisor ? [advisor.email] : (await prisma.user.findMany({ where: { organizationId: n.orgId, role: { in: ["OWNER", "ADMIN", "MANAGER"] }, isActive: true }, select: { email: true } })).map((u) => u.email);
  if (!recipients.length) return;
  const when = new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeStyle: "short", timeZone: n.tz }).format(n.start);
  const digits = n.phone.replace(/\D/g, "");
  const { html, text } = renderBrandedEmail({
    preheader: `${n.name} · ${when}`,
    title: "Nueva solicitud de visita",
    intro: `${n.name} pidió visitar «${n.propertyTitle}». Quedó en Citas como «Programada»: confírmala con la persona.`,
    rows: [
      { label: "Propiedad", value: n.propertyTitle },
      { label: "Fecha y hora", value: when },
      { label: "Nombre", value: n.name },
      { label: "WhatsApp", value: n.phone, href: `tel:${n.phone}` },
    ],
    note: n.notes ? { label: "Comentario", text: n.notes } : undefined,
    actions: [
      { label: "Ver en Citas", url: appUrl("/portal/appointments") },
      { label: "Escribir por WhatsApp", url: `https://wa.me/${digits}`, secondary: true },
    ],
  });
  await Promise.all(recipients.map((to) => sendEmail({ to, subject: `Solicitud de visita: ${n.name}`, html, text }).catch(() => undefined)));
}

