"use client";

// Ubicación sin capturar latitud/longitud: la persona escribe la dirección,
// el sistema la busca (servidor → geocode.ts), muestra el pin en el mapa y
// NO se toma hasta que la persona confirma (puede arrastrar el pin o dar clic
// en el mapa para corregirlo). Si la búsqueda no encuentra nada, se ubica a mano.

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Check, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { geocodeRealtyAddress } from "@/actions/realty";
import { getErrorMessage } from "@/lib/user-error";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { realtyStrings } from "@/lib/i18n-realty";
import { cn } from "@/lib/utils";

const PickerMap = dynamic(() => import("@/components/loyalty/LocationPickerMap"), {
  ssr: false,
  loading: () => <div className="h-[280px] w-full animate-pulse rounded-lg bg-slate-100" />,
});

export interface GeoValue {
  lat: number;
  lng: number;
}

/** Monterrey, solo como punto de partida del mapa cuando no hay nada mejor. */
const FALLBACK: GeoValue = { lat: 25.6866, lng: -100.3161 };

export function GeoPicker({
  suggestedQuery,
  value,
  center,
  onConfirm,
  onPendingChange,
  hint,
  idPrefix,
}: {
  /** Texto con el que se arma la búsqueda (dirección, colonia, zona…); la persona lo puede editar. */
  suggestedQuery: string;
  /** Ubicación ya confirmada (o null). */
  value: GeoValue | null;
  /** Dónde abrir el mapa para ubicar a mano. */
  center?: GeoValue | null;
  onConfirm: (v: GeoValue | null) => void;
  /** true mientras hay un pin sin confirmar: el formulario no debe guardarse así. */
  onPendingChange?: (pending: boolean) => void;
  hint?: string;
  idPrefix: string;
}) {
  const { lang } = usePreferences();
  const R = pickDict(realtyStrings, lang);
  const [q, setQ] = useState(suggestedQuery);
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ lat: number; lng: number; label: string }[] | null>(null);
  const [pending, setPending] = useState<GeoValue | null>(null);
  const [mapKey, setMapKey] = useState(0);

  // Mientras la persona no escriba su propia búsqueda, se arma sola con la dirección del formulario.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!edited) setQ(suggestedQuery);
  }, [suggestedQuery, edited]);

  useEffect(() => {
    onPendingChange?.(pending !== null);
  }, [pending, onPendingChange]);

  function review(p: GeoValue) {
    setPending(p);
    setMapKey((k) => k + 1);
  }

  async function search() {
    if (q.trim().length < 3) return toast.error(R.geoPlaceholder);
    setBusy(true);
    try {
      const found = await geocodeRealtyAddress(q);
      setResults(found);
      if (found.length > 0) review({ lat: found[0].lat, lng: found[0].lng });
      else setPending(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setBusy(false);
    }
  }

  const start = center ?? value ?? FALLBACK;

  return (
    <div className="space-y-3">
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={`${idPrefix}-geo-q`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setEdited(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder={R.geoPlaceholder}
          maxLength={200}
          aria-label={R.geoTitle}
        />
        <Button type="button" variant="outline" onClick={search} loading={busy} className="shrink-0">
          <Search className="h-4 w-4" aria-hidden="true" />
          {busy ? R.geoSearching : R.geoSearch}
        </Button>
        {!pending && (
          <Button type="button" variant="ghost" onClick={() => review(value ?? start)} className="shrink-0 text-xs">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {R.geoManual}
          </Button>
        )}
      </div>

      {results && results.length === 0 && !pending && <p className="text-sm text-amber-700">{R.geoNone}</p>}

      {pending && (
        <div className="space-y-2 rounded-lg border border-[#063C82]/30 bg-[#F2F4F6] p-3">
          {results && results.length > 1 && (
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-slate-600">{R.geoPick}</legend>
              <ul className="space-y-1">
                {results.map((r, i) => {
                  const on = Math.abs(r.lat - pending.lat) < 1e-7 && Math.abs(r.lng - pending.lng) < 1e-7;
                  return (
                    <li key={`${r.lat},${r.lng},${i}`}>
                      <button type="button" onClick={() => review({ lat: r.lat, lng: r.lng })} className={cn("w-full rounded-md px-2 py-1.5 text-left text-xs", on ? "bg-white font-semibold text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white")}>
                        {r.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}
          <p className="text-sm font-medium text-slate-800">{R.geoReview}</p>
          <PickerMap key={mapKey} value={pending} center={pending} onChange={setPending} height={280} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onConfirm(pending);
                setPending(null);
              }}
              className="bg-[#22C55E] text-[#080C13] hover:bg-[#16a34a]"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {R.geoConfirm}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setPending(null)}>
              {R.geoCancel}
            </Button>
            <span className="ml-auto text-[11px] text-slate-500">{R.geoAttribution}</span>
          </div>
        </div>
      )}

      {!pending && value && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-emerald-700">
          <Check className="h-4 w-4" aria-hidden="true" />
          {R.geoConfirmed}
          <span className="text-xs text-slate-500">
            ({value.lat.toFixed(5)}, {value.lng.toFixed(5)})
          </span>
          <button type="button" onClick={() => review(value)} className="text-xs font-medium text-[#063C82] hover:underline">
            {R.geoChange}
          </button>
          <button type="button" onClick={() => onConfirm(null)} className="text-xs font-medium text-slate-500 hover:underline">
            {R.geoRemove}
          </button>
        </p>
      )}
    </div>
  );
}
