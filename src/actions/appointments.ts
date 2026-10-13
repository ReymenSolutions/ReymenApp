"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWithinAvailability } from "@/lib/availability";
import { logAudit } from "@/lib/audit";
import { recordMetric, METRIC_KEYS } from "@/lib/metrics";
import type { AppointmentStatus } from "@prisma/client";
import { UserError } from "@/lib/user-error";
import { assertOrgLead } from "@/lib/org-guards";

// Only these statuses represent a live, upcoming commitment that occupies a
// slot. A CANCELLED or NO_SHOW appointment frees the slot back up; COMPLETED
// only ever applies to a slot already in the past, so it never conflicts
// with a new booking in practice, but is excluded on the same logic as
// CANCELLED/NO_SHOW: it's not something a new booking needs to avoid.
const BLOCKING_STATUSES: AppointmentStatus[] = ["SCHEDULED", "CONFIRMED"];

async function resolveService(organizationId: string, serviceId: string | undefined) {
  if (!serviceId) return null;
  const service = await prisma.service.findFirst({ where: { id: serviceId, organizationId, isActive: true } });
  if (!service) throw new UserError("Servicio no encontrado");
  return service;
}

/**
 * Books `[start, effectiveEnd)`, where `effectiveEnd = end + service buffer`
 * for the purposes of blocking a following booking, then persists the
 * appointment with its real (unbuffered) end time. Shared by create and
 * reschedule so both enforce the same overlap/availability rules.
 */
async function bookSlot(
  organizationId: string,
  data: {
    title: string;
    description?: string;
    leadId?: string;
    serviceId?: string;
    start: Date;
    end: Date;
    excludeAppointmentId?: string;
    /** Al reactivar una cita cancelada: el estado que se aplica en la misma transacción que la comprobación de solapamiento. */
    reactivateAs?: AppointmentStatus;
  }
) {
  if (data.end <= data.start) throw new UserError("La hora de fin debe ser posterior a la de inicio");

  const [org, service] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } }),
    resolveService(organizationId, data.serviceId),
  ]);

  const bufferMs = (service?.bufferMinutes ?? 0) * 60 * 1000;
  const bufferedEnd = new Date(data.end.getTime() + bufferMs);

  const available = await isWithinAvailability(organizationId, org.timezone, data.start, data.end);
  if (!available) throw new UserError("Ese horario está fuera del horario de disponibilidad configurado.");

  // The buffer must also block against an EXISTING appointment's own
  // service buffer (e.g. a haircut with a 15-min cleanup buffer must still
  // keep the next booking out, even if that next booking has no buffer of
  // its own) — not just the new appointment's. Since each existing row's
  // effective buffer depends on its own service, this can't be expressed as
  // a single column comparison in the WHERE clause, so we widen the
  // candidate window by the largest possible buffer (matches the zod cap
  // on Service.bufferMinutes) and do the precise per-row check in JS.
  const MAX_BUFFER_MS = 24 * 60 * 60 * 1000;

  try {
    await prisma.$transaction(
      async (tx) => {
        const candidates = await tx.appointment.findMany({
          where: {
            organizationId,
            status: { in: BLOCKING_STATUSES },
            id: data.excludeAppointmentId ? { not: data.excludeAppointmentId } : undefined,
            startTime: { lt: bufferedEnd },
            endTime: { gt: new Date(data.start.getTime() - MAX_BUFFER_MS) },
          },
          select: { startTime: true, endTime: true, service: { select: { bufferMinutes: true } } },
        });

        const overlapping = candidates.some((existing) => {
          const existingBufferedEnd = new Date(
            existing.endTime.getTime() + (existing.service?.bufferMinutes ?? 0) * 60 * 1000
          );
          return existing.startTime < bufferedEnd && existingBufferedEnd > data.start;
        });
        if (overlapping) throw new UserError("Ese horario ya está ocupado por otra cita.");

        if (data.excludeAppointmentId) {
          await tx.appointment.update({
            where: { id: data.excludeAppointmentId },
            data: { startTime: data.start, endTime: data.end, ...(data.reactivateAs ? { status: data.reactivateAs } : {}) },
          });
        } else {
          await tx.appointment.create({
            data: {
              organizationId,
              title: data.title,
              description: data.description,
              leadId: data.leadId,
              serviceId: service?.id,
              startTime: data.start,
              endTime: data.end,
              source: "manual",
            },
          });
        }
      },
      // Read Committed (Postgres's default) lets two concurrent transactions
      // both pass the overlap check above before either commits — a classic
      // check-then-act race that would double-book the slot. Serializable
      // makes Postgres itself detect that conflict and abort one of the two
      // transactions instead, which we surface as the same "slot taken" error.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw new UserError("Ese horario ya está ocupado por otra cita.");
    }
    throw err;
  }
}

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  startTime: z.string().min(1),
  endTime: z.string().optional(),
  leadId: z.string().optional(),
  serviceId: z.string().optional(),
});

export async function createAppointment(data: z.infer<typeof createSchema>) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  const parsed = createSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos inválidos");

  const organizationId = session.user.organizationId;
  if (parsed.data.leadId) await assertOrgLead(organizationId, parsed.data.leadId);
  const start = new Date(parsed.data.startTime);

  let end: Date;
  if (parsed.data.endTime) {
    end = new Date(parsed.data.endTime);
  } else if (parsed.data.serviceId) {
    const service = await prisma.service.findFirst({
      where: { id: parsed.data.serviceId, organizationId, isActive: true },
    });
    if (!service) throw new UserError("Servicio no encontrado");
    end = new Date(start.getTime() + service.durationMinutes * 60 * 1000);
  } else {
    throw new UserError("Indica una hora de fin o selecciona un servicio");
  }

  await bookSlot(organizationId, {
    title: parsed.data.title,
    description: parsed.data.description,
    leadId: parsed.data.leadId,
    serviceId: parsed.data.serviceId,
    start,
    end,
  });
  await recordMetric(organizationId, METRIC_KEYS.APPOINTMENTS_BOOKED);

  revalidatePath("/portal/appointments");
  return { success: true };
}

const rescheduleSchema = z.object({
  appointmentId: z.string(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
});

export async function rescheduleAppointment(data: z.infer<typeof rescheduleSchema>) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  const organizationId = session.user.organizationId;

  const parsed = rescheduleSchema.parse(data);
  const existing = await prisma.appointment.findFirst({
    where: { id: parsed.appointmentId, organizationId },
  });
  if (!existing) throw new UserError("Cita no encontrada");
  if (!BLOCKING_STATUSES.includes(existing.status)) {
    throw new UserError("Solo se pueden reprogramar citas agendadas o confirmadas");
  }

  const start = new Date(parsed.startTime);
  const end = new Date(parsed.endTime);

  await bookSlot(organizationId, {
    title: existing.title,
    description: existing.description ?? undefined,
    serviceId: existing.serviceId ?? undefined,
    start,
    end,
    excludeAppointmentId: existing.id,
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "appointment.reschedule",
    resource: "Appointment",
    resourceId: existing.id,
    metadata: { fromStart: existing.startTime, toStart: start },
  });

  revalidatePath("/portal/appointments");
  return { success: true };
}

export async function updateAppointmentStatus(appointmentId: string, status: AppointmentStatus) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  const apt = await prisma.appointment.findFirst({
    where: { id: appointmentId, organizationId: session.user.organizationId },
  });
  if (!apt) throw new UserError("Cita no encontrada");

  // Volver a ocupar un horario (cancelada/no asistió → agendada/confirmada) exige el mismo control de solapamiento y de
  // disponibilidad que una cita nueva; el cambio de estado va en la misma transacción para que no haya carrera.
  if (BLOCKING_STATUSES.includes(status) && !BLOCKING_STATUSES.includes(apt.status)) {
    await bookSlot(session.user.organizationId, {
      title: apt.title,
      serviceId: apt.serviceId ?? undefined,
      start: apt.startTime,
      end: apt.endTime,
      excludeAppointmentId: apt.id,
      reactivateAs: status,
    });
  } else {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status },
    });
  }

  revalidatePath("/portal/appointments");
  return { success: true };
}
