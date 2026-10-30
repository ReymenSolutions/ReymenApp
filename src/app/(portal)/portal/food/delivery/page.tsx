import { getOrgTimezone, startOfLocalDay } from "@/lib/business-day";
import { redirect } from "next/navigation";
import { Bike, Clock, Receipt, AlertTriangle } from "lucide-react";
import type { DeliveryOrder, DeliveryOrderStatus, DeliveryPlatform } from "@prisma/client";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { deliveryStrings } from "@/lib/i18n-delivery";
import { pickDict } from "@/lib/i18n-dict";
import { appUrl } from "@/lib/app-url";
import { DELIVERY_LATE_MINUTES, DELIVERY_PLATFORMS, FINISHED_STATUSES, isDeliveryLate, nextDeliveryStatus, type DeliveryItem } from "@/lib/delivery";
import { cn, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { AutoRefresh } from "@/components/shared/AutoRefresh";
import { CopyButton } from "@/components/shared/CopyButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeliveryChannelControls, DeliveryClearTests, DeliveryOrderActions } from "@/components/portal/DeliveryControls";

// Food → Delivery: pedidos de Uber Eats, Rappi y DiDi Food en un tablero
// por estado, y la conexión de cada plataforma. Se refresca sola.

export const dynamic = "force-dynamic";

const PLATFORM: Record<DeliveryPlatform, { name: string; cls: string; dot: string }> = {
  UBER_EATS: { name: "Uber Eats", cls: "bg-emerald-50 text-emerald-800 border-emerald-200", dot: "bg-emerald-600" },
  RAPPI: { name: "Rappi", cls: "bg-orange-50 text-orange-800 border-orange-200", dot: "bg-orange-500" },
  DIDI_FOOD: { name: "DiDi Food", cls: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
};

const COLUMNS: { key: "colNew" | "colPreparing" | "colReady" | "colOnTheWay"; statuses: DeliveryOrderStatus[] }[] = [
  { key: "colNew", statuses: ["NEW"] },
  { key: "colPreparing", statuses: ["ACCEPTED", "PREPARING"] },
  { key: "colReady", statuses: ["READY"] },
  { key: "colOnTheWay", statuses: ["PICKED_UP"] },
];

const EXAMPLE = {
  platform: "RAPPI",
  externalId: "rappi-123456789",
  displayId: "A1B2",
  status: "NEW",
  customerName: "Ana P.",
  total: 289,
  placedAt: "2026-10-03T19:05:00-06:00",
  notes: "Sin cubiertos",
  items: [{ name: "Hamburguesa clásica", quantity: 2, modifiers: ["Sin cebolla"], notes: "Bien cocida" }],
};

export default async function FoodDeliveryPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  const orgId = session.user.organizationId;
  await requireModule(orgId, "FOOD_OPS");

  const today = startOfLocalDay(new Date(), await getOrgTimezone(orgId));
  const [, lang, channels, active, todays, org] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.deliveryChannel.findMany({ where: { organizationId: orgId } }),
    prisma.deliveryOrder.findMany({
      where: { organizationId: orgId, status: { notIn: FINISHED_STATUSES } },
      orderBy: { placedAt: "asc" },
      take: 200,
    }),
    prisma.deliveryOrder.findMany({
      where: { organizationId: orgId, placedAt: { gte: today } },
      orderBy: { placedAt: "desc" },
      take: 500,
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } }),
  ]);
  const t = pickDict(deliveryStrings, lang);
  const canManage = can(session.user.role, "food:manage");
  const now = new Date();
  const timeFmt = new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", { hour: "2-digit", minute: "2-digit", timeZone: org.timezone });

  const countable = todays.filter((o) => o.status !== "CANCELLED");
  const late = active.filter((o) => isDeliveryLate(o, now));
  const finished = todays.filter((o) => FINISHED_STATUSES.includes(o.status));
  const byPlatform = (p: DeliveryPlatform) => countable.filter((o) => o.platform === p);
  const hasTests = todays.some((o) => o.isTest) || active.some((o) => o.isTest);

  return (
    <div className="space-y-4">
      <AutoRefresh intervalMs={15_000} />
      <PageHeader title={t.title} description={t.desc} />
      {!canManage && <p className="text-sm text-slate-500">{t.manageOnly}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Bike} label={t.kpiOrders} value={String(countable.length)} />
        <Kpi icon={Receipt} label={t.kpiSales} value={formatMoney(countable.reduce((n, o) => n + Number(o.totalAmount), 0))} />
        <Kpi icon={Clock} label={t.kpiActive} value={String(active.length)} />
        <Kpi icon={AlertTriangle} label={t.kpiLate(DELIVERY_LATE_MINUTES)} value={String(late.length)} danger={late.length > 0} />
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const orders = active.filter((o) => col.statuses.includes(o.status));
          return (
            <div key={col.key} className="rounded-xl bg-slate-50 p-2">
              <p className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-slate-700">
                {t[col.key]}
                <span className="rounded-full bg-white px-2 text-xs text-slate-500">{orders.length}</span>
              </p>
              <div className="space-y-2">
                {orders.length === 0 && <p className="px-1 py-6 text-center text-xs text-slate-400">{t.empty}</p>}
                {orders.map((o) => (
                  <OrderCard key={o.id} order={o} now={now} t={t} timeFmt={timeFmt} canManage={canManage} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {DELIVERY_PLATFORMS.map((p) => {
          const ch = channels.find((c) => c.platform === p);
          const orders = byPlatform(p);
          return (
            <Card key={p}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className={cn("h-2.5 w-2.5 rounded-full", PLATFORM[p].dot)} />
                  {PLATFORM[p].name}
                </CardTitle>
                <Badge variant={ch?.enabled ? "default" : "secondary"}>{ch?.enabled ? t.connected : t.notConnected}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  {t.ordersToday(orders.length)} · {formatMoney(orders.reduce((n, o) => n + Number(o.totalAmount), 0))}
                </p>
                {canManage && <DeliveryChannelControls platform={p} enabled={!!ch?.enabled} storeId={ch?.storeId ?? null} />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {finished.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.finishedToday}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100 text-sm">
              {finished.slice(0, 30).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate">
                    <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", PLATFORM[o.platform].dot)} />
                    <b>#{o.displayId}</b> · {PLATFORM[o.platform].name} · {timeFmt.format(o.placedAt)}
                    {o.customerName && ` · ${o.customerName}`}
                  </span>
                  <span className={cn("shrink-0 text-xs font-semibold", o.status === "CANCELLED" ? "text-red-600" : "text-emerald-700")}>
                    {o.status === "CANCELLED" ? t.statusCancelled : t.statusDelivered} · {formatMoney(Number(o.totalAmount))}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">{t.howTitle}</CardTitle>
          {canManage && hasTests && <DeliveryClearTests />}
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>{t.howIntro}</p>
          {/* Lo técnico (endpoint, firma, formato) es para quien integra; el dueño lo abre solo si lo necesita. */}
          <details className="group rounded-lg border border-slate-200 px-3 py-2">
            <summary className="cursor-pointer select-none font-medium text-slate-900">{t.techSummary}</summary>
            <div className="mt-3 space-y-3">
              <div>
                <p className="font-medium text-slate-900">{t.endpoint}</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs">POST {appUrl("/api/webhooks/delivery/orders")}</code>
                  <CopyButton text={appUrl("/api/webhooks/delivery/orders")} />
                </div>
              </div>
              <div>
                <p className="font-medium text-slate-900">{t.headers}</p>
                <p>{t.headersDesc}</p>
              </div>
              <div>
                <p className="font-medium text-slate-900">{t.example}</p>
                <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(EXAMPLE, null, 2)}</pre>
                <p className="mt-1 text-xs">platform: UBER_EATS · RAPPI · DIDI_FOOD — status: NEW · ACCEPTED · PREPARING · READY · PICKED_UP · DELIVERED · CANCELLED</p>
              </div>
            </div>
          </details>
          <p className="text-xs text-slate-500">{t.note}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, danger }: { icon: React.ElementType; label: string; value: string; danger?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Icon className="h-4 w-4" />
          {label}
        </p>
        <p className={cn("mt-1 text-2xl font-bold", danger ? "text-red-600" : "text-slate-900")}>{value}</p>
      </CardContent>
    </Card>
  );
}

function OrderCard({
  order,
  now,
  t,
  timeFmt,
  canManage,
}: {
  order: DeliveryOrder;
  now: Date;
  t: ReturnType<typeof pickDict<typeof deliveryStrings>>;
  timeFmt: Intl.DateTimeFormat;
  canManage: boolean;
}) {
  const items = (Array.isArray(order.items) ? order.items : []) as unknown as DeliveryItem[];
  const minutes = Math.max(0, Math.floor((now.getTime() - order.placedAt.getTime()) / 60_000));
  const late = isDeliveryLate(order, now);
  return (
    <div className={cn("rounded-lg border bg-white p-3 shadow-sm", late ? "border-red-300" : "border-slate-200")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={cn("inline-block rounded border px-1.5 text-[11px] font-semibold", PLATFORM[order.platform].cls)}>{PLATFORM[order.platform].name}</span>
          {order.isTest && <span className="ml-1 rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">{t.test}</span>}
          <p className="mt-1 font-bold text-slate-900">#{order.displayId}</p>
          {order.customerName && <p className="truncate text-xs text-slate-500">{order.customerName}</p>}
        </div>
        <div className="text-right">
          <p className={cn("text-sm font-semibold tabular-nums", late ? "text-red-600" : "text-slate-700")}>{t.minutesAgo(minutes)}</p>
          <p className="text-[11px] text-slate-400">{timeFmt.format(order.placedAt)}</p>
          {late && <p className="text-[11px] font-semibold text-red-600">{t.late}</p>}
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-sm">
        {items.map((i, idx) => (
          <li key={idx}>
            <span className="font-semibold">{i.quantity}×</span> {i.name}
            {i.modifiers?.length ? <span className="block pl-5 text-xs text-slate-500">{i.modifiers.join(" · ")}</span> : null}
            {i.notes && <span className="block pl-5 text-xs font-medium text-orange-700">{i.notes}</span>}
          </li>
        ))}
      </ul>
      {order.notes && <p className="mt-1 rounded bg-orange-50 px-1.5 text-xs text-orange-800">{order.notes}</p>}
      <p className="mt-2 text-right text-sm font-semibold tabular-nums text-slate-900">{formatMoney(Number(order.totalAmount))}</p>
      {canManage && (
        <div className="mt-2">
          <DeliveryOrderActions orderId={order.id} status={order.status} next={nextDeliveryStatus(order.status)} />
        </div>
      )}
    </div>
  );
}
