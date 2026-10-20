// Solo servidor. Convierte una dirección escrita en coordenadas para que el
// usuario no capture latitud/longitud a mano. El resultado SIEMPRE se muestra
// en el mapa para que la persona lo confirme (o mueva el pin) antes de guardar.
//
// Proveedor por omisión: Nominatim de OpenStreetMap, con su política de uso
// (https://operations.osmfoundation.org/policies/nominatim/):
//  - máximo 1 petición por segundo para TODA la app (candado global en la base);
//  - User-Agent que identifica a la app;
//  - resultados en caché (24 h) para no repetir la misma búsqueda;
//  - sin autocompletar: solo se busca cuando la persona da clic en "Buscar";
//  - atribución visible en la pantalla ("© OpenStreetMap").
// Se puede apagar sin desplegar código (GEOCODER_DISABLED=1) o cambiar por un
// servicio compatible con la API de Nominatim (GEOCODER_URL, p. ej. un proveedor comercial
// o una instancia propia; GEOCODER_KEY si ese servicio pide llave). Para uso
// comercial con volumen, conviene ese cambio: el servicio público puede
// retirarse o limitarse sin aviso.

import { checkRateLimit } from "@/lib/rate-limit";
import { getAppUrl } from "@/lib/app-url";
import { UserError } from "@/lib/user-error";

export interface GeoResult {
  lat: number;
  lng: number;
  label: string;
}

const DEFAULT_URL = "https://nominatim.openstreetmap.org/search";
const CACHE_MS = 24 * 3_600_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; results: GeoResult[] }>();

export function geocoderEnabled(): boolean {
  return process.env.GEOCODER_DISABLED !== "1";
}

function cacheKey(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Busca una dirección. `organizationId` solo se usa para limitar cuántas búsquedas hace cada empresa. */
export async function geocodeAddress(organizationId: string, query: string): Promise<GeoResult[]> {
  if (!geocoderEnabled()) throw new UserError("La búsqueda de direcciones está desactivada. Ubica el pin a mano en el mapa.");
  const q = query.trim();
  if (q.length < 3) throw new UserError("Escribe la dirección para buscarla.");
  const key = cacheKey(q);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;

  const perOrg = await checkRateLimit(`geocode-org:${organizationId}`, { limit: 60, windowMs: 3_600_000 });
  if (!perOrg.allowed) throw new UserError("Demasiadas búsquedas de direcciones. Intenta más tarde o ubica el pin a mano.");
  // 1 petición por segundo para toda la app: si otra búsqueda acaba de salir, espera su turno una vez.
  let slot = await checkRateLimit("geocode-global", { limit: 1, windowMs: 1_100 });
  if (!slot.allowed) {
    await sleep(1_200);
    slot = await checkRateLimit("geocode-global", { limit: 1, windowMs: 1_100 });
    if (!slot.allowed) throw new UserError("El buscador de direcciones está ocupado; intenta de nuevo en un momento.");
  }

  const url = new URL(process.env.GEOCODER_URL || DEFAULT_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("accept-language", "es");
  const country = process.env.GEOCODER_COUNTRY ?? "mx";
  if (country) url.searchParams.set("countrycodes", country);
  if (process.env.GEOCODER_KEY) url.searchParams.set("key", process.env.GEOCODER_KEY);

  let rows: { lat: string; lon: string; display_name: string }[];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `ReymenApp/1.0 (+${getAppUrl()})`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = await res.json();
  } catch (err) {
    console.error("[realty/geocode] búsqueda fallida:", err instanceof Error ? err.message : err);
    throw new UserError("No se pudo buscar la dirección ahora. Ubica el pin a mano en el mapa.");
  }
  const results = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: String(r.display_name ?? "") }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180)
    .slice(0, 5);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), results });
  return results;
}
