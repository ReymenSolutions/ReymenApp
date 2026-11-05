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
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

/** Oportunidades que se cargan por etapa (las más recientemente actualizadas). */
const OPPORTUNITIES_PER_STAGE = 200;

export default async function PortalPipelinePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "CRM");

  const orgId = session.user.organizationId;
  const { p: pipelineParam } = await searchParams;

  // Varios embudos: se ve uno a la vez (el principal si no se eligió otro).
  const pipelines = await prisma.pipeline.findMany({
    where: { organizationId: orgId },
    orderBy: [{ isDefault: "desc" }, { order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, isDefault: true, _count: { select: { stages: true } } },
  });
  const current = pipelines.find((p) => p.id === pipelineParam) ?? pipelines[0] ?? null;

  const [t, lang, stages, users] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.pipelineStage.findMany({
      where: { organizationId: orgId, pipelineId: current?.id ?? "__none__" },
      orderBy: { order: "asc" },
      include: {
        // Tope por etapa: un tablero con miles de tarjetas no se puede renderizar; se muestran las más recientes.
        _count: { select: { opportunities: true } },
        opportunities: {
          orderBy: { updatedAt: "desc" },
          take: OPPORTUNITIES_PER_STAGE,
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
  const totalOpportunities = stages.reduce((sum, s) => sum + s._count.opportunities, 0);
  const truncated = stages.some((s) => s._count.opportunities > s.opportunities.length);
  const canManage = can(session.user.role as UserRole, "opportunities:manage");

  return (
    <div>
      <PageHeader
        title={t.pipelineTitle}
        description={`${totalOpportunities} ${t.pipelineDesc}${truncated ? (lang === "es" ? ` · mostrando las ${OPPORTUNITIES_PER_STAGE} más recientes de cada etapa` : ` · showing the ${OPPORTUNITIES_PER_STAGE} most recent in each stage`) : ""}`}
        actions={stages.length > 0 ? <CreateOpportunityDialog stages={stageOptions} users={users} /> : undefined}
      />
      <CrmTabs />

      {pipelines.length > 1 && (
        <nav aria-label={lang === "es" ? "Embudos" : "Pipelines"} className="mb-4 flex flex-wrap gap-2">
          {pipelines.map((p) => (
            <Link
              key={p.id}
              href={`/portal/pipeline?p=${p.id}`}
              aria-current={p.id === current?.id ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1 text-sm", p.id === current?.id ? "border-brand-600 bg-brand-50 font-medium text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

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
          key={current?.id}
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
