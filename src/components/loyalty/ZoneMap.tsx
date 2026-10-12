"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MapPin, Target, CheckCircle2, Gem, Repeat, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings, type LoyaltyDict } from "@/lib/i18n-loyalty";
import { MAP_METRICS, zoneMetricValue, type MapMetric, type ZoneLabel, type ZoneStats } from "@/lib/loyalty/metrics";
import { zonePosition } from "@/lib/loyalty/postal-zones";
import { money, num, pct } from "@/lib/loyalty/format";

// Rampa secuencial de un solo tono (marca), clara → oscura = menos → más.
const RAMP = ["#bbd0ff", "#8ab0ff", "#5585ff", "#1a3ef5", "#18258e"];
const STRONG = "#059669"; // emerald-600 — siempre con ícono y texto, nunca solo color
const OPPORTUNITY = "#d97706"; // amber-600 — anillo punteado + ícono + texto

const W = 640;
const H = 460;
const CX = W / 2;
const CY = H / 2;
const R_MIN = 9;
const R_MAX = 44;

export function formatMetric(metric: MapMetric, value: number): string {
  switch (metric) {
    case "members":
      return num(value);
    case "sales":
    case "ticket":
      return money(value);
    case "share":
      return pct(value);
    case "frequency":
      return num(value, 2);
  }
}

export function metricLabel(metric: MapMetric, L: LoyaltyDict): string {
  return { members: L.metricMembers, sales: L.metricSales, share: L.metricShare, ticket: L.metricTicket, frequency: L.metricFrequency }[metric];
}

function metricHint(metric: MapMetric, L: LoyaltyDict): string {
  return { members: L.metricMembersHint, sales: L.metricSalesHint, share: L.metricShareHint, ticket: L.metricTicketHint, frequency: L.metricFrequencyHint }[metric];
}

export function zoneLabelText(label: ZoneLabel, L: LoyaltyDict): string {
  return { strong: L.zoneStrong, opportunity: L.zoneOpportunity, high_value: L.zoneHighValue, low_frequency: L.zoneLowFrequency }[label];
}

export function ZoneLabelBadge({ label, L }: { label: ZoneLabel; L: LoyaltyDict }) {
  const Icon = { strong: CheckCircle2, opportunity: Target, high_value: Gem, low_frequency: Repeat }[label];
  const cls = {
    strong: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    opportunity: "bg-amber-50 text-amber-700 ring-amber-200",
    high_value: "bg-brand-50 text-brand-700 ring-brand-200",
    low_frequency: "bg-slate-100 text-slate-600 ring-slate-200",
  }[label];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", cls)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {zoneLabelText(label, L)}
    </span>
  );
}

interface Placed {
  zone: ZoneStats;
  x: number;
  y: number;
  r: number;
  fill: string;
  dark: boolean;
}

export function ZoneMap({
  zones,
  referenceLabel,
  compact = false,
  initialMetric = "members",
}: {
  zones: ZoneStats[];
  referenceLabel: string | null;
  compact?: boolean;
  initialMetric?: MapMetric;
}) {
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const [metric, setMetric] = useState<MapMetric>(initialMetric);
  const [hover, setHover] = useState<string | null>(null);
  // En el mapa completo se abre con la zona de más ventas seleccionada, para que el panel no empiece vacío.
  const [selected, setSelected] = useState<string | null>(compact ? null : (zones[0]?.postalCode ?? null));

  const { placed, unplaced, radiusOf, rings } = useMemo(() => {
    const withPos = zones.map((z) => ({ z, pos: zonePosition(z.postalCode) }));
    const onMap = withPos.filter((w) => w.pos !== null) as { z: ZoneStats; pos: { eastKm: number; northKm: number } }[];
    const maxKm = Math.max(3, ...onMap.map((w) => Math.hypot(w.pos.eastKm, w.pos.northKm))) * 1.08;
    const outer = Math.min(W, H) / 2 - 18;
    // Escala radial de raíz cuadrada: las zonas cercanas (donde está casi todo)
    // tienen espacio y una zona lejana no aplasta el mapa. El orden y las
    // distancias de los anillos siguen siendo reales.
    const radiusOf = (km: number) => Math.sqrt(Math.max(0, km) / maxKm) * outer;
    const values = onMap.map((w) => zoneMetricValue(w.z, metric));
    const max = Math.max(0, ...values);
    const placed: Placed[] = onMap
      .map((w, i) => {
        const v = values[i];
        const t = max > 0 ? v / max : 0;
        const step = Math.min(RAMP.length - 1, Math.floor(t * RAMP.length));
        const km = Math.hypot(w.pos.eastKm, w.pos.northKm);
        const k = km > 0 ? radiusOf(km) / km : 0;
        return {
          zone: w.z,
          x: CX + w.pos.eastKm * k,
          y: CY - w.pos.northKm * k,
          r: R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.max(0, t)),
          fill: RAMP[step],
          dark: step >= 3,
        };
      })
      // Las grandes primero: las chicas quedan encima y se pueden tocar.
      .sort((a, b) => b.r - a.r);
    const rings = [1, 2, 3, 5, 8, 12].filter((km) => km <= maxKm);
    return { placed, unplaced: withPos.filter((w) => w.pos === null).length, radiusOf, rings };
  }, [zones, metric]);

  const active = selected ? zones.find((z) => z.postalCode === selected) ?? null : null;
  const hovered = hover ? placed.find((p) => p.zone.postalCode === hover) ?? null : null;

  if (zones.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 px-6 text-center text-sm text-slate-500">
        <MapPin className="h-6 w-6 text-slate-300" aria-hidden="true" />
        {L.mapEmpty}
      </div>
    );
  }

  return (
    <div>
      {/* Selector de métrica (capas) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label={L.mapTitle}>
          {MAP_METRICS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                metric === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              {metricLabel(m, L)}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{metricHint(metric, L)}</p>
      </div>

      <div className={cn("grid gap-4", !compact && "lg:grid-cols-[minmax(0,1fr)_300px]")}>
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={L.mapTitle}>
            <defs>
              <pattern id="loyalty-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e2e8f0" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#loyalty-grid)" />
            {rings.map((km) => (
              <g key={km}>
                <circle cx={CX} cy={CY} r={radiusOf(km)} fill="none" stroke="#cbd5e1" strokeDasharray="4 5" strokeWidth="1" />
                <text x={CX + 4} y={CY + radiusOf(km) - 4} fontSize="10" fill="#94a3b8">
                  {km} km
                </text>
              </g>
            ))}

            {placed.map((p) => {
              const z = p.zone;
              const isStrong = z.labels.includes("strong");
              const isOpp = z.labels.includes("opportunity");
              const isActive = selected === z.postalCode;
              const value = zoneMetricValue(z, metric);
              const label = `${L.zoneDetail(z.postalCode)}: ${metricLabel(metric, L)} ${formatMetric(metric, value)}${isStrong ? ` · ${L.zoneStrong}` : ""}${isOpp ? ` · ${L.zoneOpportunity}` : ""}`;
              return (
                <g
                  key={z.postalCode}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={isActive}
                  className="cursor-pointer outline-none focus-visible:[&>circle:first-child]:stroke-brand-600"
                  onMouseEnter={() => setHover(z.postalCode)}
                  onMouseLeave={() => setHover((h) => (h === z.postalCode ? null : h))}
                  onFocus={() => setHover(z.postalCode)}
                  onBlur={() => setHover(null)}
                  onClick={() => setSelected(isActive ? null : z.postalCode)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(isActive ? null : z.postalCode);
                    }
                  }}
                >
                  {/* Área de toque mayor que la marca */}
                  <circle cx={p.x} cy={p.y} r={Math.max(p.r + 6, 18)} fill="transparent" stroke="transparent" strokeWidth="3" />
                  {isStrong && <circle cx={p.x} cy={p.y} r={p.r + 5} fill="none" stroke={STRONG} strokeWidth="2.5" />}
                  {isOpp && <circle cx={p.x} cy={p.y} r={p.r + 5} fill="none" stroke={OPPORTUNITY} strokeWidth="2.5" strokeDasharray="5 4" />}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={p.r}
                    fill={p.fill}
                    fillOpacity={0.9}
                    stroke={isActive ? "#0f172a" : "#ffffff"}
                    strokeWidth={isActive ? 3 : 2}
                  />
                  <text
                    x={p.x}
                    y={p.r >= 20 ? p.y + 4 : p.y + p.r + 18}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill={p.r >= 20 ? (p.dark ? "#ffffff" : "#0f172a") : "#334155"}
                    pointerEvents="none"
                  >
                    {z.postalCode}
                  </text>
                </g>
              );
            })}

            {/* Sucursal: referencia, encima de todo */}
            <g pointerEvents="none">
              <circle cx={CX} cy={CY} r="11" fill="#f97316" stroke="#ffffff" strokeWidth="3" />
              <circle cx={CX} cy={CY} r="3.5" fill="#ffffff" />
              <rect x={CX - 60} y={CY + 16} width="120" height="20" rx="10" fill="#ffffff" stroke="#fed7aa" />
              <text x={CX} y={CY + 30} textAnchor="middle" fontSize="11" fontWeight="600" fill="#9a3412">
                {(referenceLabel ?? L.mapBranch).slice(0, 22)}
              </text>
            </g>
          </svg>

          {hovered && (
            <div
              className="pointer-events-none absolute z-10 w-52 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg"
              style={{
                left: `${Math.min(Math.max((hovered.x / W) * 100, 18), 68)}%`,
                top: `${Math.min(((hovered.y + hovered.r + 10) / H) * 100, 70)}%`,
              }}
            >
              <p className="font-semibold text-slate-900">{L.zoneDetail(hovered.zone.postalCode)}</p>
              <p className="mt-1 flex justify-between text-slate-600">
                <span>{metricLabel(metric, L)}</span>
                <span className="font-semibold tabular-nums text-slate-900">{formatMetric(metric, zoneMetricValue(hovered.zone, metric))}</span>
              </p>
              <p className="flex justify-between text-slate-500">
                <span>{L.detailMembers}</span>
                <span className="tabular-nums">{num(hovered.zone.members)}</span>
              </p>
              <p className="flex justify-between text-slate-500">
                <span>{L.detailSales}</span>
                <span className="tabular-nums">{money(hovered.zone.sales)}</span>
              </p>
              {hovered.zone.labels.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {hovered.zone.labels.map((l) => (
                    <ZoneLabelBadge key={l} label={l} L={L} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200 bg-white/90 px-3 py-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              {L.mapLegendLow}
              <span className="flex overflow-hidden rounded-sm" aria-hidden="true">
                {RAMP.map((c) => (
                  <span key={c} className="h-2.5 w-4" style={{ backgroundColor: c }} />
                ))}
              </span>
              {L.mapLegendHigh}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full border-2" style={{ borderColor: STRONG }} aria-hidden="true" />
              <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden="true" /> {L.zoneStrong}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full border-2 border-dashed" style={{ borderColor: OPPORTUNITY }} aria-hidden="true" />
              <Target className="h-3 w-3 text-amber-600" aria-hidden="true" /> {L.zoneOpportunity}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-500" aria-hidden="true" /> {L.mapBranch}
            </span>
            <span>{L.mapRings}</span>
          </div>
        </div>

        {!compact && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            {active ? <ZoneDetail zone={active} L={L} onClose={() => setSelected(null)} /> : <p className="text-sm text-slate-500">{L.mapSelectHint}</p>}
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {L.mapIllustrative}
        {unplaced > 0 && <> {L.mapUnplaced(unplaced)}</>}
      </p>
    </div>
  );
}

function ZoneDetail({ zone, L, onClose }: { zone: ZoneStats; L: LoyaltyDict; onClose: () => void }) {
  const rows: [string, string][] = [
    [L.detailMembers, num(zone.members)],
    [L.detailMemberShare, pct(zone.memberShare)],
    [L.detailSales, money(zone.sales)],
    [L.detailSalesShare, pct(zone.salesShare)],
    [L.detailTicket, money(zone.avgTicket)],
    [L.detailVisits, num(zone.visits)],
    [L.detailFrequency, num(zone.frequency, 2)],
    [L.detailSalesPerMember, money(zone.salesPerMember)],
  ];
  if (zone.distanceKm !== null) rows.push([L.detailDistance, L.km(num(zone.distanceKm, 1))]);
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-slate-900">{L.zoneDetail(zone.postalCode)}</h3>
        <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>
      {zone.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {zone.labels.map((l) => (
            <ZoneLabelBadge key={l} label={l} L={L} />
          ))}
        </div>
      )}
      <dl className="mt-3 divide-y divide-slate-100">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-1.5 text-sm">
            <dt className="text-slate-500">{k}</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      <Link href={`/portal/food/loyalty/members?cp=${zone.postalCode}`} className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">
        {L.detailSeeMembers}
      </Link>
    </div>
  );
}
