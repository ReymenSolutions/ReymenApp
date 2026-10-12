"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { money, num } from "@/lib/loyalty/format";
import { metricLabel, ZoneLabelBadge } from "./ZoneMap";
import type { ZoneStats } from "@/lib/loyalty/metrics";

// Una serie = un color (marca). Dos series = marca + naranja-600 (paleta
// validada: ΔE CVD 34.7, contraste ≥ 3:1), siempre con leyenda.
const SERIES_1 = "#1a3ef5";
const SERIES_2 = "#ea580c";
const AXIS = { fontSize: 11, fill: "#94a3b8" };
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" };

function dayTick(day: string, locale: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-48 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">{text}</div>;
}

/** Serie diaria única (altas, visitas o ventas): área con línea de 2px. */
export function TrendChart({
  data,
  dataKey,
  name,
  format = "number",
  height = 220,
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  name: string;
  format?: "number" | "money";
  height?: number;
}) {
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const reduced = useReducedMotion();
  if (!data.some((d) => Number(d[dataKey]) > 0)) return <Empty text={L.noDataPeriod} />;
  const fmt = (v: number) => (format === "money" ? money(v) : num(v));
  const gid = `grad-${dataKey}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_1} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SERIES_1} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(d: string) => dayTick(d, L.dateLocale)} minTickGap={24} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={format === "money" ? 64 : 36} allowDecimals={false} tickFormatter={(v: number) => (format === "money" ? money(v) : num(v))} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d: string) => dayTick(d, L.dateLocale)}
          formatter={(v: number) => [fmt(v), name]}
          cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
        />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={SERIES_1} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={!reduced} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Ranking por CP (una sola serie → un solo color en todas las barras). */
export function ZoneBarChart({ zones, metric, limit = 8 }: { zones: ZoneStats[]; metric: "members" | "sales"; limit?: number }) {
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const reduced = useReducedMotion();
  const rows = [...zones]
    .sort((a, b) => (metric === "members" ? b.members - a.members : b.sales - a.sales))
    .slice(0, limit)
    .map((z) => ({ cp: z.postalCode, value: metric === "members" ? z.members : z.sales, share: metric === "members" ? z.memberShare : z.salesShare }));
  if (!rows.some((r) => r.value > 0)) return <Empty text={L.noDataPeriod} />;
  const fmt = (v: number) => (metric === "sales" ? money(v) : num(v));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34 + 20)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="cp" tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "#f8fafc" }}
          formatter={(v: number, _n, item) => [`${fmt(v)} · ${(item?.payload as { share: number }).share}%`, metricLabel(metric, L)]}
          labelFormatter={(cp: string) => L.zoneDetail(cp)}
        />
        <Bar
          dataKey="value"
          fill={SERIES_1}
          radius={[0, 4, 4, 0]}
          isAnimationActive={!reduced}
          label={{ position: "right", fontSize: 11, fill: "#475569", formatter: (v: number) => fmt(v) }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Recompensas obtenidas vs. canjeadas por día: dos series, leyenda siempre visible. */
export function RewardsChart({ data }: { data: { day: string; rewardsEarned: number; rewardsRedeemed: number }[] }) {
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const reduced = useReducedMotion();
  if (!data.some((d) => d.rewardsEarned > 0 || d.rewardsRedeemed > 0)) return <Empty text={L.noDataPeriod} />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(d: string) => dayTick(d, L.dateLocale)} minTickGap={24} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#f8fafc" }} labelFormatter={(d: string) => dayTick(d, L.dateLocale)} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="rewardsEarned" name={L.seriesEarned} fill={SERIES_1} radius={[4, 4, 0, 0]} isAnimationActive={!reduced} />
        <Bar dataKey="rewardsRedeemed" name={L.seriesRedeemed} fill={SERIES_2} radius={[4, 4, 0, 0]} isAnimationActive={!reduced} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Tabla accesible de todas las zonas (la vista de tabla del mapa). */
export function ZonesTable({ zones }: { zones: ZoneStats[] }) {
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-3 font-medium">{L.colZone}</th>
            <th className="py-2 pr-3 text-right font-medium">{L.detailMembers}</th>
            <th className="py-2 pr-3 text-right font-medium">{L.detailMemberShare}</th>
            <th className="py-2 pr-3 text-right font-medium">{L.detailSales}</th>
            <th className="py-2 pr-3 text-right font-medium">{L.detailSalesShare}</th>
            <th className="py-2 pr-3 text-right font-medium">{L.detailTicket}</th>
            <th className="py-2 pr-3 text-right font-medium">{L.detailFrequency}</th>
            <th className="py-2 pr-3 text-right font-medium">{L.detailDistance}</th>
            <th className="py-2 font-medium">{L.colLabels}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {zones.map((z) => (
            <tr key={z.postalCode}>
              <td className="py-2 pr-3 font-semibold text-slate-900">
                <a href={`/portal/food/loyalty/members?cp=${z.postalCode}`} className="hover:text-brand-600 hover:underline">{z.postalCode}</a>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{num(z.members)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{z.memberShare}%</td>
              <td className="py-2 pr-3 text-right tabular-nums">{money(z.sales)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{z.salesShare}%</td>
              <td className="py-2 pr-3 text-right tabular-nums">{money(z.avgTicket)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{num(z.frequency, 2)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{z.distanceKm === null ? "—" : L.km(num(z.distanceKm, 1))}</td>
              <td className="py-2">
                <div className="flex flex-wrap gap-1">
                  {z.labels.map((l) => (
                    <ZoneLabelBadge key={l} label={l} L={L} />
                  ))}
                  {z.labels.length === 0 && <span className="text-xs text-slate-300">—</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
