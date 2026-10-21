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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera el turno global de 1 petición por segundo (hasta ~4 s); si no llega, avisa. */
async function takeGlobalSlot() {
  for (let i = 0; i < 4; i++) {
    const slot = await checkRateLimit("geocode-global", { limit: 1, windowMs: 1_100 });
    if (slot.allowed) return;
    await sleep(1_150);
  }
  throw new UserError("El buscador de direcciones está ocupado; intenta de nuevo en un momento.");
}

async function checkOrgQuota(organizationId: string) {
  const perOrg = await checkRateLimit(`geocode-org:${organizationId}`, { limit: 60, windowMs: 3_600_000 });
  if (!perOrg.allowed) throw new UserError("Demasiadas búsquedas de direcciones. Intenta más tarde o ubica el pin a mano.");
}

/**
 * Una petición al servicio (texto libre `q` o búsqueda estructurada:
 * street, city, state, postalcode, country). Con caché de 24 h por parámetros.
 */
async function request(params: Record<string, string>): Promise<GeoResult[]> {
  const key = JSON.stringify(Object.entries(params).map(([k, v]) => [k, v.trim().toLowerCase().replace(/\s+/g, " ")]).sort());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.results;
  await takeGlobalSlot();

  const url = new URL(process.env.GEOCODER_URL || DEFAULT_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
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

/** Busca una dirección escrita libremente. `organizationId` solo limita cuántas búsquedas hace cada empresa. */
export async function geocodeAddress(organizationId: string, query: string): Promise<GeoResult[]> {
  if (!geocoderEnabled()) throw new UserError("La búsqueda de direcciones está desactivada. Ubica el pin a mano en el mapa.");
  const q = query.trim();
  if (q.length < 3) throw new UserError("Escribe la dirección para buscarla.");
  await checkOrgQuota(organizationId);
  return request({ q });
}

export interface StructuredAddress {
  /** Calle y número ("Potosí 5002"); vacío para ubicar solo la colonia. */
  street: string;
  colonia: string;
  municipio: string;
  estado: string;
  cp: string;
}

/** Qué tan fino quedó el punto: la casa, la colonia, el CP o solo el municipio. */
export type GeoPrecision = "address" | "colonia" | "postal" | "municipality";

/**
 * Búsqueda por partes (CP → colonia → calle). Los mapas abiertos no siempre
 * tienen el número exacto de una casa en México, así que se intenta de lo más
 * fino a lo más general y se dice cuál se logró: la persona mueve el pin a la
 * casa exacta antes de confirmar.
 */
export async function geocodeStructured(organizationId: string, a: StructuredAddress): Promise<{ results: GeoResult[]; precision: GeoPrecision | null }> {
  if (!geocoderEnabled()) throw new UserError("La búsqueda de direcciones está desactivada. Ubica el pin a mano en el mapa.");
  const street = a.street.trim();
  const colonia = a.colonia.trim();
  const municipio = a.municipio.trim();
  const estado = a.estado.trim();
  const cp = a.cp.trim();
  if (!street && !colonia && !cp) throw new UserError("Escribe el código postal para buscar la dirección.");
  await checkOrgQuota(organizationId);

  const attempts: { precision: GeoPrecision; params: Record<string, string> }[] = [];
  if (street) {
    attempts.push({ precision: "address", params: { street, city: municipio, state: estado, ...(cp ? { postalcode: cp } : {}), country: "México" } });
    attempts.push({ precision: "address", params: { q: [street, colonia, municipio, estado].filter(Boolean).join(", ") } });
  }
  if (colonia) attempts.push({ precision: "colonia", params: { q: [colonia, municipio, estado].filter(Boolean).join(", ") } });
  if (cp) attempts.push({ precision: "postal", params: { postalcode: cp, country: "México" } });
  if (municipio) attempts.push({ precision: "municipality", params: { q: [municipio, estado].filter(Boolean).join(", ") } });

  for (const at of attempts) {
    const results = await request(at.params);
    if (results.length) return { results, precision: at.precision };
  }
  return { results: [], precision: null };
}
