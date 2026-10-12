import { CrmTabs } from "@/components/portal/CrmTabs";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CreateOpportunityDialog } from "@/components/portal/CreateOpportunityDialog";
import { PipelineBoard } from "@/components/portal/PipelineBoard";
import { GitBranch } from "lucide-react";
import type { UserRole } from "@prisma/client";

export default async function PortalPipelinePage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "CRM");

  const orgId = session.user.organizationId;

  const [t, lang, stages, users] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.pipelineStage.findMany({
      where: { organizationId: orgId },
      orderBy: { order: "asc" },
      include: {
        opportunities: {
          orderBy: { updatedAt: "desc" },
          include: {
            lead: { select: { id: true, name: true, phone: true } },
            owner: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const stageOptions = stages.map((s) => ({ id: s.id, name: s.name }));
  const totalOpportunities = stages.reduce((sum, s) => sum + s.opportunities.length, 0);
  const canManage = can(session.user.role as UserRole, "opportunities:manage");

  return (
    <div>
      <PageHeader
        title={t.pipelineTitle}
        description={`${totalOpportunities} ${t.pipelineDesc}`}
        actions={stages.length > 0 ? <CreateOpportunityDialog stages={stageOptions} users={users} /> : undefined}
      />
      <CrmTabs />

      {stages.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title={lang === "es" ? "No hay etapas configuradas" : "No stages configured"}
          description={
            lang === "es"
              ? "Configura tu pipeline de ventas en Configuración."
              : "Set up your sales pipeline in Settings."
          }
        />
      ) : (
        <PipelineBoard
          canManage={canManage}
          stages={stages.map((s) => ({ id: s.id, name: s.name, isWon: s.isWon, isLost: s.isLost }))}
          opportunities={stages.flatMap((stage) =>
            stage.opportunities.map((opp) => ({
              id: opp.id,
              title: opp.title,
              amount: opp.amount,
              currency: opp.currency,
              estimatedCloseDate: opp.estimatedCloseDate ? opp.estimatedCloseDate.toISOString() : null,
              leadId: opp.lead.id,
              leadName: opp.lead.name,
              ownerName: opp.owner?.name ?? opp.owner?.email ?? null,
              tags: opp.tags,
              stageId: stage.id,
            })),
          )}
        />
      )}
    </div>
  );
}
