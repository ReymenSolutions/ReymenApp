"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { MapPin, Target, CheckCircle2, Gem, Repeat, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings, type LoyaltyDict } from "@/lib/i18n-loyalty";
import { MAP_METRICS, zoneMetricValue, type MapMetric, type ZoneLabel, type ZoneStats } from "@/lib/loyalty/metrics";
import { DEFAULT_REFERENCE, offsetToLatLng, zonePosition, type GeoPoint } from "@/lib/loyalty/postal-zones";
import type { GeoZone } from "./GeoZoneMap";
import { money, num, pct } from "@/lib/loyalty/format";

// Rampa tipo semáforo, menos → más: rojo, naranja, amarillo, verde lima, verde.
// El rojo marca las zonas con menos de la métrica elegida (los puntos críticos
// a atender); el verde, las que mejor van.
const RAMP = ["#dc2626", "#f97316", "#facc15", "#84cc16", "#16a34a"];
// Los anillos de estado usan tonos fuera de la rampa para no confundirse con ella
// y siempre van con ícono y texto, nunca solo color.
const STRONG = "#1e3a8a"; // azul marino, anillo sólido
const OPPORTUNITY = "#7c3aed"; // violeta, anillo punteado

// Radio geográfico de cada círculo (metros), por raíz cuadrada del valor para
// que el área —no el radio— sea proporcional a la métrica.
const R_MIN_M = 220;
const R_MAX_M = 650;

// Leaflet necesita `window`: el mapa se carga solo en el navegador.
const GeoZoneMap = dynamic(() => import("./GeoZoneMap"), {
  ssr: false,
  loading: () => <div className="h-full min-h-[320px] w-full animate-pulse bg-slate-100" />,
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

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
    strong: "bg-blue-50 text-blue-900 ring-blue-200",
    opportunity: "bg-violet-50 text-violet-700 ring-violet-200",
    high_value: "bg-sky-50 text-sky-700 ring-sky-200",
    low_frequency: "bg-slate-100 text-slate-600 ring-slate-200",
  }[label];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", cls)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {zoneLabelText(label, L)}
    </span>
  );
}

export function ZoneMap({
  zones,
  referenceLabel,
  referenceLat,
  referenceLng,
  compact = false,
  initialMetric = "members",
}: {
  zones: ZoneStats[];
  referenceLabel: string | null;
  referenceLat?: number | null;
  referenceLng?: number | null;
  compact?: boolean;
  initialMetric?: MapMetric;
}) {
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const [metric, setMetric] = useState<MapMetric>(initialMetric);
  // En el mapa completo se abre con la zona de más ventas seleccionada, para que el panel no empiece vacío.
  const [selected, setSelected] = useState<string | null>(compact ? null : (zones[0]?.postalCode ?? null));

  const hasReference = referenceLat != null && referenceLng != null;
  const reference: GeoPoint = hasReference ? { lat: referenceLat, lng: referenceLng } : DEFAULT_REFERENCE;

  const { geoZones, unplaced } = useMemo(() => {
    const withPos = zones.map((z) => ({ z, pos: zonePosition(z.postalCode) }));
    const onMap = withPos.filter((w) => w.pos !== null) as { z: ZoneStats; pos: { eastKm: number; northKm: number } }[];
    const values = onMap.map((w) => zoneMetricValue(w.z, metric));
    const max = Math.max(0, ...values);
    const geoZones: GeoZone[] = onMap.map((w, i) => {
      const z = w.z;
      const v = values[i];
      const t = max > 0 ? v / max : 0;
      const step = Math.min(RAMP.length - 1, Math.floor(t * RAMP.length));
      const strong = z.labels.includes("strong");
      const opportunity = z.labels.includes("opportunity");
      const badges = z.labels.map((l) => zoneLabelText(l, L)).join(" · ");
      const tooltipHtml =
        `<div class="min-w-[11rem] text-xs">` +
        `<p class="font-semibold text-slate-900">${escapeHtml(L.zoneDetail(z.postalCode))}</p>` +
        `<p class="mt-1 flex justify-between gap-3 text-slate-600"><span>${escapeHtml(metricLabel(metric, L))}</span><span class="font-semibold tabular-nums text-slate-900">${escapeHtml(formatMetric(metric, v))}</span></p>` +
        `<p class="flex justify-between gap-3 text-slate-500"><span>${escapeHtml(L.detailMembers)}</span><span class="tabular-nums">${escapeHtml(num(z.members))}</span></p>` +
        `<p class="flex justify-between gap-3 text-slate-500"><span>${escapeHtml(L.detailSales)}</span><span class="tabular-nums">${escapeHtml(money(z.sales))}</span></p>` +
        (badges ? `<p class="mt-1 font-medium ${strong ? "text-blue-900" : opportunity ? "text-violet-700" : "text-sky-700"}">${escapeHtml(badges)}</p>` : "") +
        `</div>`;
      return {
        postalCode: z.postalCode,
        point: offsetToLatLng(reference, w.pos),
        radiusM: Math.round(R_MIN_M + (R_MAX_M - R_MIN_M) * Math.sqrt(Math.max(0, t))),
        fill: RAMP[step],
        strong,
        opportunity,
        tooltipHtml,
        ariaLabel: `${L.zoneDetail(z.postalCode)}: ${metricLabel(metric, L)} ${formatMetric(metric, v)}${badges ? ` · ${badges}` : ""}`,
      };
    });
    return { geoZones, unplaced: withPos.length - onMap.length };
    // reference es estable mientras no cambien sus coordenadas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, metric, L, reference.lat, reference.lng]);

  const active = selected ? zones.find((z) => z.postalCode === selected) ?? null : null;

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
        <div className="loyalty-map relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <GeoZoneMap
            zones={geoZones}
            reference={reference}
            referenceLabel={referenceLabel ?? L.mapBranch}
            selected={selected}
            onSelect={(cp) => setSelected((cur) => (cur === cp ? null : cp))}
            height={compact ? 360 : 520}
            recenterLabel={L.mapRecenter}
            scrollHint={L.mapScrollHint}
          />

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
              <CheckCircle2 className="h-3 w-3 text-blue-900" aria-hidden="true" /> {L.zoneStrong}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full border-2 border-dashed" style={{ borderColor: OPPORTUNITY }} aria-hidden="true" />
              <Target className="h-3 w-3 text-violet-600" aria-hidden="true" /> {L.zoneOpportunity}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-900" aria-hidden="true" /> {L.mapBranch}
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
        {!hasReference && <> {L.mapApproxReference}</>}
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
      <Link href={`/portal/loyalty/members?cp=${zone.postalCode}`} className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">
        {L.detailSeeMembers}
      </Link>
    </div>
  );
}
