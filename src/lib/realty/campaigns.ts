// Pure module — importable from client and server contexts.
//
// Métricas de campañas registradas a mano (gasto, leads, visitas, cierres,
// ingreso atribuido). Toda división protege el cero: sin denominador no hay
// métrica (null), nunca Infinity ni NaN. No hay IA aquí.

export interface CampaignInput {
  id: string;
  spend: number;
  leadsCount: number;
  visitsCount: number;
  closingsCount: number;
  attributedRevenue: number | null;
}

export interface CampaignMetrics {
  id: string;
  cpl: number | null;
  costPerVisit: number | null;
  costPerClosing: number | null;
  /** (ingreso − gasto) / gasto; 1 = 100 %. */
  roi: number | null;
  leadToVisitPct: number | null;
  visitToClosingPct: number | null;
}

export function safeDiv(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
const pct = (a: number, b: number) => {
  const r = safeDiv(a, b);
  return r === null ? null : Math.round(r * 100);
};

export function campaignMetrics(c: CampaignInput): CampaignMetrics {
  return {
    id: c.id,
    cpl: round2(safeDiv(c.spend, c.leadsCount)),
    costPerVisit: round2(safeDiv(c.spend, c.visitsCount)),
    costPerClosing: round2(safeDiv(c.spend, c.closingsCount)),
    roi: c.attributedRevenue === null ? null : round2(safeDiv(c.attributedRevenue - c.spend, c.spend)),
    leadToVisitPct: pct(c.visitsCount, c.leadsCount),
    visitToClosingPct: pct(c.closingsCount, c.visitsCount),
  };
}

export type CampaignRating = "EFFICIENT" | "NORMAL" | "DEFICIENT" | "NO_DATA";

/**
 * Lectura de una campaña frente a las demás de la empresa:
 *  - sin gasto → sin datos;
 *  - gasto sin leads, o CPL ≥ 1.5× la mediana → deficiente;
 *  - ROI ≥ 100 % o CPL ≤ 0.8× la mediana → eficiente;
 *  - lo demás, normal.
 */
export function rateCampaign(c: CampaignInput, m: CampaignMetrics, medianCpl: number | null): CampaignRating {
  if (c.spend <= 0) return "NO_DATA";
  if (c.leadsCount === 0) return "DEFICIENT";
  if (m.roi !== null && m.roi >= 1) return "EFFICIENT";
  if (medianCpl !== null && m.cpl !== null) {
    if (m.cpl >= medianCpl * 1.5) return "DEFICIENT";
    if (m.cpl <= medianCpl * 0.8) return "EFFICIENT";
  }
  return "NORMAL";
}

export interface CampaignTotals {
  spend: number;
  leads: number;
  visits: number;
  closings: number;
  revenue: number;
  cpl: number | null;
  costPerVisit: number | null;
  costPerClosing: number | null;
  roi: number | null;
}

export function campaignTotals(cs: CampaignInput[]): CampaignTotals {
  const spend = cs.reduce((a, c) => a + c.spend, 0);
  const leads = cs.reduce((a, c) => a + c.leadsCount, 0);
  const visits = cs.reduce((a, c) => a + c.visitsCount, 0);
  const closings = cs.reduce((a, c) => a + c.closingsCount, 0);
  const withRevenue = cs.filter((c) => c.attributedRevenue !== null);
  const revenue = withRevenue.reduce((a, c) => a + (c.attributedRevenue ?? 0), 0);
  return {
    spend,
    leads,
    visits,
    closings,
    revenue,
    cpl: round2(safeDiv(spend, leads)),
    costPerVisit: round2(safeDiv(spend, visits)),
    costPerClosing: round2(safeDiv(spend, closings)),
    // Conservador: el ingreso atribuido conocido contra TODO el gasto (las campañas sin ingreso registrado cuentan como 0).
    roi: withRevenue.length ? round2(safeDiv(revenue - spend, spend)) : null,
  };
}

export function analyzeCampaigns(cs: CampaignInput[]): { id: string; metrics: CampaignMetrics; rating: CampaignRating }[] {
  const metrics = cs.map(campaignMetrics);
  const cpls = metrics.map((m) => m.cpl).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const medianCpl = cpls.length ? (cpls.length % 2 ? cpls[(cpls.length - 1) / 2] : (cpls[cpls.length / 2 - 1] + cpls[cpls.length / 2]) / 2) : null;
  return cs.map((c, i) => ({ id: c.id, metrics: metrics[i], rating: rateCampaign(c, metrics[i], cpls.length >= 2 ? medianCpl : null) }));
}
