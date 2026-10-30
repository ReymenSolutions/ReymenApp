import { daysAgoStart, getOrgTimezone } from "@/lib/business-day";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasModule, requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getFoodSalesSummary, getFoodSalesByChannel } from "@/lib/food";
import { createFoodSale } from "@/actions/food";
import { branchWhere, listBranches, parseBranchParam } from "@/lib/branches";
import { BranchFilter } from "@/components/portal/BranchFilter";
import { FoodSaleActions } from "@/components/portal/FoodSaleActions";
import { can } from "@/lib/permissions";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { ActionForm } from "@/components/shared/ActionForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { BarChart3, DollarSign } from "lucide-react";
import { PosLockedNotice } from "@/components/portal/PosLockedNotice";

// Valor para <input type="datetime-local"> en la hora local del servidor
// (TZ del contenedor), que es la misma con la que createFoodSale interpreta
// lo que se envía. Antes se usaba toISOString(), que está en UTC: la fecha
// venía adelantada 6 horas y, si no se corregía, la venta quedaba mal.
function toLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function FoodSalesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;
  const { branch: branchParam } = await searchParams;
  const branches = await listBranches(orgId);
  const branch = parseBranchParam(branchParam, branches);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const since30 = daysAgoStart(30, await getOrgTimezone(orgId));
  const [t, lang, summary, byChannel, recentSales, usesPos, discounts] = await Promise.all([
    getServerT(),
    getServerLang(),
    getFoodSalesSummary(orgId, branch),
    getFoodSalesByChannel(orgId, branch),
    prisma.foodSale.findMany({
      where: { organizationId: orgId, ...branchWhere(branch) },
      orderBy: { occurredAt: "desc" },
      take: 25,
    }),
    hasModule(orgId, "REYMEN_POS"),
    // Descuentos que el POS aplicó en el cobro (últimos 30 días, de la sucursal elegida o de todas).
    prisma.foodSale.aggregate({
      where: { organizationId: orgId, ...branchWhere(branch), occurredAt: { gte: since30 }, discountAmount: { not: null } },
      _sum: { discountAmount: true },
      _count: { _all: true },
    }),
  ]);

  const f = pickDict(foodStrings, lang);
  const canManage = can(session.user.role, "food:manage");
  const totalChannelGross = byChannel.reduce((sum, c) => sum + c.gross, 0);

  return (
    <div>
      <PageHeader title={t.foodSales} description={f.salesAnalyticsDesc} />
      <BranchFilter branches={branches.filter((b) => b.isActive)} current={branch} es={lang === "es"} basePath="/portal/food/sales" />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title={f.today} value={formatMoney(summary.today.gross)} description={f.salesCountGross(summary.today.count)} icon={DollarSign} />
        <MetricCard title={f.last7Days} value={formatMoney(summary.last7Days.gross)} description={f.salesCountGross(summary.last7Days.count)} icon={DollarSign} />
        <MetricCard
          title={f.last30Days}
          value={formatMoney(summary.last30Days.gross)}
          description={f.netLabel(formatMoney(summary.last30Days.net))}
          icon={DollarSign}
          trend={summary.monthOverMonthGrossPct !== null ? { value: summary.monthOverMonthGrossPct, label: f.vsPrev30Days } : undefined}
        />
        <MetricCard title={f.salesCount30} value={summary.last30Days.count} icon={BarChart3} />
        {discounts._count._all > 0 && (
          <MetricCard
            title={lang === "es" ? "Descuentos (30 días)" : "Discounts (30 days)"}
            value={formatMoney(Number(discounts._sum.discountAmount ?? 0))}
            description={lang === "es" ? `${discounts._count._all} venta(s) con descuento` : `${discounts._count._all} sale(s) with a discount`}
            icon={DollarSign}
          />
        )}
      </div>

      {/* Antes en /portal/food/analytics: desglose por canal de los últimos 30 días. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{f.salesByChannel30}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {byChannel.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={BarChart3} title={f.noDataYet} description={f.noChannelDataDesc} />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byChannel.map((c) => {
                const pct = totalChannelGross > 0 ? Math.round((c.gross / totalChannelGross) * 100) : 0;
                return (
                  <li key={c.channel ?? ""} className="px-6 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
                      <span className="font-medium text-slate-900">{c.channel ?? f.noChannel}</span>
                      <span className="text-slate-500">{formatMoney(c.gross)} · {f.salesCount(c.count)} · {pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{f.recentSales}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentSales.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={DollarSign} title={f.noSalesYet} description={f.noSalesYetDesc} />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentSales.map((sale) => (
                    <li key={sale.id} className="flex items-center justify-between gap-3 px-6 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900">{formatDateTime(sale.occurredAt, lang)}</p>
                          {sale.source === "POS" && <Badge variant="secondary" className="text-[10px]">{f.posSaleBadge}</Badge>}
                        </div>
                        <p className="text-xs text-slate-500">
                          {sale.channel ?? f.noChannel}
                          {branches.length > 0 && ` · ${sale.branchId ? (branchName.get(sale.branchId) ?? "—") : lang === "es" ? "Principal" : "Main"}`}
                        </p>
                        {sale.discountAmount !== null && (
                          <p className="truncate text-xs text-emerald-700">
                            {lang === "es" ? "Descuento" : "Discount"} {formatMoney(Number(sale.discountAmount))}
                            {sale.discountReason && ` · ${sale.discountReason}`}
                          </p>
                        )}
                        {sale.notes && <p className="truncate text-xs text-slate-400">{sale.notes}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">{formatMoney(Number(sale.grossAmount))}</p>
                          <p className="text-xs text-slate-500">{f.netLabel(formatMoney(Number(sale.netAmount)))}</p>
                        </div>
                        {canManage && sale.source === "MANUAL" && (
                          <div className="flex items-center">
                            <FoodSaleActions
                              sale={{
                                id: sale.id,
                                occurredAt: toLocalDateTimeInput(sale.occurredAt),
                                channel: sale.channel,
                                grossAmount: Number(sale.grossAmount),
                                netAmount: Number(sale.netAmount),
                                notes: sale.notes,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {usesPos ? (
          <PosLockedNotice title={f.posLockedTitle} description={f.posLockedSaleDesc} />
        ) : !canManage ? (
          <p className="self-start rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">{f.viewOnlyNotice}</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{f.recordSale}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={createFoodSale} successMessage={{ es: "Venta registrada", en: "Sale recorded" }} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="occurredAt" className="text-xs font-medium text-slate-600">{f.date}</label>
                  <input
                    id="occurredAt" name="occurredAt" type="datetime-local" required
                    defaultValue={toLocalDateTimeInput(new Date())}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="channel" className="text-xs font-medium text-slate-600">{f.channel}</label>
                  <input id="channel" name="channel" type="text" placeholder={f.channelPlaceholder} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div className="flex gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label htmlFor="grossAmount" className="text-xs font-medium text-slate-600">{f.gross}</label>
                    <input id="grossAmount" name="grossAmount" type="number" step="0.01" min="0" required className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label htmlFor="netAmount" className="text-xs font-medium text-slate-600">{f.netNoTax}</label>
                    <input id="netAmount" name="netAmount" type="number" step="0.01" min="0" required className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="notes" className="text-xs font-medium text-slate-600">{f.notes}</label>
                  <textarea id="notes" name="notes" rows={2} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <button type="submit" className="mt-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60">
                  {f.saveSale}
                </button>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
