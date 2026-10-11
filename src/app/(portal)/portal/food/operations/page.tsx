import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle, Bike, ChefHat, Clock, Flame, MonitorSmartphone, Printer, Receipt, Store, Users, Workflow, Ban, Package, Timer, Wallet,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict, type DictOf } from "@/lib/i18n-dict";
import { getOperationsData } from "@/lib/food-operations";
import { listBranches, parseBranchParam } from "@/lib/branches";
import { getKitchenTimes, getRecentShiftCloses } from "@/lib/pos-events";
import { BranchFilter } from "@/components/portal/BranchFilter";
import type { DeviceRow, PosStation } from "@/lib/pos-operations-summary";
import { cn, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { AutoRefresh } from "@/components/shared/AutoRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Centro de operaciones en tiempo real: lo que pasa ahora en el restaurante
// (mesas, cocina, cajas, agotados, impresión) leído en vivo del servidor de
// Reymen POS, junto con lo que Reymen ya tiene (ventas registradas,
// inventario, automatizaciones). Se arma en el servidor y se refresca solo.

export const dynamic = "force-dynamic";

const REFRESH_MS = 15_000;

type F = DictOf<typeof foodStrings>;

const pesos = (cents: number) => formatMoney(cents / 100);

function ago(ms: number, f: F): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return f.opJustNow;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

function stationLabel(s: PosStation, f: F) {
  return s === "bar" ? f.opStationBar : s === "desserts" ? f.opStationDesserts : f.opStationKitchen;
}

function Kpi({ icon: Icon, label, value, hint, tone = "brand" }: { icon: React.ElementType; label: string; value: string; hint?: string; tone?: "brand" | "orange" | "red" | "green" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              tone === "brand" && "bg-brand-50 text-brand-600",
              tone === "orange" && "bg-orange-50 text-orange-500",
              tone === "red" && "bg-red-50 text-red-600",
              tone === "green" && "bg-emerald-50 text-emerald-600"
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        </div>
        <p className={cn("mt-2 text-2xl font-bold", tone === "red" ? "text-red-600" : "text-slate-900")}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const STATION_NAME: Record<string, { es: string; en: string }> = {
  kitchen: { es: "Cocina", en: "Kitchen" },
  bar: { es: "Barra", en: "Bar" },
  desserts: { es: "Postres", en: "Desserts" },
};

function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")} min` : `${s} s`;
}

function Section({ icon: Icon, title, right, children, className }: { icon: React.ElementType; title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-slate-500" />
          {title}
        </CardTitle>
        {right}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Notice({ tone, children }: { tone: "warning" | "info"; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-brand-200 bg-brand-50 text-brand-900")}>
      {children}
    </div>
  );
}

function DeviceCard({ d, now, f, timeFmt }: { d: DeviceRow; now: number; f: F; timeFmt: Intl.DateTimeFormat }) {
  const s = d.status;
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">
            {d.name} <span className="font-mono text-xs text-slate-500">{d.code}</span>
          </p>
          <p className="text-xs text-slate-500">{s?.employeeName ? f.opUser(s.employeeName) : f.opNoUser}</p>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", d.online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
          <span className={cn("h-2 w-2 rounded-full", d.online ? "bg-emerald-500" : "bg-slate-400")} />
          {d.online ? f.opOnline : `${f.opOffline} · ${f.opLastSeen(ago(now - Date.parse(d.lastSeenAt), f))}`}
        </span>
      </div>
      {s?.kitchenMode && <Badge className="mt-2" variant="secondary">{f.opKitchenScreen}</Badge>}
      {s?.cash ? (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-xs text-slate-500">{f.opShiftOpen(s.cash.number, s.cash.openedByName, timeFmt.format(new Date(s.cash.openedAt)))}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-slate-500">{f.opExpectedCash}</span>
            <span className="text-right font-semibold tabular-nums text-slate-900">{pesos(s.cash.expectedCashCents)}</span>
            <span className="text-slate-500">{f.opCard}</span>
            <span className="text-right tabular-nums">{pesos(s.cash.cardCents)}</span>
            <span className="text-slate-500">{f.opTransfer}</span>
            <span className="text-right tabular-nums">{pesos(s.cash.transferCents)}</span>
            <span className="text-slate-500">{f.opTips}</span>
            <span className="text-right tabular-nums">{pesos(s.cash.tipsCents)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">{s ? f.opShiftClosed : "—"}</p>
      )}
      {s && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs">
          <p className="flex justify-between text-slate-600">
            <span>{f.opSalesToday}</span>
            <span className="tabular-nums">
              {s.today.salesCount} · {pesos(s.today.salesCents)}
            </span>
          </p>
          <p className={cn(s.outbox.failed ? "font-semibold text-red-600" : s.outbox.pending ? "text-amber-700" : "text-emerald-700")}>
            {s.outbox.failed ? f.opRejected(s.outbox.failed) : s.outbox.pending ? f.opPending(s.outbox.pending) : f.opAllSent}
            {s.outbox.failed > 0 && s.outbox.lastError && <span className="block font-normal text-red-500">{s.outbox.lastError}</span>}
          </p>
          <p className="flex items-center gap-1 text-slate-500">
            <Printer className="h-3 w-3" />
            {s.lastPrintAt ? f.opLastPrint(ago(now - Date.parse(s.lastPrintAt), f)) : f.opNeverPrinted}
          </p>
        </div>
      )}
    </div>
  );
}

export default async function FoodOperationsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  const orgId = session.user.organizationId;
  await requireModule(orgId, "FOOD_OPS");

  const { branch: branchParam } = await searchParams;
  const branches = await listBranches(orgId, { activeOnly: true });
  const branch = parseBranchParam(branchParam, branches);

  const [t, lang, data, org, kitchenTimes, shiftCloses] = await Promise.all([
    getServerT(),
    getServerLang(),
    getOperationsData(orgId, branch),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } }),
    getKitchenTimes(orgId, 24, branch),
    getRecentShiftCloses(orgId, 5, branch),
  ]);
  const f = pickDict(foodStrings, lang);
  const timeFmt = new Intl.DateTimeFormat(f.dateLocale, { hour: "2-digit", minute: "2-digit", timeZone: org.timezone });
  const clockFmt = new Intl.DateTimeFormat(f.dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: org.timezone });
  const pos = data.pos;
  const ops = pos.kind === "ok" ? pos.summary : null;
  const now = data.now;

  return (
    <div className="space-y-4">
      <AutoRefresh intervalMs={REFRESH_MS} />
      <PageHeader title={t.foodOperations} description={f.operationsDesc} />
      <BranchFilter branches={branches} current={branch} es={lang === "es"} basePath="/portal/food/operations" />
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          {f.opLive}
        </span>
        {f.opUpdated(clockFmt.format(new Date(now)))}
      </div>

      {pos.kind === "disabled" && <Notice tone="info">{f.opNoPosModule}</Notice>}
      {pos.kind === "unauthorized" && <Notice tone="warning">{f.opPosUnauthorized}</Notice>}
      {pos.kind === "unreachable" && <Notice tone="warning">{f.opPosUnreachable}</Notice>}

      {/* ── KPIs ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          icon={Receipt}
          label={ops ? f.opPosSalesToday : f.salesToday}
          value={ops ? pesos(ops.posToday.salesCents) : formatMoney(data.reymenToday.gross)}
          hint={ops ? f.opPosSalesHint(ops.posToday.salesCount, ops.posToday.cancelledCount) : f.opReymenSalesHint(data.reymenToday.count)}
          tone="orange"
        />
        <Kpi
          icon={Store}
          label={f.opTablesBusy}
          value={ops ? (ops.tables.total ? `${ops.tables.occupied} / ${ops.tables.total}` : String(ops.tables.occupied)) : "—"}
          hint={ops ? (ops.tables.total ? f.opGuests(ops.guests) : f.opNoTables) : undefined}
        />
        <Kpi
          icon={Users}
          label={f.opOpenChecks}
          value={ops ? String(ops.openOrders.length) : "—"}
          hint={ops ? f.opToCollect(pesos(ops.openTotalCents)) : undefined}
        />
        <Kpi
          icon={Flame}
          label={f.opLateOrders}
          value={ops ? String(ops.kitchen.late.length) : "—"}
          hint={ops ? f.opLateAfter(ops.kitchen.lateMinutes) : undefined}
          tone={ops && ops.kitchen.late.length > 0 ? "red" : "green"}
        />
        <Link href="/portal/food/delivery" className="block">
          <Kpi
            icon={Bike}
            label={f.opDelivery}
            value={String(data.delivery.active)}
            hint={f.opDeliveryHint(data.delivery.late)}
            tone={data.delivery.late > 0 ? "red" : "brand"}
          />
        </Link>
      </div>

      {ops && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Section
            icon={AlertTriangle}
            title={f.opLateOrders}
            className={cn(ops.kitchen.late.length > 0 && "border-red-300")}
            right={<span className="text-xs text-slate-500">{f.opLateAfter(ops.kitchen.lateMinutes)}</span>}
          >
            {ops.kitchen.late.length === 0 ? (
              <p className="text-sm text-slate-500">{f.opLateEmpty}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {ops.kitchen.late.slice(0, 12).map((l, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">
                        {l.quantity} × {l.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {l.tableName} · #{l.orderNumber} · {stationLabel(l.station, f)}
                        {l.priority && ` · ${f.opUrgent}`}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-red-600">{f.opMinutes(l.minutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={ChefHat} title={f.opInKitchen} className="lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-4">
              {(["kitchen", "bar", "desserts"] as const).map((s) => (
                <div key={s} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{stationLabel(s, f)}</p>
                  <p className="text-xl font-bold tabular-nums text-slate-900">{ops.kitchen.byStation[s]}</p>
                </div>
              ))}
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3 w-3" />
                  {f.opAvgPrep}
                </p>
                <p className="text-xl font-bold tabular-nums text-slate-900">
                  {ops.kitchen.avgPrepMinutes === null ? f.opNoData : f.opMinutes(ops.kitchen.avgPrepMinutes)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {f.opKitchenBreakdown(ops.kitchen.newCount, ops.kitchen.preparingCount, ops.kitchen.readyCount)}
            </p>
          </Section>
        </div>
      )}

      {ops && (
        <Section icon={Users} title={f.opOpenChecks} right={<span className="text-sm font-semibold text-slate-700">{f.opToCollect(pesos(ops.openTotalCents))}</span>}>
          {ops.openOrders.length === 0 ? (
            <p className="text-sm text-slate-500">{f.opOpenEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">{f.opTable}</th>
                    <th className="py-2 pr-3 font-medium">{f.opWaiter}</th>
                    <th className="py-2 pr-3 font-medium">{f.opTime}</th>
                    <th className="py-2 pr-3 font-medium">{f.opKitchenCol}</th>
                    <th className="py-2 text-right font-medium">{f.opTotal}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ops.openOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 pr-3">
                        <span className="font-semibold text-slate-900">{o.tableName}</span>
                        <span className="ml-1 text-xs text-slate-500">
                          #{o.number} · {f.opGuests(o.guests)}
                        </span>
                        {o.priority && <Badge className="ml-2" variant="destructive">{f.opUrgent}</Badge>}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{o.waiterName}</td>
                      <td className="py-2 pr-3 tabular-nums text-slate-600">{f.opMinutes(o.minutesOpen)}</td>
                      <td className="py-2 pr-3">
                        <span className="flex flex-wrap gap-1 text-xs">
                          {o.late && <span className="rounded bg-red-100 px-1.5 font-semibold text-red-700">{f.opLateTag}</span>}
                          {o.ready > 0 && <span className="rounded bg-emerald-100 px-1.5 text-emerald-800">{f.opReady(o.ready)}</span>}
                          {o.cooking > 0 && <span className="rounded bg-amber-100 px-1.5 text-amber-800">{f.opCooking(o.cooking)}</span>}
                          {o.held > 0 && <span className="rounded bg-slate-100 px-1.5 text-slate-600">{f.opHeld(o.held)}</span>}
                        </span>
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums text-slate-900">{pesos(o.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {ops && (
        <Section icon={MonitorSmartphone} title={f.opCashTitle}>
          {ops.devices.length === 0 ? (
            <p className="text-sm text-slate-500">{f.opCashEmpty}</p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ops.devices.map((d) => (
                  <DeviceCard key={d.deviceId} d={d} now={now} f={f} timeFmt={timeFmt} />
                ))}
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
                <Printer className="mt-0.5 h-3 w-3 shrink-0" />
                {f.opPrintNote}
              </p>
            </>
          )}
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {ops && (
          <Section icon={Ban} title={f.opSoldOutTitle}>
            {ops.soldOut.length === 0 ? (
              <p className="text-sm text-slate-500">{f.opSoldOutEmpty}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {ops.soldOut.map((s) => (
                  <li key={s.dishId} className="flex justify-between gap-2">
                    <span className="font-medium text-slate-900">{s.name}</span>
                    <span className="text-xs text-slate-500">{s.devices.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section icon={Package} title={f.opLowStockTitle}>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-slate-500">{f.opLowStockEmpty}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.lowStock.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <Link href="/portal/food/inventory" className="font-medium text-slate-900 hover:underline">
                    {i.name}
                  </Link>
                  <span className={cn("tabular-nums", i.currentStock <= 0 ? "font-semibold text-red-600" : "text-amber-700")}>
                    {i.currentStock} / {i.minStock} {i.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={Workflow} title={f.opAutomationsTitle}>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              [f.opActive, data.automations.active, "text-emerald-700"],
              [f.opPaused, data.automations.paused, "text-slate-700"],
              [f.opErrored, data.automations.error, data.automations.error ? "text-red-600" : "text-slate-700"],
              [f.opFailed24h, data.automations.failed24h, data.automations.failed24h ? "text-red-600" : "text-slate-700"],
            ].map(([label, n, cls]) => (
              <div key={label as string} className="rounded-lg bg-slate-50 p-2">
                <p className={cn("text-lg font-bold tabular-nums", cls as string)}>{n as number}</p>
                <p className="text-[11px] leading-tight text-slate-500">{label as string}</p>
              </div>
            ))}
          </div>
          {data.posRejected24h > 0 && <p className="mt-3 text-sm font-semibold text-red-600">{f.opPosRejected(data.posRejected24h)}</p>}
          {data.automations.recentFailures.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{f.opNoFailures}</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {data.automations.recentFailures.map((e) => (
                <li key={e.id}>
                  <Link href="/portal/automations" className="font-medium text-slate-900 hover:underline">
                    {e.automation}
                  </Link>
                  <span className="ml-1 text-xs text-slate-500">{timeFmt.format(e.at)}</span>
                  {e.message && <span className="block truncate text-xs text-red-600">{e.message}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {(kitchenTimes.length > 0 || shiftCloses.length > 0) && (
          <>
            <Section icon={Timer} title={lang === "es" ? "Tiempos de preparación (24 h)" : "Preparation times (24 h)"}>
              {kitchenTimes.length === 0 ? (
                <p className="text-sm text-slate-500">{lang === "es" ? "Aún no hay productos marcados como listos." : "No items marked ready yet."}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {kitchenTimes.map((k) => (
                    <li key={k.station} className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-900">{STATION_NAME[k.station]?.[lang === "es" ? "es" : "en"] ?? k.station}</span>
                      <span className="text-right text-slate-600">
                        <span className="font-semibold tabular-nums text-slate-900">{formatMinutes(k.avgSeconds)}</span> {lang === "es" ? "promedio" : "avg"} · {lang === "es" ? "máx." : "max"} {formatMinutes(k.maxSeconds)} · {k.items} {lang === "es" ? "productos" : "items"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section icon={Wallet} title={lang === "es" ? "Cierres de turno" : "Shift closes"}>
              {shiftCloses.length === 0 ? (
                <p className="text-sm text-slate-500">{lang === "es" ? "Aún no hay cortes de caja reportados." : "No cash cuts reported yet."}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {shiftCloses.map((s) => {
                    const diff = Number(s.difference);
                    return (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3">
                        <span className="text-slate-700">
                          <span className="font-medium text-slate-900">{lang === "es" ? "Turno" : "Shift"} {s.shiftNumber}{s.deviceCode ? ` · ${s.deviceCode}` : ""}</span>
                          <span className="ml-1 text-xs text-slate-500">{timeFmt.format(s.closedAt)} · {s.closedByName}</span>
                        </span>
                        <span className="text-right">
                          <span className="tabular-nums text-slate-900">{formatMoney(Number(s.salesTotal))}</span>
                          <span className={cn("ml-2 text-xs font-semibold tabular-nums", diff === 0 ? "text-emerald-700" : "text-red-600")}>
                            {diff === 0 ? (lang === "es" ? "cuadra" : "balanced") : `${diff > 0 ? "+" : "−"}${formatMoney(Math.abs(diff))}`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
