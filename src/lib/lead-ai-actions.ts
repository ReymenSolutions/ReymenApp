import { prisma } from "@/lib/prisma";

/** Lo que el Agente IA sugiere (pendiente) o hizo en los últimos 3 días para un contacto. */
export async function getLeadAiActions(organizationId: string, leadId: string, now: Date = new Date()) {
  const rows = await prisma.pipelineAiAction.findMany({
    where: { leadId, organizationId, OR: [{ status: "SUGGESTED" }, { status: "APPLIED", createdAt: { gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } }] },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, status: true, kind: true, reason: true, opportunityTitle: true, fromStageName: true, toStageName: true, createdAt: true },
  });
  return rows.map((a) => ({ ...a, status: a.status as "APPLIED" | "SUGGESTED" }));
}
