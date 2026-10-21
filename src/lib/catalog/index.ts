// Solo servidor. Registro de fuentes de catálogo. Para que un módulo nuevo
// (p. ej. el menú digital de Food) ofrezca productos, basta con escribir su
// CatalogSource y agregarlo a SOURCES: quien los muestra no cambia.

import { getEnabledModules } from "@/lib/modules";
import { parseRef, type CatalogItem, type CatalogSource } from "./types";
import { realtySource } from "./realty";

const SOURCES: CatalogSource[] = [realtySource];

/** Fuentes cuyo módulo está activo en la organización. */
export async function enabledCatalogSources(organizationId: string): Promise<CatalogSource[]> {
  const modules = new Set(await getEnabledModules(organizationId));
  return SOURCES.filter((s) => modules.has(s.module));
}

export interface CatalogGroup {
  key: string;
  label: { es: string; en: string };
  items: CatalogItem[];
}

export async function listCatalog(organizationId: string, query?: string): Promise<CatalogGroup[]> {
  const sources = await enabledCatalogSources(organizationId);
  return Promise.all(sources.map(async (s) => ({ key: s.key, label: s.label, items: await s.list(organizationId, query) })));
}

/** Resuelve un ref dentro de la organización (y solo si su módulo sigue activo). */
export async function resolveCatalogItem(organizationId: string, ref: string): Promise<CatalogItem | null> {
  const parsed = parseRef(ref);
  if (!parsed) return null;
  const source = (await enabledCatalogSources(organizationId)).find((s) => s.key === parsed.key);
  return source ? source.get(organizationId, parsed.id) : null;
}

export { parseRef };
export type { CatalogItem };
