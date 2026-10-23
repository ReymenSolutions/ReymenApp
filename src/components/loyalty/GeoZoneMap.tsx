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

const STRONG = "#1e3a8a";
const OPPORTUNITY = "#7c3aed";
const RINGS_KM = [1, 3, 5];

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export interface GeoSite {
  key: string;
  label: string;
  point: GeoPoint;
}

/** Pin de la sucursal (tienda), en el azul de la marca, con la punta en el punto exacto. */
const STORE_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44" aria-hidden="true"><path d="M18 43c-1-1.6-14-15.2-14-25.3C4 9.6 10.3 3 18 3s14 6.6 14 14.7C32 27.8 19 41.4 18 43z" fill="#1a3ef5" stroke="#fff" stroke-width="2.5"/><g transform="translate(9 8.5)" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7 3.5 2h11L16 7"/><path d="M2 7c0 1.2 1 2.2 2.3 2.2S6.6 8.2 6.6 7c0 1.2 1 2.2 2.4 2.2s2.4-1 2.4-2.2c0 1.2 1 2.2 2.3 2.2S16 8.2 16 7"/><path d="M3.3 9.2V16h11.4V9.2"/><path d="M7.5 16v-3.6h3V16"/></g></svg>`;
const STORE_PIN_HTML = `<span style="display:block;filter:drop-shadow(0 2px 3px rgb(0 0 0 / 0.35))">${STORE_PIN_SVG}</span>`;

export default function GeoZoneMap({
  zones,
  reference,
  sites,
  selected,
  onSelect,
  height,
  recenterLabel,
  scrollHint,
}: {
  zones: GeoZone[];
  /** Centro del mapa y de los anillos de distancia (la sucursal enfocada). */
  reference: GeoPoint;
  /** Puntos de venta ubicados; los anillos de distancia se dibujan si es uno solo. */
  sites: GeoSite[];
  selected: string | null;
  onSelect: (postalCode: string) => void;
  height: number;
  recenterLabel: string;
  scrollHint: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sitesKey = sites.map((s) => `${s.key}:${s.point.lat},${s.point.lng}:${s.label}`).join("|");
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
    // Anillos solo con una sucursal enfocada: con varias se confundirían.
    if (sites.length === 1) {
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
    }
    for (const site of sites) {
      L.marker([site.point.lat, site.point.lng], {
        keyboard: false,
        zIndexOffset: 1000,
        title: site.label,
        // Pin con ícono de tienda: la sucursal no se confunde con los círculos de las zonas.
        icon: L.divIcon({
          className: "",
          html: STORE_PIN_HTML,
          iconSize: [36, 44],
          iconAnchor: [18, 42],
        }),
      })
        .bindTooltip(escapeHtml(site.label), { permanent: true, direction: "bottom", offset: [0, 4], className: "loyalty-branch-label" })
        .addTo(base);
    }

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
    // sitesKey resume la lista de puntos de venta (sus coordenadas y nombres).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference.lat, reference.lng, sitesKey]);

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
      for (const site of sites) bounds.extend([site.point.lat, site.point.lng]);
      for (const z of zones) bounds.extend(L.latLng(z.point.lat, z.point.lng).toBounds(z.radiusM * 2.2));
      fitRef.current = bounds;
      map.fitBounds(bounds, { padding: [24, 24] });
    }
    // sites se resume en sitesKey: si cambia, el mapa base se rehízo y hay que redibujar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, selected, reference.lat, reference.lng, sitesKey]);

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
