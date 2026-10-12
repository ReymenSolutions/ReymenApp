import { prisma } from "./prisma";
import { getPlan, monthlyPriceMxn } from "./plans";
import { toUsd } from "./currency";
import { getMxnPerUsdRate, type ExchangeRateSource } from "./exchange-rate";

export interface RoiData {
  hasWonDeals: boolean;
  totalWonOpportunities: number;
  totalRevenue: number;
  avgDealValue: number;
  last30WonOpportunities: number;
  last30Revenue: number;
  /** Precio mensual del plan en MXN (el pactado con el cliente o el de lista). */
  planCostMxn: number;
  /** El mismo precio en USD (para compararlo con los ingresos, que se suman en USD); null si no hubo tipo de cambio. */
  planCost: number | null;
  /** Pesos por dólar usados para convertir los montos en MXN, o null si no hubo tipo de cambio disponible. */
  mxnPerUsd: number | null;
  rateSource: ExchangeRateSource | null;
  /** Fecha del tipo de cambio según la fuente (YYYY-MM-DD). */
  rateDate: string | null;
  /** Oportunidades ganadas que no se pudieron convertir a USD y quedaron fuera de los totales. */
  unconvertedOpportunities: number;
  /** null when there's no USD plan cost to divide by (no exchange rate available). */
  roi: number | null;
}

/**
 * Real ROI, sourced from actual closed-won deals instead of a manual
 * "guess your average deal value" input. Revenue comes from Opportunity.amount
 * on opportunities sitting in a PipelineStage marked isWon — the same data
 * the sales pipeline itself considers a won deal, not a separate estimate.
 *
 * Amounts are converted to USD (the plan price, set in MXN, is converted too) with the
 * automatic MXN/USD exchange rate — see exchange-rate.ts. Opportunities that can't be
 * converted are left out of the totals and counted in unconvertedOpportunities.
 *
 * last30* mirrors the reports page's own 30-day window so the revenue figure
 * is comparable to a monthly subscription cost, rather than mixing an
 * all-time revenue sum against a single month of plan cost.
 */
export async function getRoiData(organizationId: string, plan: string): Promise<RoiData> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rate = await getMxnPerUsdRate();
  const mxnPerUsd = rate?.rate ?? null;

  // Agrupado por moneda: el plan cuesta USD y las oportunidades pueden estar
  // en MXN, así que sumar los montos tal cual mezclaría pesos con dólares.
  const wonWhere = { organizationId, amount: { not: null }, pipelineStage: { isWon: true } };
  const [totalsByCurrency, last30ByCurrency] = await Promise.all([
    prisma.opportunity.groupBy({
      by: ["currency"],
      where: wonWhere,
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.opportunity.groupBy({
      by: ["currency"],
      where: { ...wonWhere, closedAt: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  function sumInUsd(rows: typeof totalsByCurrency) {
    let revenue = 0;
    let count = 0;
    let unconverted = 0;
    for (const row of rows) {
      const usd = toUsd(row._sum.amount ?? 0, row.currency, mxnPerUsd);
      if (usd === null) {
        unconverted += row._count.id;
      } else {
        revenue += usd;
        count += row._count.id;
      }
    }
    return { revenue: Math.round(revenue * 100) / 100, count, unconverted };
  }

  const totals = sumInUsd(totalsByCurrency);
  const last30 = sumInUsd(last30ByCurrency);

  const totalWonOpportunities = totals.count;
  const totalRevenue = totals.revenue;
  const last30WonOpportunities = last30.count;
  const last30Revenue = last30.revenue;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { customMonthlyPriceMxn: true },
  });
  const customPrice = org?.customMonthlyPriceMxn != null ? Number(org.customMonthlyPriceMxn) : null;
  const planCostMxn = monthlyPriceMxn(await getPlan(plan), customPrice);
  const planCost = mxnPerUsd ? Math.round((planCostMxn / mxnPerUsd) * 100) / 100 : null;

  return {
    hasWonDeals: totalWonOpportunities > 0,
    totalWonOpportunities,
    totalRevenue,
    avgDealValue: totalWonOpportunities > 0 ? totalRevenue / totalWonOpportunities : 0,
    last30WonOpportunities,
    last30Revenue,
    planCostMxn,
    planCost,
    mxnPerUsd,
    rateSource: rate?.source ?? null,
    rateDate: rate?.date ?? null,
    unconvertedOpportunities: totals.unconverted,
    roi: planCost !== null && planCost > 0 ? Math.round(((last30Revenue - planCost) / planCost) * 100) : null,
  };
}
