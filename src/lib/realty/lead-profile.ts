// Solo servidor. «Lo que busca» una persona del CRM: sus perfiles de búsqueda de Real Estate ya formateados para mostrarse
// en la ficha del contacto (y en su panel lateral) sin que el CRM conozca el modelo de Real Estate. null = la organización
// no tiene el módulo activo (no se muestra nada).

import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { pickDict } from "@/lib/i18n-dict";
import { enumLabel, realtyStrings } from "@/lib/i18n-realty";
import { budgetText } from "./page-helpers";

export interface LeadSearchView {
  id: string;
  active: boolean;
  /** «Compra» / «Renta». */
  operation: string;
  /** «Casa», «Departamento»… (null = sin tipo). */
  type: string | null;
  /** «≤ $4.5M» o «$3.5M–$4.5M». */
  budget: string;
  zones: string[];
  /** De dónde llegó: «landing · smartcard», «manual»… */
  source: string | null;
  /** Propiedad de cuya landing llegó, si aplica. */
  sourceProperty: { id: string; title: string } | null;
  advisor: string | null;
  bestMatch: number | null;
}

/** Máximo de perfiles que se muestran (los activos primero, luego los más recientes). */
const MAX_VIEWS = 3;

export function sourceLabel(source: string | null): string | null {
  if (!source) return null;
  const [kind, detail] = source.split(":");
  const head = kind === "landing" ? "Landing" : kind === "manual" ? "Manual" : kind;
  return detail ? `${head} · ${detail}` : head;
}

export async function getLeadSearchViews(organizationId: string, leadId: string, lang: "es" | "en"): Promise<LeadSearchView[] | null> {
  if (!(await hasModule(organizationId, "REALTY"))) return null;
  const R = pickDict(realtyStrings, lang);
  const rows = await prisma.realtyLeadProfile.findMany({
    where: { organizationId, leadId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    take: MAX_VIEWS,
    select: {
      id: true,
      active: true,
      operation: true,
      propertyType: true,
      minBudget: true,
      maxBudget: true,
      source: true,
      zones: { orderBy: { priority: "asc" }, select: { zone: { select: { name: true } } } },
      sourceProperty: { select: { id: true, title: true } },
      advisor: { select: { name: true, email: true } },
      matches: { orderBy: { totalScore: "desc" }, take: 1, select: { totalScore: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    active: r.active,
    operation: enumLabel(R, "op", r.operation),
    type: r.propertyType ? enumLabel(R, "type", r.propertyType) : null,
    budget: budgetText(r.minBudget === null ? null : Number(r.minBudget), Number(r.maxBudget)),
    zones: r.zones.map((z) => z.zone.name),
    source: sourceLabel(r.source),
    sourceProperty: r.sourceProperty,
    advisor: r.advisor?.name ?? r.advisor?.email ?? null,
    bestMatch: r.matches[0]?.totalScore ?? null,
  }));
}
