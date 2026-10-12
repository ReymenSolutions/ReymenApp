import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings, Calendar } from "lucide-react";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { CreateAppointmentDialog } from "@/components/portal/CreateAppointmentDialog";
import { AppointmentStatusSelect } from "@/components/portal/AppointmentStatusSelect";
import { RescheduleAppointmentDialog } from "@/components/portal/RescheduleAppointmentDialog";
import { formatDateTimeInTz } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

const RESCHEDULABLE_STATUSES = ["SCHEDULED", "CONFIRMED"];

export default async function PortalAppointmentsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  const orgId = session.user.organizationId;

  const [t, lang, org, appointments, services] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } }),
    prisma.appointment.findMany({
      where: { organizationId: orgId },
      orderBy: { startTime: "asc" },
    }),
    prisma.service.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, durationMinutes: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const canManageSettings = can(session.user.role as UserRole, "settings:manage");
  const upcoming = appointments.filter((a) => new Date(a.startTime) >= new Date());
  const past = appointments.filter((a) => new Date(a.startTime) < new Date());

  return (
    <div>
      <PageHeader
        title={t.appointmentsTitle}
        description={`${upcoming.length} ${t.upcoming} · ${past.length} ${t.past}`}
        actions={
          <div className="flex items-center gap-2">
            {canManageSettings && (
              <Button asChild variant="outline" size="sm">
                <Link href="/portal/appointments/settings">
                  <Settings className="h-4 w-4" />
                  {lang === "es" ? "Configurar agenda" : "Configure agenda"}
                </Link>
              </Button>
            )}
            <CreateAppointmentDialog services={services} />
          </div>
        }
      />

      {appointments.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Calendar}
              title={t.noAppointments}
              description={t.appointmentsEmptyDesc}
              action={<CreateAppointmentDialog services={services} />}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colTitle}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colStart}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colEnd}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colSource}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colStatus}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appointments.map((apt) => (
                <tr key={apt.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{apt.title}</p>
                    {apt.description && (
                      <p className="text-xs text-slate-400 truncate max-w-[200px]">{apt.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{formatDateTimeInTz(apt.startTime, org.timezone)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{formatDateTimeInTz(apt.endTime, org.timezone)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{apt.source ?? "—"}</td>
                  <td className="px-4 py-3">
                    <AppointmentStatusSelect appointmentId={apt.id} currentStatus={apt.status} />
                  </td>
                  <td className="px-4 py-3">
                    {RESCHEDULABLE_STATUSES.includes(apt.status) && (
                      <RescheduleAppointmentDialog
                        appointmentId={apt.id}
                        currentStart={apt.startTime}
                        currentEnd={apt.endTime}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
