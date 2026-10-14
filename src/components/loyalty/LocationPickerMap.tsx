"use client";

// Mapa para fijar la ubicación de un punto de venta: un clic pone el pin y el
// pin se puede arrastrar. Solo navegador (Leaflet); se carga con next/dynamic.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPoint } from "@/lib/loyalty/postal-zones";

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

const PIN = L.divIcon({
  className: "",
  html: `<span class="flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-white bg-slate-900 shadow-lg"><span class="h-2.5 w-2.5 rounded-full bg-white"></span></span>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export default function LocationPickerMap({
  value,
  center,
  onChange,
  height = 280,
}: {
  value: GeoPoint | null;
  /** Dónde abrir el mapa si todavía no hay pin. */
  center: GeoPoint;
  onChange: (p: GeoPoint) => void;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = value ?? center;
    const map = L.map(el, { center: [start.lat, start.lng], zoom: value ? 16 : 14, scrollWheelZoom: false, zoomSnap: 0.5 });
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      map.scrollWheelZoom.enable();
      onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.on("mouseout", () => map.scrollWheelZoom.disable());
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Se crea una sola vez; los cambios de valor/centro se aplican abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pin: sigue al valor; arrastrarlo también cambia el valor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = L.marker([value.lat, value.lng], { draggable: true, icon: PIN, keyboard: false })
        .on("dragend", (e) => {
          const ll = (e.target as L.Marker).getLatLng();
          onChangeRef.current({ lat: ll.lat, lng: ll.lng });
        })
        .addTo(map);
    } else {
      markerRef.current.setLatLng([value.lat, value.lng]);
    }
  }, [value]);

  // Sin pin todavía: si cambia el centro sugerido (p. ej. por el CP), el mapa va ahí.
  useEffect(() => {
    if (!value && mapRef.current) mapRef.current.setView([center.lat, center.lng], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);

  return <div ref={ref} style={{ height }} className="loyalty-map w-full rounded-lg border border-slate-200 bg-slate-100" />;
}
