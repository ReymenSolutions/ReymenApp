// Pure module — importable from client and server contexts.
//
// "Qué hacer hoy": recomendaciones accionables a partir de lo que ya
// calcularon match, market y scores. Cada una dice por qué (evidencia) y a
// qué registro apunta. Reglas fijas, sin IA; la prioridad sale de la regla.

import type { RealtyOperation, RealtyPropertyType } from "@prisma/client";

export type RecommendationType =
  | "CONTACT_HIGH_MATCH"
  | "CONFIRM_VISIT"
  | "REVIEW_STAGNANT"
  | "BOOST_PROPERTY"
  | "SOURCE_PROPERTY"
  | "REVIEW_CAMPAIGN"
  | "NO_INVENTORY";

export type Priority = "HIGH" | "MEDIUM" | "LOW";

export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: Priority;
  title: string;
  explanation: string;
  evidence: string[];
  entityType: "property" | "profile" | "visit" | "zone" | "campaign";
  entityId: string;
  actionLabel: string;
  href: string;
}

export interface TodayInput {
  now: Date;
  lang: "es" | "en";
  highMatches: { profileId: string; profileName: string; propertyId: string; propertyTitle: string; score: number; hasVisit: boolean }[];
  upcomingVisits: { appointmentId: string; propertyTitle: string; profileName: string; startsAt: Date; confirmed: boolean }[];
  stagnant: { propertyId: string; title: string; days: number; points: number }[];
  boost: { propertyId: string; title: string; score: number; demand: number }[];
  sourcing: { zoneId: string; zoneName: string; operation: RealtyOperation; propertyType: RealtyPropertyType | null; bandLabel: string; demand: number; supply: number }[];
  deficientCampaigns: { id: string; name: string; spend: string; leads: number; cpl: string | null }[];
  unmatchedProfiles: { profileId: string; name: string; bestScore: number | null }[];
  typeLabel: (t: RealtyPropertyType | null) => string;
  operationLabel: (o: RealtyOperation) => string;
}

const RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
export const MAX_PER_TYPE = 3;

export function buildToday(input: TodayInput, limit = 8): Recommendation[] {
  const es = input.lang === "es";
  const out: Recommendation[] = [];
  const hoursTo = (d: Date) => (d.getTime() - input.now.getTime()) / 3_600_000;

  for (const v of input.upcomingVisits) {
    const h = hoursTo(v.startsAt);
    if (h < 0 || h > 36 || v.confirmed) continue;
    out.push({
      id: `visit:${v.appointmentId}`,
      type: "CONFIRM_VISIT",
      priority: h <= 12 ? "HIGH" : "MEDIUM",
      title: es ? `Confirma la visita de ${v.profileName}` : `Confirm ${v.profileName}'s visit`,
      explanation: es ? `Visita a ${v.propertyTitle} sin confirmar.` : `Visit to ${v.propertyTitle} not confirmed yet.`,
      evidence: [es ? `Empieza en ${Math.max(1, Math.round(h))} h` : `Starts in ${Math.max(1, Math.round(h))} h`],
      entityType: "visit",
      entityId: v.appointmentId,
      actionLabel: es ? "Ver visitas" : "See visits",
      href: "/portal/realty/visits",
    });
  }

  for (const m of input.highMatches) {
    if (m.hasVisit) continue;
    out.push({
      id: `match:${m.profileId}:${m.propertyId}`,
      type: "CONTACT_HIGH_MATCH",
      priority: m.score >= 90 ? "HIGH" : "MEDIUM",
      title: es ? `Muéstrale ${m.propertyTitle} a ${m.profileName}` : `Show ${m.propertyTitle} to ${m.profileName}`,
      explanation: es ? "Match alto y todavía no hay visita agendada." : "High match and no visit scheduled yet.",
      evidence: [`Match ${m.score}/100`],
      entityType: "profile",
      entityId: m.profileId,
      actionLabel: es ? "Ver match" : "See match",
      href: `/portal/realty/prospects/${m.profileId}`,
    });
  }

  for (const s of input.sourcing) {
    const what = `${input.typeLabel(s.propertyType)} · ${input.operationLabel(s.operation)} · ${s.zoneName} · ${s.bandLabel}`;
    out.push({
      id: `source:${s.zoneId}:${s.operation}:${s.propertyType ?? "*"}:${s.bandLabel}`,
      type: "SOURCE_PROPERTY",
      priority: s.supply === 0 && s.demand >= 5 ? "HIGH" : "MEDIUM",
      title: es ? `Capta: ${what}` : `Source: ${what}`,
      explanation: es ? "Hay más prospectos buscando esto que propiedades disponibles que les queden." : "More prospects are looking for this than available listings that fit them.",
      evidence: [es ? `${s.demand} prospectos · ${s.supply} propiedades` : `${s.demand} prospects · ${s.supply} listings`],
      entityType: "zone",
      entityId: s.zoneId,
      actionLabel: es ? "Ver oportunidades" : "See opportunities",
      href: "/portal/realty/opportunities",
    });
  }

  for (const b of input.boost) {
    out.push({
      id: `boost:${b.propertyId}`,
      type: "BOOST_PROPERTY",
      priority: "MEDIUM",
      title: es ? `Impulsa ${b.title}` : `Boost ${b.title}`,
      explanation: es ? "Su zona tiene demanda y la propiedad tiene buen Opportunity Score." : "Its zone has demand and the listing has a strong Opportunity Score.",
      evidence: [`Score ${b.score}/100`, es ? `${b.demand} prospectos en la zona` : `${b.demand} prospects in the zone`],
      entityType: "property",
      entityId: b.propertyId,
      actionLabel: es ? "Ver propiedad" : "See listing",
      href: `/portal/realty/properties/${b.propertyId}`,
    });
  }

  for (const s of input.stagnant) {
    out.push({
      id: `stagnant:${s.propertyId}`,
      type: "REVIEW_STAGNANT",
      priority: s.days >= 120 ? "HIGH" : "MEDIUM",
      title: es ? `Revisa precio y fotos de ${s.title}` : `Review price and photos of ${s.title}`,
      explanation: es ? "Lleva mucho tiempo en inventario con poco interés y sin visitas recientes." : "Long time in inventory with little interest and no recent visits.",
      evidence: [es ? `${s.days} días en inventario` : `${s.days} days listed`, es ? `${s.points} pts de interés en 30 días` : `${s.points} interest pts in 30 days`],
      entityType: "property",
      entityId: s.propertyId,
      actionLabel: es ? "Ver propiedad" : "See listing",
      href: `/portal/realty/properties/${s.propertyId}`,
    });
  }

  for (const c of input.deficientCampaigns) {
    out.push({
      id: `campaign:${c.id}`,
      type: "REVIEW_CAMPAIGN",
      priority: c.leads === 0 ? "HIGH" : "LOW",
      title: es ? `Revisa la campaña ${c.name}` : `Review campaign ${c.name}`,
      explanation: c.leads === 0 ? (es ? "Tiene gasto y ningún lead." : "Spend with no leads.") : es ? "Su costo por lead está muy arriba de tus otras campañas." : "Its cost per lead is well above your other campaigns.",
      evidence: [es ? `Gasto ${c.spend}` : `Spend ${c.spend}`, c.cpl ? `CPL ${c.cpl}` : `${c.leads} leads`],
      entityType: "campaign",
      entityId: c.id,
      actionLabel: es ? "Ver campañas" : "See campaigns",
      href: "/portal/realty/campaigns",
    });
  }

  for (const p of input.unmatchedProfiles) {
    out.push({
      id: `nomatch:${p.profileId}`,
      type: "NO_INVENTORY",
      priority: "LOW",
      title: es ? `Sin inventario para ${p.name}` : `No inventory for ${p.name}`,
      explanation: es ? "Ninguna propiedad disponible le hace buen match: es demanda para captar." : "No available listing is a good match: demand to source for.",
      evidence: [p.bestScore === null ? (es ? "Sin propiedades de su operación" : "No listings for its operation") : `${es ? "Mejor match" : "Best match"} ${p.bestScore}/100`],
      entityType: "profile",
      entityId: p.profileId,
      actionLabel: es ? "Ver prospecto" : "See prospect",
      href: `/portal/realty/prospects/${p.profileId}`,
    });
  }

  // Máximo 3 por tipo, para que un solo tipo (p. ej. muchos matches altos) no tape lo demás.
  const perType = new Map<RecommendationType, number>();
  const capped = out.filter((r) => {
    const n = (perType.get(r.type) ?? 0) + 1;
    perType.set(r.type, n);
    return n <= MAX_PER_TYPE;
  });
  return capped.sort((a, b) => RANK[a.priority] - RANK[b.priority]).slice(0, limit);
}
