// Solo servidor. Productos en el perfil público de una SmartCard.
//
// Un producto es una fila de `profile_links` (Supabase de reymen-smartcard)
// con type = 'product' y, además del título y la URL, una copia de lo que
// muestra la tarjeta: subtitle, price_label, image_url. `source_ref` dice de
// qué módulo y registro salió ("realty:<id>", ver src/lib/catalog). Se reusa
// profile_links a propósito: la página pública ya registra los clics de cada
// link (/l/<linkId>), así que los productos traen analítica sin código nuevo.
//
// La copia se mantiene al día desde aquí (syncSmartcardProduct) cuando el
// módulo dueño cambia el registro: precio, título, foto; y se oculta cuando
// deja de estar disponible (vendida, rentada, despublicada).
//
// Requiere la migración de reymen-smartcard que agrega esas columnas
// (subtitle, price_label, image_url, source_ref) y las devuelve en
// get_public_profile().

import { getSmartcardAdminClient } from "./smartcard-supabase";
import type { CatalogItem } from "./catalog/types";

export const PRODUCT_LINK_TYPE = "product";
export const MAX_PROFILE_PRODUCTS = 12;

export interface ProfileProduct {
  id: string;
  /** null = producto escrito a mano (sin módulo dueño). */
  ref: string | null;
  title: string;
  subtitle: string | null;
  priceLabel: string | null;
  imageUrl: string | null;
  url: string;
  sortOrder: number;
}

/** Productos activos de un perfil (el que llama ya verificó que el perfil es de su empresa). */
export async function listProfileProducts(profileId: string): Promise<ProfileProduct[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profile_links")
    .select("id, title, url, subtitle, price_label, image_url, source_ref, sort_order")
    .eq("profile_id", profileId)
    .eq("type", PRODUCT_LINK_TYPE)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    // Lo más probable: falta la migración de productos en Supabase.
    console.error("[smartcard-products] Error listando productos:", error.message);
    return null;
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    ref: (r.source_ref as string | null) ?? null,
    title: r.title as string,
    subtitle: (r.subtitle as string | null) ?? null,
    priceLabel: (r.price_label as string | null) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
    url: r.url as string,
    sortOrder: r.sort_order as number,
  }));
}

/** Columnas de la copia que muestra la tarjeta (solo URLs https para la foto). */
export function productColumns(item: CatalogItem) {
  return {
    title: item.title.slice(0, 140),
    url: item.url,
    subtitle: item.subtitle?.slice(0, 140) || null,
    price_label: item.priceLabel?.slice(0, 60) || null,
    image_url: item.imageUrl && /^https:\/\//i.test(item.imageUrl) ? item.imageUrl : null,
  };
}

/**
 * Actualiza todas las tarjetas que muestran este producto. Si dejó de estar
 * disponible (o ya no existe: item null + ref), se ocultan. Nunca lanza: un
 * fallo aquí no debe impedir guardar la propiedad; queda en el log.
 */
export async function syncSmartcardProduct(ref: string, item: CatalogItem | null): Promise<void> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return;
  try {
    const update = item && item.available ? { ...productColumns(item) } : { is_active: false };
    const { error } = await supabase
      .from("profile_links")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("type", PRODUCT_LINK_TYPE)
      .eq("source_ref", ref)
      .eq("is_active", true);
    if (error) console.error("[smartcard-products] No se pudo actualizar", ref, error.message);
  } catch (err) {
    console.error("[smartcard-products] No se pudo actualizar", ref, err instanceof Error ? err.message : err);
  }
}
