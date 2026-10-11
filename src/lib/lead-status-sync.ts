import type { LeadStatus, PipelineStage } from "@prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";

const OPEN_RANK: Record<string, number> = { NEW: 0, CONTACTED: 1, QUALIFIED: 2, PROPOSAL: 3 };

/** Estado del contacto al que lleva una etapa: el configurado, o ganado/perdido si así está marcada. */
export function stageLeadStatus(stage: Pick<PipelineStage, "leadStatus" | "isWon" | "isLost">): LeadStatus | null {
  if (stage.leadStatus) return stage.leadStatus;
  if (stage.isWon) return "WON";
  if (stage.isLost) return "LOST";
  return null;
}

/**
 * Qué estado debe tener el contacto cuando una de sus oportunidades llega a una
 * etapa que lleva a `target`. Devuelve null si no hay nada que cambiar.
 *
 * - Ganada: el contacto pasa a WON.
 * - Perdida: solo pasa a LOST si no le quedan otras oportunidades abiertas y no
 *   estaba ya ganado (otra venta suya sí se cerró).
 * - Etapas abiertas: el estado solo avanza (Nuevo → Contactado → Calificado →
 *   Propuesta), nunca retrocede; un contacto ganado se queda ganado (p. ej. un
 *   cliente que abre una segunda venta) y uno perdido se reactiva.
 */
export function nextLeadStatus(current: LeadStatus, target: LeadStatus, ctx: { hasOtherOpenOpportunities: boolean }): LeadStatus | null {
  if (target === current) return null;
  if (target === "WON") return "WON";
  if (target === "LOST") return current === "WON" || ctx.hasOtherOpenOpportunities ? null : "LOST";
  if (current === "LOST") return target;
  if (current === "WON") return null;
  return OPEN_RANK[target] > OPEN_RANK[current] ? target : null;
}

/**
 * Después de crear o mover una oportunidad: pone al contacto en el estado que
 * le corresponde según la etapa, y lo deja registrado en el historial.
 * Devuelve el nuevo estado, o null si no cambió.
 */
export async function syncLeadStatusFromOpportunity(params: { organizationId: string; opportunityId: string; userId?: string | null }): Promise<LeadStatus | null> {
  const opp = await prisma.opportunity.findFirst({
    where: { id: params.opportunityId, organizationId: params.organizationId },
    include: { pipelineStage: true, lead: { select: { id: true, status: true, deletedAt: true } } },
  });
  if (!opp || opp.lead.deletedAt) return null;

  const target = stageLeadStatus(opp.pipelineStage);
  if (!target) return null;

  const otherOpen = await prisma.opportunity.count({
    where: { leadId: opp.leadId, organizationId: params.organizationId, id: { not: opp.id }, closedAt: null, pipelineStage: { isWon: false, isLost: false } },
  });
  const next = nextLeadStatus(opp.lead.status, target, { hasOtherOpenOpportunities: otherOpen > 0 });
  if (!next) return null;

  await prisma.lead.update({ where: { id: opp.leadId }, data: { status: next } });
  await logAudit({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    action: "lead.status_change",
    resource: "Lead",
    resourceId: opp.leadId,
    metadata: { from: opp.lead.status, to: next, via: "pipeline", opportunityId: opp.id },
  });
  return next;
}
