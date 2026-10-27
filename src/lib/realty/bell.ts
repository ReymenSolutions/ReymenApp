// Solo servidor. Avisos de Real Estate para la campana del portal. No hay tabla nueva: se leen de los datos mismos y se
// van solos cuando ya se atendieron (el perfil se acepta, el prospecto se contacta, la demanda se cubre).
//  • Nuevo interesado: pidió informes en la landing en los últimos 3 días (al asesor de la propiedad; sin asesor, a todos).
//  • La IA propone un perfil: propuesta pendiente de revisar (al asesor del contacto; sin asesor, a todos).
//  • Demanda sin inventario: una zona con ≥ MIN_SAMPLE prospectos activos y ninguna propiedad que les encaje.

import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import type { UserRole } from "@prisma/client";
import { GOOD_MATCH } from "./match";
import { MIN_SAMPLE } from "./market";
import { budgetText } from "./page-helpers";

export interface BellItem {
  type: "realty_inquiry" | "realty_ai_profile" | "realty_unmet_demand";
  label: string;
  detail: string;
  href: string;
  at: Date;
}

const DAY = 86_400_000;

export async function getRealtyBellItems(organizationId: string, userId: string, role: string, now: Date = new Date()): Promise<BellItem[]> {
  if (!can(role as UserRole, "realty:operate") || !(await hasModule(organizationId, "REALTY"))) return [];
  const [inquiries, suggestions, unmet] = await Promise.all([
    prisma.realtyLeadProfile.findMany({
      where: { organizationId, active: true, source: { startsWith: "landing" }, createdAt: { gte: new Date(now.getTime() - 3 * DAY) }, OR: [{ advisorUserId: userId }, { advisorUserId: null }] },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, createdAt: true, maxBudget: true, minBudget: true, lead: { select: { name: true } } },
    }),
    prisma.realtyProfileSuggestion.findMany({ where: { organizationId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, leadId: true, createdAt: true, maxBudget: true } }),
    prisma.realtyLeadZone.groupBy({
      by: ["zoneId"],
      where: { organizationId, profile: { active: true, matches: { none: { totalScore: { gte: GOOD_MATCH } } } } },
      _count: { _all: true },
      having: { zoneId: { _count: { gte: MIN_SAMPLE } } },
      orderBy: { _count: { zoneId: "desc" } },
      take: 2,
    }),
  ]);

  // Una propuesta de la IA solo le avisa al asesor del contacto (o a todos si no tiene).
  const leadIds = [...new Set(suggestions.map((s) => s.leadId))];
  const leads = leadIds.length ? await prisma.lead.findMany({ where: { organizationId, id: { in: leadIds }, deletedAt: null }, select: { id: true, name: true, assignedTo: true } }) : [];
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const zones = unmet.length ? await prisma.realtyZone.findMany({ where: { organizationId, id: { in: unmet.map((u) => u.zoneId) } }, select: { id: true, name: true } }) : [];
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));

  return [
    ...inquiries.map((p): BellItem => ({
      type: "realty_inquiry",
      label: "Nuevo interesado desde la landing",
      detail: `${p.lead?.name ?? "Prospecto"} · ${budgetText(p.minBudget === null ? null : Number(p.minBudget), Number(p.maxBudget))}`,
      href: `/portal/realty/prospects/${p.id}`,
      at: p.createdAt,
    })),
    ...suggestions.flatMap((s): BellItem[] => {
      const lead = leadById.get(s.leadId);
      if (!lead || (lead.assignedTo && lead.assignedTo !== userId)) return [];
      return [{ type: "realty_ai_profile", label: "La IA propone lo que busca un contacto", detail: lead.name, href: `/portal/leads/${lead.id}`, at: s.createdAt }];
    }),
    ...unmet.map((u): BellItem => ({
      type: "realty_unmet_demand",
      label: "Demanda sin inventario",
      detail: `${u._count._all} prospectos piden ${zoneName.get(u.zoneId) ?? "una zona"} y ninguna propiedad les encaja`,
      href: "/portal/realty/rotation",
      at: now,
    })),
  ];
}
