"use client";

// Productos del perfil público de una SmartCard: se eligen del catálogo de
// los módulos activos de la empresa (hoy Real Estate) y se ven en la tarjeta
// con foto, precio y botón. Ver src/lib/smartcard-products.ts.

import { useEffect, useState } from "react";
import { ImageOff, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addManualProfileProduct,
  addProfileProduct,
  deleteProfileLink,
  getProfileProducts,
  listSmartcardCatalog,
  type CatalogPickerGroup,
} from "@/actions/portal/smartcard";
import { MAX_PRODUCT_CHARACTERISTICS, subtitleToCharacteristics } from "@/lib/smartcard-product-input";
import type { ProfileProduct } from "@/lib/smartcard-products";

function Thumb({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-12 w-16 shrink-0 rounded-md bg-slate-100 object-cover" loading="lazy" />
  ) : (
    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
      <ImageOff className="h-4 w-4" aria-hidden="true" />
    </div>
  );
}

const EMPTY_MANUAL = { title: "", priceLabel: "", url: "", imageUrl: "", characteristics: "" };

export function SmartcardProductsSection({
  profileId,
  lang,
  onProductsChange,
}: {
  profileId: string;
  lang: "es" | "en";
  /** Para la vista previa del editor. */
  onProductsChange?: (products: ProfileProduct[]) => void;
}) {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const [products, setProducts] = useState<ProfileProduct[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<CatalogPickerGroup[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState(EMPTY_MANUAL);
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getProfileProducts(profileId).then((r) => {
      if (!alive) return;
      if (r.success) {
        setProducts(r.products);
        setReady(r.ready);
      } else toast.error(r.error);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [profileId]);

  async function search(q: string) {
    setSearching(true);
    try {
      setGroups(await listSmartcardCatalog(q, lang));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("No se pudo cargar el catálogo.", "Couldn't load the catalog."));
    } finally {
      setSearching(false);
    }
  }

  function openPicker() {
    setPicking(true);
    if (groups === null) search("");
  }

  async function add(ref: string) {
    setBusyRef(ref);
    const r = await addProfileProduct(profileId, ref);
    setBusyRef(null);
    if (!r.success) return toast.error(r.error);
    setProducts((prev) => [...prev, r.product]);
    toast.success(t("Producto agregado a la tarjeta.", "Product added to the card."));
  }

  async function remove(id: string) {
    setBusyId(id);
    const r = await deleteProfileLink(id, profileId);
    setBusyId(null);
    if (!r.success) return toast.error(r.error);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  useEffect(() => {
    onProductsChange?.(products);
  }, [products, onProductsChange]);

  async function addManual() {
    setSavingManual(true);
    const r = await addManualProfileProduct(profileId, {
      title: draft.title,
      priceLabel: draft.priceLabel,
      url: draft.url,
      imageUrl: draft.imageUrl,
      // Una característica por coma o por renglón.
      characteristics: draft.characteristics.split(/[,\n]/),
    });
    setSavingManual(false);
    if (!r.success) return toast.error(r.error);
    setProducts((prev) => [...prev, r.product]);
    setDraft(EMPTY_MANUAL);
    setManual(false);
    toast.success(t("Producto agregado a la tarjeta.", "Product added to the card."));
  }

  const added = new Set(products.map((p) => p.ref));
  const sources = groups ?? [];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {t(`Productos en la tarjeta (${products.length})`, `Products on the card (${products.length})`)}
        </h3>
        {ready && !picking && !manual && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setManual(true)} disabled={loading}>
              <Plus className="h-3.5 w-3.5" />
              {t("Producto propio", "Custom product")}
            </Button>
            <Button variant="outline" size="sm" onClick={openPicker} disabled={loading}>
              <Plus className="h-3.5 w-3.5" />
              {t("Agregar producto", "Add product")}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : !ready ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t(
            "Los productos todavía no están habilitados en SmartCard. Contacta a soporte de Reymen.",
            "Products aren't enabled in SmartCard yet. Please contact Reymen support."
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50 px-2 py-2 text-sm">
              <Thumb src={p.imageUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-700">{p.title}</div>
                <div className="truncate text-xs text-slate-500">{[p.priceLabel, p.subtitle].filter(Boolean).join(" · ")}</div>
                {p.ref === null && <span className="text-[11px] text-slate-400">{t("Producto propio", "Custom product")}</span>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-red-500 hover:text-red-700"
                disabled={busyId === p.id}
                onClick={() => remove(p.id)}
                aria-label={t("Quitar de la tarjeta", "Remove from card")}
              >
                {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ))}
          {products.length === 0 && !picking && !manual && (
            <p className="text-sm text-slate-400">
              {t(
                "Muestra en la tarjeta tus productos con foto, precio y características: agrégalos tú mismo o elígelos del catálogo de tus módulos.",
                "Show your products on the card with photo, price and characteristics: add your own or pick them from your modules' catalog."
              )}
            </p>
          )}
          <p className="text-xs text-slate-500">
            {t(
              "Los productos del catálogo actualizan solos precio, foto y título (y se quitan si se venden o se despublican); los productos propios los editas tú.",
              "Catalog products update price, photo and title on their own (and are removed if sold or unpublished); custom products are yours to edit."
            )}
          </p>
        </div>
      )}

      {manual && (
        <form
          className="mt-3 grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            addManual();
          }}
        >
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="mp-title">{t("Nombre del producto *", "Product name *")}</Label>
            <Input id="mp-title" value={draft.title} maxLength={140} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mp-price">{t("Precio", "Price")}</Label>
            <Input id="mp-price" value={draft.priceLabel} maxLength={60} placeholder="$890 MXN" onChange={(e) => setDraft({ ...draft, priceLabel: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mp-url">{t("Enlace de compra *", "Buy link *")}</Label>
            <Input id="mp-url" value={draft.url} placeholder="https://..." onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="mp-image">{t("URL de la foto", "Photo URL")}</Label>
            <Input id="mp-image" value={draft.imageUrl} placeholder="https://..." onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="mp-chars">{t("Características", "Characteristics")}</Label>
            <Input
              id="mp-chars"
              value={draft.characteristics}
              placeholder={t("30 ml, Vitamina C, Piel mixta", "30 ml, Vitamin C, Combination skin")}
              onChange={(e) => setDraft({ ...draft, characteristics: e.target.value })}
            />
            <p className="text-xs text-slate-500">
              {t(
                `Sepáralas con comas (máximo ${MAX_PRODUCT_CHARACTERISTICS}); se muestran debajo del nombre.`,
                `Separate them with commas (up to ${MAX_PRODUCT_CHARACTERISTICS}); they show under the name.`
              )}
            </p>
            {subtitleToCharacteristics(draft.characteristics.replace(/,/g, " · ")).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {subtitleToCharacteristics(draft.characteristics.replace(/,/g, " · ")).map((c, i) => (
                  <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{c}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setManual(false)} disabled={savingManual}>
              {t("Cancelar", "Cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={savingManual || !draft.title.trim() || !draft.url.trim()}>
              {savingManual && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("Guardar producto", "Save product")}
            </Button>
          </div>
        </form>
      )}

      {picking && (
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <form
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                search(query);
              }}
            >
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Buscar por nombre o colonia", "Search by name or neighborhood")}
                className="pl-8"
                aria-label={t("Buscar producto", "Search product")}
              />
            </form>
            <Button variant="ghost" size="sm" onClick={() => setPicking(false)} aria-label={t("Cerrar", "Close")}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 max-h-72 overflow-y-auto">
            {searching ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : sources.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                {t(
                  "Tu empresa no tiene un módulo con productos activo (por ejemplo Real Estate). Usa «Producto propio» para agregarlos tú mismo.",
                  "Your company has no module with products enabled (for example Real Estate). Use “Custom product” to add them yourself."
                )}
              </p>
            ) : (
              sources.map((g) => (
                <section key={g.key} className="mb-3 last:mb-0">
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.label}</h4>
                  {g.items.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      {t("Nada publicado y disponible que coincida.", "Nothing published and available matches.")}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {g.items.map((i) => {
                        const isAdded = added.has(i.ref);
                        return (
                          <li key={i.ref} className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-slate-50">
                            <Thumb src={i.imageUrl} />
                            <div className="min-w-0 flex-1 text-sm">
                              <div className="truncate font-medium text-slate-700">{i.title}</div>
                              <div className="truncate text-xs text-slate-500">{[i.priceLabel, i.subtitle].filter(Boolean).join(" · ")}</div>
                            </div>
                            <Button size="sm" variant={isAdded ? "ghost" : "outline"} disabled={isAdded || busyRef === i.ref} onClick={() => add(i.ref)}>
                              {busyRef === i.ref ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isAdded ? t("Agregado", "Added") : t("Agregar", "Add")}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
