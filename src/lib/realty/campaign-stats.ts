// Solo servidor. Métricas de campañas calculadas solas (nadie captura conteos):
//  • leads    = perfiles de búsqueda que llegaron con el enlace de la campaña (?c=<id>, primer contacto);
//  • visitas  = visitas (citas no canceladas) de esos prospectos, ya sea que el perfil esté ligado a la visita o que la
//               hayan agendado desde la landing con el mismo contacto del CRM;
//  • cierres e ingreso = cierres registrados de esos prospectos (suma del monto final).
// Una campaña sin tráfico etiquetado muestra ceros: el enlace de seguimiento (campaignTrackingUrl) es lo que la alimenta.

import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/app-url";

export interface CampaignCounts {
  leads: number;
  visits: number;
  closings: number;
  revenue: number;
}

const EMPTY: CampaignCounts = { leads: 0, visits: 0, closings: 0, revenue: 0 };

export async function campaignCounts(organizationId: string): Promise<Map<string, CampaignCounts>> {
  const out = new Map<string, CampaignCounts>();
  const slot = (id: string) => {
    let c = out.get(id);
    if (!c) out.set(id, (c = { ...EMPTY }));
    return c;
  };
  const [leads, visits, closings] = await Promise.all([
    prisma.realtyLeadProfile.groupBy({ by: ["campaignId"], where: { organizationId, campaignId: { not: null } }, _count: { _all: true } }),
    prisma.realtyPropertyVisit.findMany({
      where: {
        organizationId,
        appointment: { status: { not: "CANCELLED" } },
        OR: [{ profile: { campaignId: { not: null } } }, { appointment: { lead: { realtyProfiles: { some: { campaignId: { not: null } } } } } }],
      },
      select: {
        profile: { select: { campaignId: true } },
        appointment: { select: { lead: { select: { realtyProfiles: { where: { campaignId: { not: null } }, orderBy: { createdAt: "asc" }, take: 1, select: { campaignId: true } } } } } },
      },
    }),
    prisma.realtyClosing.findMany({ where: { organizationId, profile: { campaignId: { not: null } } }, select: { finalAmount: true, profile: { select: { campaignId: true } } } }),
  ]);
  for (const l of leads) if (l.campaignId) slot(l.campaignId).leads = l._count._all;
  for (const v of visits) {
    const id = v.profile?.campaignId ?? v.appointment.lead?.realtyProfiles[0]?.campaignId;
    if (id) slot(id).visits++;
  }
  for (const c of closings) {
    const id = c.profile?.campaignId;
    if (!id) continue;
    const s = slot(id);
    s.closings++;
    s.revenue += Number(c.finalAmount);
  }
  return out;
}

export const countsOf = (m: Map<string, CampaignCounts>, id: string): CampaignCounts => m.get(id) ?? EMPTY;

/** Enlace con el que la campaña cuenta sola: la landing de la propiedad con el canal (?src=) y la campaña (?c=). */
export function campaignTrackingUrl(slug: string, channel: string, campaignId: string): string {
  return `${getAppUrl()}/p/${encodeURIComponent(slug)}?src=${encodeURIComponent(channel.toLowerCase())}&c=${encodeURIComponent(campaignId)}`;
}
