import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateLeadDialog } from "@/components/portal/CreateLeadDialog";
import { ExportLeadsButton } from "@/components/portal/ExportLeadsButton";
import { LeadTableClient } from "@/components/portal/LeadTableClient";
import { EmptyState } from "@/components/shared/EmptyState";
import { Users, Settings, Copy } from "lucide-react";
import { countDuplicateGroups } from "@/lib/duplicate-detection";
import type { LeadStatus, Prisma, UserRole } from "@prisma/client";

const PAGE_SIZE = 50;

const VALID_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];

function parseStatus(status: string | undefined): LeadStatus | "ALL" {
  return status && VALID_STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : "ALL";
}

async function getLeads(
  orgId: string,
  { query, status, page }: { query?: string; status: LeadStatus | "ALL"; page: number }
) {
  const where: Prisma.LeadWhereInput = {
    organizationId: orgId,
    deletedAt: null,
    ...(status !== "ALL" ? { status } : {}),
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
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "CRM");

  const { q, status: statusParam, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const status = parseStatus(statusParam);

  const [t, lang, { leads, total, totalUnfiltered }, duplicateGroups] = await Promise.all([
    getServerT(),
    getServerLang(),
    getLeads(session.user.organizationId, { query: q, status, page }),
    countDuplicateGroups(session.user.organizationId),
  ]);

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
        <LeadTableClient leads={leads} total={total} page={page} pageSize={PAGE_SIZE} query={q ?? ""} status={status} />
      )}
    </div>
  );
}
