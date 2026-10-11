import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import {
  getFoodSalesSummary, getFoodHourlySales, getFoodLowStockItems, getFoodDailySales,
  getFoodTopSellingDishes,
} from "@/lib/food";
import { getSmartcardCompanyIdForOrg, getCompanyCardStats } from "@/lib/smartcard-company";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { cn, formatMoney } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BranchFilter } from "@/components/portal/BranchFilter";
import { listBranches, parseBranchParam } from "@/lib/branches";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, Package, ChefHat, ClipboardList, ArrowRight, Receipt, Clock,
  ArrowUpRight, ArrowDownRight, QrCode, MessageCircle, Eye, Phone, ShoppingBag,
  TrendingUp, Sparkles, Truck, Users, Wallet, ShoppingCart, Bike,
} from "lucide-react";

// Rango de horas que se dibuja por defecto (horario típico de restaurante).
// Solo es el encuadre inicial: si hay ventas antes o después, el rango se
// amplía para incluirlas (ver chartHours abajo), así ninguna venta del día
// queda fuera de la gráfica aunque el negocio abra antes o cierre después.
const DEFAULT_CHART_START_HOUR = 6;
const DEFAULT_CHART_END_HOUR = 23;

const AREAS = [
  { href: "/portal/food/sales", key: "foodSales", icon: DollarSign, ready: true },
  { href: "/portal/food/inventory", key: "foodInventory", icon: Package, ready: true },
  { href: "/portal/food/suppliers", key: "foodSuppliers", icon: Users, ready: true },
  { href: "/portal/food/purchases", key: "foodPurchases", icon: ShoppingCart, ready: true },
  { href: "/portal/food/recipes", key: "foodRecipes", icon: ChefHat, ready: true },
  { href: "/portal/food/profitability", key: "foodProfitability", icon: Wallet, ready: true },
  { href: "/portal/food/operations", key: "foodOperations", icon: ClipboardList, ready: true },
  { href: "/portal/food/delivery", key: "foodDelivery", icon: Bike, ready: true },
] as const;

// ─── Sparkline mínimo, sin dependencias -- una sola serie, un solo trazo ──
function Sparkline({ points, positive }: { points: number[]; positive: boolean | null }) {
  if (points.length < 2) return null;
  const w = 64;
  const h = 24;
  const max = Math.max(...points);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
  const stroke = positive === false ? "#dc2626" : "#fb923c";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface FoodKpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  description?: string;
  trendPct?: number | null;
  trendLabel?: string;
  sparkline?: number[];
  accent?: "orange" | "brand" | "red";
}

function FoodKpiCard({ icon: Icon, label, value, description, trendPct, trendLabel, sparkline, accent = "brand" }: FoodKpiCardProps) {
  const positive = typeof trendPct === "number" ? trendPct >= 0 : null;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              accent === "orange" && "bg-orange-50",
              accent === "brand" && "bg-brand-50",
              accent === "red" && "bg-red-50"
            )}
          >
            <Icon className={cn("h-5 w-5", accent === "orange" && "text-orange-500", accent === "brand" && "text-brand-600", accent === "red" && "text-red-500")} />
          </div>
          {sparkline && <Sparkline points={sparkline} positive={positive} />}
        </div>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        {description && !trendLabel && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        {typeof trendPct === "number" && trendLabel && (
          <p className={cn("mt-1.5 inline-flex items-center gap-1 text-xs font-semibold", positive ? "text-emerald-600" : "text-red-600")}>
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {positive ? "+" : ""}
            {trendPct}% {trendLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function FoodOverviewPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;
  const { branch: branchParam } = await searchParams;
  const branches = await listBranches(orgId, { activeOnly: true });
  const branch = parseBranchParam(branchParam, branches);

  const [t, lang, summary, hourly, daily, lowStock, topDishes, suppliers, smartcardCompanyId, org] = await Promise.all([
    getServerT(),
    getServerLang(),
    getFoodSalesSummary(orgId, branch),
    getFoodHourlySales(orgId, branch),
    getFoodDailySales(orgId, 7, branch),
    getFoodLowStockItems(orgId, 5),
    getFoodTopSellingDishes(orgId, 30, 5, branch),
    prisma.foodSupplier.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        contactName: true,
        phone: true,
        purchases: { where: { voidedAt: null }, orderBy: { purchasedAt: "desc" }, take: 1, select: { purchasedAt: true, total: true } },
      },
      orderBy: { name: "asc" },
      take: 5,
    }),
    getSmartcardCompanyIdForOrg(orgId),
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
  ]);

  const f = pickDict(foodStrings, lang);

  const cardStats = smartcardCompanyId ? await getCompanyCardStats(smartcardCompanyId) : null;
  const realScans = cardStats?.byType["qr_scan"] ?? 0;
  const realWhatsapp = cardStats?.byType["whatsapp_click"] ?? 0;
  const realProfileViews = cardStats?.byType["profile_view"] ?? 0;
  const realCalls = cardStats?.byType["call_click"] ?? 0;

  const avgTicketToday = summary.today.count > 0 ? summary.today.gross / summary.today.count : 0;

  const hoursWithSales = hourly.filter((h) => h.count > 0).map((h) => h.hour);
  const chartStart = Math.min(DEFAULT_CHART_START_HOUR, ...hoursWithSales);
  const chartEnd = Math.max(DEFAULT_CHART_END_HOUR, ...hoursWithSales);
  const chartHours = hourly.filter((h) => h.hour >= chartStart && h.hour <= chartEnd);
  const maxHourlyGross = Math.max(...chartHours.map((h) => h.gross), 0);

  const grossSpark = daily.map((d) => d.gross);
  const ordersSpark = daily.map((d) => d.count);
  const ticketSpark = daily.map((d) => (d.count > 0 ? d.gross / d.count : 0));

  const todayLabel = new Date().toLocaleDateString(f.dateLocale, { weekday: "short", day: "numeric", month: "short" });

  return (
    <div>
      {/* ── Header principal ─────────────────────────────────────────── */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 px-6 py-6 text-white sm:px-8 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">{f.welcome}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Reymen Foods</h1>
            <p className="mt-1 text-sm text-brand-200">{org?.name ?? f.restaurantPanel}</p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="text-sm italic text-brand-100">{f.tagline}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
              <Clock className="h-3.5 w-3.5" />
              {f.today} · {todayLabel}
            </span>
          </div>
        </div>
      </div>

      <BranchFilter branches={branches} current={branch} es={lang === "es"} basePath="/portal/food" />

      {/* ── KPIs superiores ──────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FoodKpiCard
          icon={DollarSign}
          label={f.salesToday}
          value={formatMoney(summary.today.gross)}
          trendPct={summary.vsYesterdayGrossPct}
          trendLabel={f.vsYesterday}
          sparkline={grossSpark}
          accent="orange"
        />
        <FoodKpiCard
          icon={Receipt}
          label={f.avgTicket}
          value={formatMoney(avgTicketToday)}
          trendPct={summary.vsYesterdayTicketPct}
          trendLabel={f.vsYesterday}
          sparkline={ticketSpark}
        />
        <FoodKpiCard
          icon={ShoppingBag}
          label={f.ordersToday}
          value={String(summary.today.count)}
          trendPct={summary.vsYesterdayOrdersPct}
          trendLabel={f.vsYesterday}
          sparkline={ordersSpark}
        />
        <FoodKpiCard
          icon={Package}
          label={f.lowStockSupplies}
          value={String(lowStock.length)}
          description={f.atOrBelowMin}
          accent={lowStock.length > 0 ? "red" : "brand"}
        />
      </div>

      {/* ── Composición principal ────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Ventas por hora */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base">{f.salesByHour}</CardTitle>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{f.today}</span>
          </CardHeader>
          <CardContent>
            {summary.today.count === 0 ? (
              <p className="rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                {f.noSalesToday}
              </p>
            ) : (
              <div className="flex min-h-[260px] items-end gap-0.5 border-b border-slate-100 pb-0">
                {chartHours.map((h) => {
                  // Altura en px directa, no porcentaje: un % de altura solo
                  // funciona si el contenedor inmediato tiene una altura
                  // definida, y aquí cada columna es un flex item con altura
                  // automática (se alinean por abajo vía items-end en el
                  // padre) -- un % ahí siempre resuelve a 0. Con px fijos se
                  // evita el problema por completo.
                  const barPx = maxHourlyGross > 0 ? Math.max(4, Math.round((h.gross / maxHourlyGross) * 220)) : 0;
                  const isPeak = h.gross === maxHourlyGross && h.gross > 0;
                  return (
                    <div key={h.hour} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
                      <span className="h-3 max-w-full whitespace-nowrap text-[10px] font-medium text-slate-600">
                        {isPeak ? formatMoney(h.gross, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : ""}
                      </span>
                      <div
                        className={cn(
                          "w-full rounded-t-sm transition-colors",
                          isPeak ? "bg-orange-500" : "bg-orange-300 group-hover:bg-orange-400"
                        )}
                        style={{ height: `${barPx}px` }}
                        title={f.hourTooltip(h.hour, formatMoney(h.gross), h.count)}
                      />
                      {/* Con muchas horas no caben todas las etiquetas: se muestran las pares. */}
                      <span className="h-3 text-[10px] leading-3 text-slate-400">{chartHours.length > 12 && h.hour % 2 !== 0 ? "" : `${h.hour}h`}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Platillos más vendidos -- ventas reales por platillo (POS o captura), últimos 30 días */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base">{f.topDishes}</CardTitle>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{f.last30DaysShort}</span>
          </CardHeader>
          <CardContent className="p-0">
            {topDishes.length === 0 ? (
              <p className="px-6 py-4 text-sm text-slate-500">{f.noDishSales}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {topDishes.map((dish, i) => (
                  <li key={dish.variantId} className="flex items-center gap-3 px-6 py-2.5">
                    <span className="w-4 text-xs font-semibold text-slate-400">{i + 1}</span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50">
                      <ChefHat className="h-4 w-4 text-orange-500" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{dish.name}</p>
                      <p className="text-xs text-slate-500">{f.unitsSold(dish.unitsSold)}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{formatMoney(dish.revenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-slate-100 px-6 py-2.5">
              <Link href="/portal/food/sales" className="text-xs font-medium text-brand-600 hover:underline">
                {f.seeAll}
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* SmartCard Restaurante -- widget real, parte de Food */}
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{f.smartcardWidget}</CardTitle>
            <Link href="/portal/smartcard" className="text-xs font-medium text-brand-600 hover:underline">
              {f.seeDetail}
            </Link>
          </CardHeader>
          <CardContent>
            {/* Parte visual */}
            <div className="mb-4 rounded-xl bg-gradient-to-br from-brand-900 to-brand-950 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-200">Reymen Solutions</p>
                  <p className="mt-2 text-sm font-medium">{f.smartcardSlogan}</p>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white">
                  <QrCode className="h-7 w-7 text-brand-900" />
                </div>
              </div>
            </div>

            {/* Parte funcional */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <QrCode className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{f.scans}</span>
                </div>
                <p className="mt-1 text-lg font-bold text-slate-900">{realScans.toLocaleString("es-MX")}</p>
              </div>
              <div className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{f.whatsappClicks}</span>
                </div>
                <p className="mt-1 text-lg font-bold text-slate-900">{realWhatsapp.toLocaleString("es-MX")}</p>
              </div>
              <div className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Eye className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{f.profileViews}</span>
                </div>
                <p className="mt-1 text-lg font-bold text-slate-900">{realProfileViews.toLocaleString("es-MX")}</p>
              </div>
              <div className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Phone className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">{f.callClicks}</span>
                </div>
                <p className="mt-1 text-lg font-bold text-slate-900">{realCalls.toLocaleString("es-MX")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Fila inferior ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Inventario bajo */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base">{f.lowInventory}</CardTitle>
            </div>
            <Link href="/portal/food/inventory" className="text-xs font-medium text-brand-600 hover:underline">
              {f.seeInventory}
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {lowStock.length === 0 ? (
              <p className="px-6 py-4 text-sm text-slate-500">{f.allAboveMin}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lowStock.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-6 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
                      <Package className="h-4 w-4 text-red-500" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.currentStock} / {item.minStock} {item.unit}
                      </p>
                    </div>
                    <Badge variant="destructive" className="text-[10px]">{f.low}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Proveedores -- directorio real con su última compra */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base">{f.suppliers}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {suppliers.length === 0 ? (
              <p className="px-6 py-4 text-sm text-slate-500">{f.noSuppliers}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {suppliers.map((sup) => (
                  <li key={sup.id} className="flex items-center gap-3 px-6 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                      <Truck className="h-4 w-4 text-slate-400" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{sup.name}</p>
                      {(sup.contactName || sup.phone) && (
                        <p className="truncate text-xs text-slate-500">{[sup.contactName, sup.phone].filter(Boolean).join(" · ")}</p>
                      )}
                      {sup.purchases[0] && (
                        <p className="truncate text-xs text-slate-400">
                          {f.lastPurchase(
                            sup.purchases[0].purchasedAt.toLocaleDateString(f.dateLocale),
                            formatMoney(Number(sup.purchases[0].total))
                          )}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-slate-100 px-6 py-2.5">
              <Link href="/portal/food/suppliers" className="text-xs font-medium text-brand-600 hover:underline">
                {f.seeAll}
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Insights del mes -- todo real */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{f.monthInsights}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">{f.sales}</p>
                <p className={cn("mt-0.5 text-sm font-bold", (summary.monthOverMonthGrossPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {summary.monthOverMonthGrossPct !== null ? `${summary.monthOverMonthGrossPct >= 0 ? "+" : ""}${summary.monthOverMonthGrossPct}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">{f.orders}</p>
                <p className={cn("mt-0.5 text-sm font-bold", (summary.monthOverMonthOrdersPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {summary.monthOverMonthOrdersPct !== null ? `${summary.monthOverMonthOrdersPct >= 0 ? "+" : ""}${summary.monthOverMonthOrdersPct}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">{f.avgTicket}</p>
                <p className={cn("mt-0.5 text-sm font-bold", (summary.monthOverMonthTicketPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {summary.monthOverMonthTicketPct !== null ? `${summary.monthOverMonthTicketPct >= 0 ? "+" : ""}${summary.monthOverMonthTicketPct}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">{f.lowSupplies}</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">{lowStock.length}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-900 to-brand-950 p-3 text-white">
              <Sparkles className="h-4 w-4 shrink-0 text-orange-300" />
              <p className="text-xs font-medium">{f.insightsTagline}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{f.moduleAreas}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AREAS.map((area) => {
            const Icon = area.icon;
            return (
              <Link
                key={area.href}
                href={area.href}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-brand-50 p-2">
                    <Icon className="h-4 w-4 text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t[area.key]}</p>
                    {!area.ready && <p className="text-xs text-slate-400">{f.comingSoon}</p>}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
