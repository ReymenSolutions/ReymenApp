import { requireModule } from "@/lib/modules";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getServerLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServicesManager } from "@/components/portal/ServicesManager";
import { AvailabilityGrid } from "@/components/portal/AvailabilityGrid";
import { ReminderRulesManager } from "@/components/portal/ReminderRulesManager";
import { TimezoneSelector } from "@/components/portal/TimezoneSelector";
import type { UserRole } from "@prisma/client";

export default async function AppointmentSettingsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "CRM");
  if (!can(session.user.role as UserRole, "settings:manage")) return redirect("/portal/appointments");

  const orgId = session.user.organizationId;

  const [lang, org, services, availabilityRules, reminderRules] = await Promise.all([
    getServerLang(),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } }),
    prisma.service.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { appointments: true } } },
    }),
    prisma.availabilityRule.findMany({ where: { organizationId: orgId }, orderBy: { dayOfWeek: "asc" } }),
    prisma.appointmentReminderRule.findMany({ where: { organizationId: orgId }, orderBy: { offsetMinutes: "asc" } }),
  ]);

  return (
    <div>
      <Link href="/portal/appointments" className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" />
        {lang === "es" ? "Citas" : "Appointments"}
      </Link>

      <PageHeader
        title={lang === "es" ? "Configuración de agenda" : "Agenda settings"}
        description={lang === "es" ? "Servicios, disponibilidad, zona horaria y recordatorios" : "Services, availability, timezone and reminders"}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>{lang === "es" ? "Zona horaria" : "Timezone"}</CardTitle></CardHeader>
          <CardContent>
            <TimezoneSelector currentTimezone={org.timezone} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{lang === "es" ? "Servicios" : "Services"}</CardTitle></CardHeader>
          <CardContent>
            <ServicesManager
              services={services.map((s) => ({
                id: s.id,
                name: s.name,
                durationMinutes: s.durationMinutes,
                bufferMinutes: s.bufferMinutes,
                price: s.price,
                isActive: s.isActive,
                appointmentCount: s._count.appointments,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{lang === "es" ? "Disponibilidad semanal" : "Weekly availability"}</CardTitle></CardHeader>
          <CardContent>
            <AvailabilityGrid
              initialRules={availabilityRules.map((r) => ({ dayOfWeek: r.dayOfWeek, startMinute: r.startMinute, endMinute: r.endMinute }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{lang === "es" ? "Recordatorios de citas" : "Appointment reminders"}</CardTitle></CardHeader>
          <CardContent>
            <ReminderRulesManager
              initialRules={reminderRules.map((r) => ({
                offsetMinutes: r.offsetMinutes,
                channel: r.channel,
                template: r.template,
                isActive: r.isActive,
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
