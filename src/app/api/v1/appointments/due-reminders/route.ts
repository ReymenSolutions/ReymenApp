import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateOrgRequest } from "@/lib/api-key-auth";

// Internal n8n query: GET /api/v1/appointments/due-reminders?orgId=xxx
// n8n polls this on its own schedule (there is no cron inside the platform
// for this — see docs/DOCUMENTACION_TECNICA.md §7) and sends the actual
// WhatsApp reminder for each row returned, then reports success via
// POST /api/webhooks/n8n/appointment-reminder-sent so the same reminder is
// never returned (and never re-sent) again. Secured the same way as
// /api/v1/knowledge-base: X-Api-Key matched against THAT organization's own
// n8nWebhookSecret, or a NextAuth session for browser callers.
export async function GET(req: NextRequest) {
  const authResult = await authenticateOrgRequest(req);
  if (authResult.response) return authResult.response;
  const orgId = authResult.orgId;

  const rules = await prisma.appointmentReminderRule.findMany({
    where: { organizationId: orgId, isActive: true },
  });

  if (rules.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const now = new Date();

  const dueByRule = await Promise.all(
    rules.map(async (rule) => {
      const windowEnd = new Date(now.getTime() + rule.offsetMinutes * 60 * 1000);
      const appointments = await prisma.appointment.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          startTime: { gt: now, lte: windowEnd },
          reminderLogs: { none: { ruleId: rule.id } },
        },
        include: { lead: { select: { name: true, phone: true, organizationId: true } } },
      });

      return appointments.map((apt) => ({
        appointmentId: apt.id,
        ruleId: rule.id,
        channel: rule.channel,
        template: rule.template,
        offsetMinutes: rule.offsetMinutes,
        title: apt.title,
        startTime: apt.startTime.toISOString(),
        // Defensa en profundidad: nunca se expone un contacto de otra organización, aunque un dato antiguo lo enlace.
        contactName: apt.lead?.organizationId === orgId ? apt.lead.name : null,
        contactPhone: apt.lead?.organizationId === orgId ? apt.lead.phone : null,
      }));
    })
  );

  return NextResponse.json({ data: dueByRule.flat() });
}
