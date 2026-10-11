import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import {
  getFoodOperatingCosts, getTotalMonthlyFixedCosts, getFoodBreakEven, getFoodNetProfit,
  getFoodCostReductionInsights, getFoodProfitRecommendations, getFoodLeastSoldDishes,
  getFoodDishesWithCost, flattenVariants,
} from "@/lib/food";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { PageHeader } from "@/components/shared/PageHeader";
import { listBranches, parseBranchParam } from "@/lib/branches";
import { BranchFilter } from "@/components/portal/BranchFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { FoodOperatingCostFormDialog } from "@/components/portal/FoodOperatingCostFormDialog";
import { FoodOperatingCostToggle } from "@/components/portal/FoodOperatingCostToggle";
import { FoodNetProfitPanel } from "@/components/portal/FoodNetProfitPanel";
import { FoodPriceCalculator } from "@/components/portal/FoodPriceCalculator";
import { can } from "@/lib/permissions";
import { cn, formatMoney } from "@/lib/utils";
import { Wallet, Target, TrendingDown, TrendingUp, Megaphone } from "lucide-react";

function marginColor(marginPct: number | null): string {
  if (marginPct === null) return "text-slate-400";
  if (marginPct < 15) return "text-red-600";
  if (marginPct < 30) return "text-amber-600";
  return "text-emerald-600";
}

const RECOMMENDATION_BADGE: Record<string, "destructive" | "warning" | "info"> = {
  review_urgent: "destructive",
  raise_price_or_cut_cost: "warning",
  promote: "info",
};

export default async function FoodProfitabilityPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;
  const { branch: branchParam } = await searchParams;
  const branches = await listBranches(orgId, { activeOnly: true });
  const branch = parseBranchParam(branchParam, branches);

  const [
    t, lang, operatingCosts, fixedCostsMonthly, breakEven, profitToday, profit7d, profit30d,
    costInsights, recommendations, leastSold, dishesWithCost, org,
  ] = await Promise.all([
    getServerT(),
    getServerLang(),
    getFoodOperatingCosts(orgId),
    getTotalMonthlyFixedCosts(orgId),
    getFoodBreakEven(orgId),
    getFoodNetProfit(orgId, "today", branch),
    getFoodNetProfit(orgId, "7d", branch),
    getFoodNetProfit(orgId, "30d", branch),
    getFoodCostReductionInsights(orgId),
    getFoodProfitRecommendations(orgId, branch),
    getFoodLeastSoldDishes(orgId, 30, 5, branch),
    getFoodDishesWithCost(orgId, { activeOnly: true }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { foodTargetCostPct: true } }),
  ]);

  const f = pickDict(foodStrings, lang);
  const canManage = can(session.user.role, "food:manage");
  const recLabel: Record<string, string> = {
    review_urgent: f.recUrgent,
    raise_price_or_cut_cost: f.recRaisePrice,
    promote: f.recPromote,
  };
  function recReason(rec: (typeof recommendations)[number]): string {
    if (rec.type === "review_urgent") return f.recReasonUrgent(formatMoney(rec.cost), formatMoney(rec.price));
    if (rec.type === "raise_price_or_cut_cost") return f.recReasonRaise(rec.unitsSold, rec.marginPct ?? 0);
    return f.recReasonPromote(rec.unitsSold, rec.marginPct ?? 0);
  }

  return (
    <div>
      <PageHeader title={t.foodProfitability} description={f.profitabilityDesc} />
      <BranchFilter branches={branches} current={branch} es={lang === "es"} basePath="/portal/food/profitability" />
      {branch !== undefined && (
        <p className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {lang === "es"
            ? "Vista de una sucursal: ingresos, costo de lo vendido y platillos de esa sucursal. Los costos fijos y el punto de equilibrio son de todo el negocio y no se restan aquí."
            : "Single-branch view: revenue, cost of goods and dishes for that branch. Fixed costs and break-even are business-wide and are not deducted here."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Gastos fijos */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base">{f.monthlyFixedCosts}</CardTitle>
              </div>
              {canManage && <FoodOperatingCostFormDialog />}
            </CardHeader>
            <CardContent className="p-0">
              {operatingCosts.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Wallet} title={f.noFixedCosts} description={f.noFixedCostsDesc} />
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-slate-100">
                    {operatingCosts.map((cost) => (
                      <li key={cost.id} className={cn("flex items-center justify-between px-6 py-3", !cost.isActive && "opacity-50")}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900">{cost.name}</p>
                          {!cost.isActive && <Badge variant="secondary" className="text-[10px]">{f.inactive}</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{formatMoney(cost.amountMonthly)}</p>
                          {canManage && <FoodOperatingCostFormDialog cost={cost} />}
                          {canManage && <FoodOperatingCostToggle costId={cost.id} isActive={cost.isActive} />}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
                    <p className="text-sm font-medium text-slate-700">{f.monthlyTotalActive}</p>
                    <p className="text-base font-bold text-slate-900">{formatMoney(fixedCostsMonthly)}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Punto de equilibrio */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base">{f.breakEven}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {breakEven.blended && (
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
                  <p className="text-xs font-medium text-brand-700">
                    {f.blendedBreakEven(breakEven.blended.basedOnDays)}
                  </p>
                  <p className="mt-1 text-lg font-bold text-brand-900">
                    {f.unitsAndRevenue(breakEven.blended.breakEvenUnits.toLocaleString(f.dateLocale), formatMoney(breakEven.blended.breakEvenRevenue))}
                  </p>
                </div>
              )}
              {breakEven.perVariant.length === 0 ? (
                <p className="text-sm text-slate-500">{f.breakEvenEmpty}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                        <th className="py-2 pr-3">{f.dish}</th>
                        <th className="py-2 pr-3">{f.margin}</th>
                        <th className="py-2">{f.unitsToCoverFixed}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {breakEven.perVariant.map((row) => (
                        <tr key={row.variantId}>
                          <td className="py-2 pr-3 font-medium text-slate-900">{row.name}</td>
                          <td className="py-2 pr-3">{formatMoney(row.contributionMargin)}</td>
                          <td className="py-2">
                            {row.breakEvenUnits !== null ? (
                              f.unitsCount(row.breakEvenUnits.toLocaleString(f.dateLocale))
                            ) : (
                              <span className="text-red-600">{f.neverAlone}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Utilidad neta */}
          <FoodNetProfitPanel data={{ today: profitToday, "7d": profit7d, "30d": profit30d }} />

          {/* Reducción de costos */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base">{f.costReduction}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {costInsights.lowestMarginItems.length === 0 && costInsights.topCostIngredients.length === 0 ? (
                <p className="text-sm text-slate-500">{f.costInsightsEmpty}</p>
              ) : (
                <>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{f.lowestMarginDishes}</p>
                    <ul className="space-y-1.5">
                      {costInsights.lowestMarginItems.map((d) => (
                        <li key={d.variantId} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{d.name}</span>
                          <span className={cn("font-medium", marginColor(d.marginPct))}>{d.marginPct !== null ? `${d.marginPct}%` : "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{f.heaviestIngredients}</p>
                    <ul className="space-y-1.5">
                      {costInsights.topCostIngredients.map((i) => (
                        <li key={i.inventoryItemId} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{i.name}</span>
                          <span className="font-medium text-slate-900">{f.usedInDishes(formatMoney(i.totalRecipeCost), i.usedInDishes)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Mejorar utilidad */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base">{f.profitRecommendations}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {f.noRecommendations}
                </p>
              ) : (
                <ul className="space-y-3">
                  {recommendations.map((rec, i) => {
                    const badge = RECOMMENDATION_BADGE[rec.type];
                    return (
                      <li key={`${rec.variantId}-${i}`} className="flex items-start gap-2">
                        <Badge variant={badge} className="mt-0.5 flex-shrink-0 text-[10px]">
                          {recLabel[rec.type]}
                        </Badge>
                        <p className="text-sm text-slate-700">
                          <span className="font-medium text-slate-900">{rec.name}:</span> {recReason(rec)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Promociones recomendadas */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base">{f.recommendedPromotions}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {leastSold.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {f.promotionsEmpty}
                </p>
              ) : (
                <ul className="space-y-2">
                  {leastSold.map((d) => (
                    <li key={d.variantId} className="rounded-md bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-900">{d.name}</span>
                        <span className="text-slate-500">{f.soldIn30Days(d.unitsSold)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {f.promotionTip}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <FoodPriceCalculator
            dishes={flattenVariants(dishesWithCost).map((v) => ({ id: v.id, name: v.displayName, cost: v.cost }))}
            initialTargetPct={org?.foodTargetCostPct ?? 30}
            canSaveDefault={canManage}
          />
        </div>
      </div>
    </div>
  );
}
