"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { LeadStatus, type UserRole } from "@prisma/client";
import { UserError } from "@/lib/user-error";
import { createPipelineWithStages, ensureDefaultPipeline, NEW_PIPELINE_STAGES } from "@/lib/pipelines";

/** Más de esto no se puede leer como tablero; nadie lo necesita. */
const MAX_PIPELINES = 20;

function revalidatePipelineViews() {
  revalidatePath("/portal/pipeline");
  revalidatePath("/portal/settings");
}

async function requireOrgAndPipelinePermission() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "pipeline:manage")) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");
  return session;
}

const createSchema = z.object({
  /** Embudo al que se agrega; sin él, el principal. */
  pipelineId: z.string().optional(),
  name: z.string().min(1),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
  leadStatus: z.nativeEnum(LeadStatus).nullable().optional(),
});

export async function createPipelineStage(data: z.infer<typeof createSchema>) {
  const session = await requireOrgAndPipelinePermission();
  const parsed = createSchema.parse(data);
  const orgId = session.user.organizationId!;

  const pipeline = parsed.pipelineId
    ? await prisma.pipeline.findFirst({ where: { id: parsed.pipelineId, organizationId: orgId } })
    : await ensureDefaultPipeline(orgId);
  if (!pipeline) throw new UserError("Embudo no encontrado");

  const maxOrder = await prisma.pipelineStage.aggregate({
    where: { pipelineId: pipeline.id },
    _max: { order: true },
  });

  const stage = await prisma.pipelineStage.create({
    data: {
      organizationId: orgId,
      pipelineId: pipeline.id,
      name: parsed.name,
      order: (maxOrder._max.order ?? -1) + 1,
      isWon: parsed.isWon ?? false,
      isLost: parsed.isLost ?? false,
      leadStatus: parsed.leadStatus ?? null,
    },
  });

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "pipeline_stage.create",
    resource: "PipelineStage",
    resourceId: stage.id,
    metadata: { name: stage.name },
  });

  revalidatePath("/portal/pipeline");
  revalidatePath("/portal/settings");
  return { success: true, stageId: stage.id };
}

const updateSchema = z.object({
  stageId: z.string(),
  name: z.string().min(1).optional(),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
  /** Estado del contacto al que lleva esta etapa; null = ninguno (solo cuenta ganada/perdida). */
  leadStatus: z.nativeEnum(LeadStatus).nullable().optional(),
});

export async function updatePipelineStage(data: z.infer<typeof updateSchema>) {
  const session = await requireOrgAndPipelinePermission();
  const { stageId, ...rest } = updateSchema.parse(data);
  const orgId = session.user.organizationId!;

  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, organizationId: orgId } });
  if (!stage) throw new UserError("Etapa no encontrada");

  await prisma.pipelineStage.update({ where: { id: stageId }, data: rest });

  revalidatePath("/portal/pipeline");
  revalidatePath("/portal/settings");
  return { success: true };
}

/** Swaps two stages' `order` — the simplest correct building block for "move up/move down" reordering UI. */
export async function swapPipelineStageOrder(stageIdA: string, stageIdB: string) {
  const session = await requireOrgAndPipelinePermission();
  const orgId = session.user.organizationId!;

  const [a, b] = await Promise.all([
    prisma.pipelineStage.findFirst({ where: { id: stageIdA, organizationId: orgId } }),
    prisma.pipelineStage.findFirst({ where: { id: stageIdB, organizationId: orgId } }),
  ]);
  if (!a || !b) throw new UserError("Etapa no encontrada");
  if (a.pipelineId !== b.pipelineId) throw new UserError("Las etapas son de embudos distintos");

  await prisma.$transaction([
    // Route A's order through a temporary negative value first — order has
    // a unique constraint per pipeline, so swapping two rows directly would
    // collide mid-transaction otherwise.
    prisma.pipelineStage.update({ where: { id: a.id }, data: { order: -1 } }),
    prisma.pipelineStage.update({ where: { id: b.id }, data: { order: a.order } }),
    prisma.pipelineStage.update({ where: { id: a.id }, data: { order: b.order } }),
  ]);

  revalidatePath("/portal/pipeline");
  revalidatePath("/portal/settings");
  return { success: true };
}

export async function deletePipelineStage(stageId: string) {
  const session = await requireOrgAndPipelinePermission();
  const orgId = session.user.organizationId!;

  const stage = await prisma.pipelineStage.findFirst({
    where: { id: stageId, organizationId: orgId },
    include: { _count: { select: { opportunities: true } } },
  });
  if (!stage) throw new UserError("Etapa no encontrada");
  if (stage._count.opportunities > 0) {
    throw new UserError("No se puede eliminar una etapa con oportunidades activas. Muévelas primero.");
  }

  await prisma.pipelineStage.delete({ where: { id: stageId } });

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "pipeline_stage.delete",
    resource: "PipelineStage",
    resourceId: stageId,
  });

  revalidatePath("/portal/pipeline");
  revalidatePath("/portal/settings");
  return { success: true };
}

// ── Embudos ─────────────────────────────────────────────────────────────────

const pipelineName = z.string().trim().min(1, "Ponle nombre al embudo").max(60);

/** Crea un embudo nuevo con etapas básicas (Nuevo, En proceso, Ganado, Perdido) que luego se ajustan. */
export async function createPipeline(name: string) {
  const session = await requireOrgAndPipelinePermission();
  const orgId = session.user.organizationId!;
  const parsedName = pipelineName.parse(name);
  if ((await prisma.pipeline.count({ where: { organizationId: orgId } })) >= MAX_PIPELINES) throw new UserError("Llegaste al máximo de embudos");
  const pipeline = await prisma.$transaction((tx) => createPipelineWithStages(orgId, { name: parsedName, stages: NEW_PIPELINE_STAGES }, tx));
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "pipeline.create", resource: "Pipeline", resourceId: pipeline.id, metadata: { name: parsedName } });
  revalidatePipelineViews();
  return { success: true, pipelineId: pipeline.id };
}

export async function renamePipeline(pipelineId: string, name: string) {
  const session = await requireOrgAndPipelinePermission();
  const orgId = session.user.organizationId!;
  const parsedName = pipelineName.parse(name);
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, organizationId: orgId } });
  if (!pipeline) throw new UserError("Embudo no encontrado");
  await prisma.pipeline.update({ where: { id: pipeline.id }, data: { name: parsedName } });
  revalidatePipelineViews();
  return { success: true };
}

/** El principal es donde caen las oportunidades nuevas (formularios, IA, n8n) cuando no se indica otro. */
export async function setDefaultPipeline(pipelineId: string) {
  const session = await requireOrgAndPipelinePermission();
  const orgId = session.user.organizationId!;
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, organizationId: orgId } });
  if (!pipeline) throw new UserError("Embudo no encontrado");
  await prisma.$transaction([
    prisma.pipeline.updateMany({ where: { organizationId: orgId, isDefault: true }, data: { isDefault: false } }),
    prisma.pipeline.update({ where: { id: pipeline.id }, data: { isDefault: true } }),
  ]);
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "pipeline.set_default", resource: "Pipeline", resourceId: pipeline.id, metadata: { name: pipeline.name } });
  revalidatePipelineViews();
  return { success: true };
}

/** Solo se borra un embudo vacío y que no sea el principal: las oportunidades nunca se pierden por accidente. */
export async function deletePipeline(pipelineId: string) {
  const session = await requireOrgAndPipelinePermission();
  const orgId = session.user.organizationId!;
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, organizationId: orgId } });
  if (!pipeline) throw new UserError("Embudo no encontrado");
  if (pipeline.isDefault) throw new UserError("No se puede eliminar el embudo principal. Elige otro como principal primero.");
  const opportunities = await prisma.opportunity.count({ where: { pipelineStage: { pipelineId: pipeline.id } } });
  if (opportunities > 0) throw new UserError("No se puede eliminar un embudo con oportunidades. Muévelas primero.");
  await prisma.pipeline.delete({ where: { id: pipeline.id } });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "pipeline.delete", resource: "Pipeline", resourceId: pipeline.id, metadata: { name: pipeline.name } });
  revalidatePipelineViews();
  return { success: true };
}
