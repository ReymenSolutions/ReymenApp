"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { syncLeadStatusFromOpportunity } from "@/lib/lead-status-sync";
import type { UserRole } from "@prisma/client";
import { UserError } from "@/lib/user-error";

async function requireOrgAndCrm() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");
  return session;
}

const createSchema = z.object({
  leadId: z.string(),
  pipelineStageId: z.string().optional(),
  title: z.string().min(1),
  amount: z.number().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  ownerId: z.string().optional(),
  estimatedCloseDate: z.string().optional(),
});

export async function createOpportunity(data: z.infer<typeof createSchema>) {
  const session = await requireOrgAndCrm();
  if (!can(session.user.role as UserRole, "opportunities:create")) throw new UserError("No autorizado");

  const parsed = createSchema.parse(data);
  const orgId = session.user.organizationId!;

  const lead = await prisma.lead.findFirst({ where: { id: parsed.leadId, organizationId: orgId } });
  if (!lead) throw new UserError("Lead no encontrado");

  const pipelineStageId = parsed.pipelineStageId
    ? (await prisma.pipelineStage.findFirst({ where: { id: parsed.pipelineStageId, organizationId: orgId } }))?.id
    : (await prisma.pipelineStage.findFirst({ where: { organizationId: orgId }, orderBy: { order: "asc" } }))?.id;

  if (!pipelineStageId) throw new UserError("No hay etapas de pipeline configuradas");

  const opportunity = await prisma.opportunity.create({
    data: {
      organizationId: orgId,
      leadId: parsed.leadId,
      pipelineStageId,
      title: parsed.title,
      amount: parsed.amount,
      currency: parsed.currency ?? "MXN",
      ownerId: parsed.ownerId ?? session.user.id,
      estimatedCloseDate: parsed.estimatedCloseDate ? new Date(parsed.estimatedCloseDate) : undefined,
    },
  });

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "opportunity.create",
    resource: "Opportunity",
    resourceId: opportunity.id,
    metadata: { title: opportunity.title, leadId: parsed.leadId },
  });
  await syncLeadStatusFromOpportunity({ organizationId: orgId, opportunityId: opportunity.id, userId: session.user.id });

  revalidatePath("/portal/pipeline");
  revalidatePath("/portal/leads");
  revalidatePath(`/portal/leads/${parsed.leadId}`);
  return { success: true, opportunityId: opportunity.id };
}

async function assertOpportunityAccess(orgId: string, opportunityId: string) {
  const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, organizationId: orgId } });
  if (!opportunity) throw new UserError("Oportunidad no encontrada");
  return opportunity;
}

export async function moveOpportunityStage(opportunityId: string, pipelineStageId: string) {
  const session = await requireOrgAndCrm();
  if (!can(session.user.role as UserRole, "opportunities:manage")) throw new UserError("No autorizado");
  const orgId = session.user.organizationId!;

  const [opportunity, stage] = await Promise.all([
    assertOpportunityAccess(orgId, opportunityId),
    prisma.pipelineStage.findFirst({ where: { id: pipelineStageId, organizationId: orgId } }),
  ]);
  if (!stage) throw new UserError("Etapa no encontrada");

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      pipelineStageId,
      closedAt: stage.isWon || stage.isLost ? new Date() : null,
      lossReason: stage.isLost ? opportunity.lossReason : null,
    },
  });

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "opportunity.stage_change",
    resource: "Opportunity",
    resourceId: opportunityId,
    metadata: { fromStageId: opportunity.pipelineStageId, toStageId: pipelineStageId, toStageName: stage.name },
  });
  await syncLeadStatusFromOpportunity({ organizationId: orgId, opportunityId, userId: session.user.id });

  revalidatePath("/portal/pipeline");
  revalidatePath("/portal/leads");
  revalidatePath(`/portal/leads/${opportunity.leadId}`);
  return { success: true };
}

/** Moves an opportunity into a stage marked isLost, recording why. */
export async function markOpportunityLost(opportunityId: string, lossReason: string) {
  const session = await requireOrgAndCrm();
  if (!can(session.user.role as UserRole, "opportunities:manage")) throw new UserError("No autorizado");
  const orgId = session.user.organizationId!;

  const opportunity = await assertOpportunityAccess(orgId, opportunityId);
  const lostStage = await prisma.pipelineStage.findFirst({ where: { organizationId: orgId, isLost: true } });
  if (!lostStage) throw new UserError("No hay una etapa marcada como 'perdida' configurada");

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { pipelineStageId: lostStage.id, lossReason, closedAt: new Date() },
  });

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "opportunity.lost",
    resource: "Opportunity",
    resourceId: opportunityId,
    metadata: { lossReason },
  });
  await syncLeadStatusFromOpportunity({ organizationId: orgId, opportunityId, userId: session.user.id });

  revalidatePath("/portal/pipeline");
  revalidatePath("/portal/leads");
  revalidatePath(`/portal/leads/${opportunity.leadId}`);
  return { success: true };
}

const updateSchema = z.object({
  opportunityId: z.string(),
  title: z.string().min(1).optional(),
  amount: z.number().nonnegative().nullable().optional(),
  currency: z.string().min(1).optional(),
  ownerId: z.string().nullable().optional(),
  estimatedCloseDate: z.string().nullable().optional(),
  nextActivityAt: z.string().nullable().optional(),
  nextActivityNote: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export async function updateOpportunity(data: z.infer<typeof updateSchema>) {
  const session = await requireOrgAndCrm();
  if (!can(session.user.role as UserRole, "opportunities:manage")) throw new UserError("No autorizado");
  const orgId = session.user.organizationId!;

  const { opportunityId, estimatedCloseDate, nextActivityAt, ...rest } = updateSchema.parse(data);
  const opportunity = await assertOpportunityAccess(orgId, opportunityId);

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      ...rest,
      estimatedCloseDate: estimatedCloseDate === undefined ? undefined : estimatedCloseDate ? new Date(estimatedCloseDate) : null,
      nextActivityAt: nextActivityAt === undefined ? undefined : nextActivityAt ? new Date(nextActivityAt) : null,
    },
  });

  revalidatePath("/portal/pipeline");
  revalidatePath(`/portal/leads/${opportunity.leadId}`);
  return { success: true };
}
