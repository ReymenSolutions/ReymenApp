"use client";

// Mapa de demanda por zona (Leaflet sobre OpenStreetMap). Un círculo por zona
// en su punto APROXIMADO: tamaño = prospectos que la piden, color = lectura
// oferta/demanda. Nunca dibuja domicilios. Se carga solo en el navegador.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface DemandZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  demand: number;
  supply: number;
  fill: string;
  statusLabel: string;
}

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export default function ZoneDemandMap({ zones, height, demandLabel, supplyLabel, recenterLabel, scrollHint }: { zones: DemandZone[]; height: number; demandLabel: string; supplyLabel: string; recenterLabel: string; scrollHint: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const key = zones.map((z) => `${z.id}:${z.demand}:${z.supply}:${z.fill}`).join("|");

  useEffect(() => {
    const el = ref.current;
    if (!el || zones.length === 0) return;
    const map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true });
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18, minZoom: 9 }).addTo(map);
    map.on("click", () => map.scrollWheelZoom.enable());
    map.on("mouseout", () => map.scrollWheelZoom.disable());
    const maxDemand = Math.max(1, ...zones.map((z) => z.demand));
    const bounds = L.latLngBounds([]);
    for (const z of [...zones].sort((a, b) => b.demand - a.demand)) {
      const radius = 600 + 1900 * Math.sqrt(z.demand / maxDemand);
      const c = L.circle([z.lat, z.lng], { radius, color: "#ffffff", weight: 2, fillColor: z.fill, fillOpacity: 0.6 })
        .bindTooltip(`<strong>${esc(z.name)}</strong><br/>${esc(demandLabel)}: ${z.demand} · ${esc(supplyLabel)}: ${z.supply}<br/>${esc(z.statusLabel)}`, { direction: "top", sticky: true, opacity: 1 })
        .addTo(map);
      c.on("add", () => c.getElement()?.setAttribute("aria-label", `${z.name}: ${z.demand} / ${z.supply}`));
      L.marker([z.lat, z.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: "", html: `<span style="white-space:nowrap" class="rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-[#031738] shadow-sm">${esc(z.name)} · ${z.demand}</span>`, iconSize: [120, 18], iconAnchor: [60, 9] }),
      }).addTo(map);
      bounds.extend(L.latLng(z.lat, z.lng).toBounds(radius * 2.2));
    }
    boundsRef.current = bounds;
    map.fitBounds(bounds, { padding: [20, 20] });
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // `key` resume las zonas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="relative isolate">
      <div ref={ref} style={{ height }} className="w-full rounded-md bg-slate-100" title={scrollHint} />
      <button type="button" onClick={() => boundsRef.current && mapRef.current?.fitBounds(boundsRef.current, { padding: [20, 20] })} className="absolute right-3 top-3 z-[1000] rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
        {recenterLabel}
      </button>
    </div>
  );
}
