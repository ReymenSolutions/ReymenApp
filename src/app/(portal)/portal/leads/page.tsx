import { CrmTabs } from "@/components/portal/CrmTabs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { hasModule, requireModule } from "@/lib/modules";
import { pickDict } from "@/lib/i18n-dict";
import { realtyStrings } from "@/lib/i18n-realty";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateLeadDialog } from "@/components/portal/CreateLeadDialog";
import { ExportLeadsButton } from "@/components/portal/ExportLeadsButton";
import { LeadTableClient } from "@/components/portal/LeadTableClient";
import { EmptyState } from "@/components/shared/EmptyState";
import { Users, Settings, Copy } from "lucide-react";
import { getActiveCustomFields } from "@/lib/custom-fields-db";
import { sanitizeLeadColumns } from "@/lib/lead-columns";
import { countDuplicateGroups } from "@/lib/duplicate-detection";
import type { LeadStatus, Prisma, UserRole } from "@prisma/client";

const PAGE_SIZE = 50;

const VALID_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];

function parseStatus(status: string | undefined): LeadStatus | "ALL" {
  return status && VALID_STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : "ALL";
}

async function getLeads(
  orgId: string,
  { query, status, page, realty }: { query?: string; status: LeadStatus | "ALL"; page: number; realty?: boolean }
) {
  const where: Prisma.LeadWhereInput = {
    organizationId: orgId,
    deletedAt: null,
    ...(status !== "ALL" ? { status } : {}),
    // Solo contactos con un perfil de búsqueda de Real Estate activo.
    ...(realty ? { realtyProfiles: { some: { active: true } } } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [leads, total, totalUnfiltered] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.lead.count({ where }),
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null } }),
  ]);

  return { leads, total, totalUnfiltered };
}

export default async function PortalLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; realty?: string }>;
}) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "CRM");

  const { q, status: statusParam, page: pageParam, realty: realtyParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const status = parseStatus(statusParam);

  const realtyActive = await hasModule(session.user.organizationId, "REALTY");
  const realtyOnly = realtyActive && realtyParam === "1";

  const [t, lang, { leads, total, totalUnfiltered }, duplicateGroups, customFields, me] = await Promise.all([
    getServerT(),
    getServerLang(),
    getLeads(session.user.organizationId, { query: q, status, page, realty: realtyOnly }),
    countDuplicateGroups(session.user.organizationId),
    getActiveCustomFields(session.user.organizationId),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { leadColumns: true } }),
  ]);
  const columns = sanitizeLeadColumns(me?.leadColumns, customFields.map((f) => f.key));

  const canManageSettings = can(session.user.role as UserRole, "settings:manage");

  return (
    <div>
      <PageHeader
        title={t.leadsTitle}
        description={`${totalUnfiltered} ${t.totalLeadsCount}`}
        actions={
          <div className="flex items-center gap-2">
            {duplicateGroups > 0 && (
              <Button asChild variant="outline" size="sm" className="border-amber-300 text-amber-800 hover:bg-amber-50">
                <Link href="/portal/leads/duplicates">
                  <Copy className="h-4 w-4" />
                  {lang === "es" ? `${duplicateGroups} posibles duplicados` : `${duplicateGroups} possible duplicates`}
                </Link>
              </Button>
            )}
            {canManageSettings && (
              <Button asChild variant="outline" size="sm">
                <Link href="/portal/leads/settings">
                  <Settings className="h-4 w-4" />
                  {lang === "es" ? "Configurar seguimientos" : "Configure follow-ups"}
                </Link>
              </Button>
            )}
            {totalUnfiltered > 0 && <ExportLeadsButton />}
            <CreateLeadDialog />
          </div>
        }
      />
      <CrmTabs />
      <p className="mb-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{lang === "es" ? "Aquí das seguimiento a conversaciones y personas interesadas. Para consultar compras y recompensas de alguien que ya está registrado, abre Clientes." : "Follow up with contacts and interested people here. Open Customers to see a registered customer’s purchases and rewards."}</p>

      {realtyActive && totalUnfiltered > 0 && (() => {
        const R = pickDict(realtyStrings, lang === "en" ? "en" : "es");
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (status !== "ALL") params.set("status", status);
        if (!realtyOnly) params.set("realty", "1");
        const href = `/portal/leads${params.toString() ? `?${params.toString()}` : ""}`;
        return (
          <div className="mb-3 flex items-center gap-2">
            <Link href={href} aria-pressed={realtyOnly} className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${realtyOnly ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {R.leadSearchFilter}
            </Link>
            {realtyOnly && <Link href={href} className="text-xs text-slate-500 hover:text-slate-800">{R.leadSearchFilterOff}</Link>}
          </div>
        );
      })()}

      {totalUnfiltered === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Users}
              title={t.noLeads}
              description={t.leadsEmptyDesc}
              action={<CreateLeadDialog />}
            />
          </CardContent>
        </Card>
      ) : (
        <LeadTableClient leads={leads} total={total} page={page} pageSize={PAGE_SIZE} query={q ?? ""} status={status}
          columns={columns}
          customFields={customFields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options }))}
          canCreateField={canManageSettings}
        />
      )}
    </div>
  );
}
