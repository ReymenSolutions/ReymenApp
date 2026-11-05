import type { LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Embudos (pipelines) de ventas. Cada negocio tiene uno principal (isDefault) y puede crear más: renovaciones,
// postventa, proyectos… Las oportunidades nuevas sin embudo indicado caen en la primera etapa del principal.

export const DEFAULT_PIPELINE_NAME = "Ventas";

export const DEFAULT_STAGES: { name: string; order: number; leadStatus: LeadStatus; isWon?: boolean; isLost?: boolean }[] = [
  { name: "Nuevo", order: 0, leadStatus: "NEW" },
  { name: "Contactado", order: 1, leadStatus: "CONTACTED" },
  { name: "Calificado", order: 2, leadStatus: "QUALIFIED" },
  { name: "Propuesta", order: 3, leadStatus: "PROPOSAL" },
  { name: "Ganado", order: 4, isWon: true, leadStatus: "WON" },
  { name: "Perdido", order: 5, isLost: true, leadStatus: "LOST" },
];

/** Etapas mínimas de un embudo nuevo: abierto, ganado y perdido (el negocio agrega las suyas en medio). */
export const NEW_PIPELINE_STAGES: { name: string; order: number; isWon?: boolean; isLost?: boolean }[] = [
  { name: "Nuevo", order: 0 },
  { name: "En proceso", order: 1 },
  { name: "Ganado", order: 2, isWon: true },
  { name: "Perdido", order: 3, isLost: true },
];

type Db = Prisma.TransactionClient | typeof prisma;

/** Crea un embudo con sus etapas. El primero de la organización queda como principal. */
export async function createPipelineWithStages(
  organizationId: string,
  opts: { name: string; stages: { name: string; order: number; leadStatus?: LeadStatus | null; isWon?: boolean; isLost?: boolean }[]; isDefault?: boolean },
  db: Db = prisma,
) {
  const count = await db.pipeline.count({ where: { organizationId } });
  const pipeline = await db.pipeline.create({
    data: { organizationId, name: opts.name, order: count, isDefault: opts.isDefault ?? count === 0 },
  });
  await db.pipelineStage.createMany({
    data: opts.stages.map((s) => ({ organizationId, pipelineId: pipeline.id, name: s.name, order: s.order, isWon: s.isWon ?? false, isLost: s.isLost ?? false, leadStatus: s.leadStatus ?? null })),
  });
  return pipeline;
}

/** El embudo principal (o el primero, si por algo ninguno está marcado). Null si la organización no tiene ninguno. */
export async function getDefaultPipeline(organizationId: string, db: Db = prisma) {
  return db.pipeline.findFirst({ where: { organizationId }, orderBy: [{ isDefault: "desc" }, { order: "asc" }, { createdAt: "asc" }] });
}

/** La primera etapa del embudo principal: donde cae una oportunidad nueva sin etapa indicada. */
export async function firstStageOfDefaultPipeline(organizationId: string, db: Db = prisma) {
  const pipeline = await getDefaultPipeline(organizationId, db);
  if (!pipeline) return null;
  return db.pipelineStage.findFirst({ where: { pipelineId: pipeline.id }, orderBy: { order: "asc" } });
}

/** El embudo principal; si la organización no tiene ninguno, crea «Ventas» vacío para poder agregarle etapas. */
export async function ensureDefaultPipeline(organizationId: string, db: Db = prisma) {
  return (await getDefaultPipeline(organizationId, db)) ?? db.pipeline.create({ data: { organizationId, name: DEFAULT_PIPELINE_NAME, isDefault: true } });
}

/** Todos los embudos de la organización con sus etapas en orden; el principal primero. */
export async function listPipelines(organizationId: string) {
  return prisma.pipeline.findMany({
    where: { organizationId },
    orderBy: [{ isDefault: "desc" }, { order: "asc" }, { createdAt: "asc" }],
    include: { stages: { orderBy: { order: "asc" }, select: { id: true, name: true, order: true, isWon: true, isLost: true, leadStatus: true } } },
  });
}

/**
 * Opciones de etapa para elegir en un formulario. Con un solo embudo se ve solo el nombre de la etapa; con varios,
 * «Embudo › Etapa», para que nunca se confundan dos «Nuevo».
 */
export async function stageOptionsFor(organizationId: string): Promise<{ id: string; name: string; pipelineId: string }[]> {
  const pipelines = await listPipelines(organizationId);
  const many = pipelines.length > 1;
  return pipelines.flatMap((p) => p.stages.map((s) => ({ id: s.id, name: many ? `${p.name} › ${s.name}` : s.name, pipelineId: p.id })));
}
