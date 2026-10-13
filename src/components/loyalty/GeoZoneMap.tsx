"use client";

// Mapa geográfico de Lealtad sobre OpenStreetMap (Leaflet). Solo dibuja lo que
// ZoneMap ya calculó: un círculo por código postal (nunca domicilios), la
// sucursal y anillos de distancia. Se carga solo en el navegador (next/dynamic
// con ssr: false) porque Leaflet necesita `window`.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "@/lib/loyalty/postal-zones";

export interface GeoZone {
  postalCode: string;
  point: GeoPoint;
  radiusM: number;
  fill: string;
  strong: boolean;
  opportunity: boolean;
  /** HTML ya escapado para el tooltip. */
  tooltipHtml: string;
  ariaLabel: string;
}

const STRONG = "#059669";
const OPPORTUNITY = "#d97706";
const RINGS_KM = [1, 3, 5];

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export default function GeoZoneMap({
  zones,
  reference,
  referenceLabel,
  selected,
  onSelect,
  height,
  recenterLabel,
  scrollHint,
}: {
  zones: GeoZone[];
  reference: GeoPoint;
  referenceLabel: string;
  selected: string | null;
  onSelect: (postalCode: string) => void;
  height: number;
  recenterLabel: string;
  scrollHint: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const fitRef = useRef<L.LatLngBounds | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Mapa base, sucursal y anillos: una sola vez por punto de referencia.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, {
      center: [reference.lat, reference.lng],
      zoom: 13,
      // Encuadre fino: con zoom entero el mapa compacto quedaba demasiado lejos.
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      scrollWheelZoom: false, // no secuestra el scroll de la página hasta que el usuario hace clic
      attributionControl: true,
      zoomControl: true,
    });
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, minZoom: 10 }).addTo(map);
    map.on("click", () => map.scrollWheelZoom.enable());
    map.on("mouseout", () => map.scrollWheelZoom.disable());

    const base = L.layerGroup().addTo(map);
    for (const km of RINGS_KM) {
      L.circle([reference.lat, reference.lng], {
        radius: km * 1000,
        color: "#64748b",
        weight: 1.25,
        dashArray: "5 6",
        fill: false,
        interactive: false,
      }).addTo(base);
      // Etiqueta del anillo en su borde norte.
      const north = L.latLng(reference.lat + km / 110.574, reference.lng);
      L.marker(north, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          html: `<span class="rounded bg-white/90 px-1 text-[10px] font-medium text-slate-500 shadow-sm">${km} km</span>`,
          iconSize: [36, 14],
          iconAnchor: [18, 7],
        }),
      }).addTo(base);
    }
    L.marker([reference.lat, reference.lng], {
      keyboard: false,
      zIndexOffset: 1000,
      title: referenceLabel,
      icon: L.divIcon({
        className: "",
        html: `<span class="flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-white bg-orange-500 shadow-md"><span class="h-2 w-2 rounded-full bg-white"></span></span>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    })
      .bindTooltip(escapeHtml(referenceLabel), { permanent: true, direction: "bottom", offset: [0, 10], className: "loyalty-branch-label" })
      .addTo(base);

    zonesLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // El contenedor puede medir distinto tras el primer pintado (tarjetas, fuentes).
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      zonesLayerRef.current = null;
      fitRef.current = null;
    };
  }, [reference.lat, reference.lng, referenceLabel]);

  // Zonas: se redibujan al cambiar la métrica o la selección.
  useEffect(() => {
    const map = mapRef.current;
    const layer = zonesLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    // Grandes primero: las chicas quedan encima y se pueden tocar.
    const ordered = [...zones].sort((a, b) => b.radiusM - a.radiusM);
    for (const z of ordered) {
      const isActive = z.postalCode === selected;
      const center: L.LatLngExpression = [z.point.lat, z.point.lng];
      if (z.strong || z.opportunity) {
        L.circle(center, {
          radius: z.radiusM + 90,
          color: z.strong ? STRONG : OPPORTUNITY,
          weight: 3,
          dashArray: z.strong ? undefined : "7 6",
          fill: false,
          interactive: false,
        }).addTo(layer);
      }
      const circle = L.circle(center, {
        radius: z.radiusM,
        color: isActive ? "#0f172a" : "#ffffff",
        weight: isActive ? 3 : 2,
        fillColor: z.fill,
        fillOpacity: isActive ? 0.8 : 0.62,
        bubblingMouseEvents: false,
      })
        .bindTooltip(z.tooltipHtml, { direction: "top", sticky: true, opacity: 1, className: "loyalty-zone-tip" })
        .on("click", () => onSelectRef.current(z.postalCode))
        .addTo(layer);
      circle.on("add", () => circle.getElement()?.setAttribute("aria-label", z.ariaLabel));
      circle.getElement()?.setAttribute("aria-label", z.ariaLabel);
      // Número del CP sobre el círculo.
      L.marker(center, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          html: `<span class="rounded-full bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800 shadow-sm">${escapeHtml(z.postalCode)}</span>`,
          iconSize: [48, 18],
          iconAnchor: [24, 9],
        }),
      }).addTo(layer);
    }
    // Encuadre inicial: todas las zonas y la sucursal (solo la primera vez).
    if (!fitRef.current && zones.length > 0) {
      const bounds = L.latLngBounds([[reference.lat, reference.lng]]);
      for (const z of zones) bounds.extend(L.latLng(z.point.lat, z.point.lng).toBounds(z.radiusM * 2.2));
      fitRef.current = bounds;
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [zones, selected, reference.lat, reference.lng]);

  return (
    <div className="relative isolate">
      <div ref={containerRef} style={{ height }} className="w-full bg-slate-100" title={scrollHint} />
      <button
        type="button"
        onClick={() => {
          if (mapRef.current && fitRef.current) mapRef.current.fitBounds(fitRef.current, { padding: [24, 24] });
        }}
        className="absolute right-3 top-3 z-[1000] rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        {recenterLabel}
      </button>
    </div>
  );
}
