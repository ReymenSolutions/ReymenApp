"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { getErrorMessage } from "@/lib/user-error";
import { saveLoyaltyLocation } from "@/actions/loyalty";
import { DEFAULT_REFERENCE, normalizePostalCode, zonePoint, type GeoPoint } from "@/lib/loyalty/postal-zones";
import { MAIN_LOCATION_KEY, type LoyaltyLocationView } from "@/lib/loyalty/locations-shared";

const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => <div className="h-[280px] w-full animate-pulse rounded-lg bg-slate-100" />,
});

/** Ubicación (CP + pin) de la Principal y de cada sucursal, para el mapa y las distancias. */
export function LocationsEditor({ locations, readOnly }: { locations: LoyaltyLocationView[]; readOnly: boolean }) {
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const [editing, setEditing] = useState<string | null>(null);
  const located = locations.filter((l) => l.point !== null);

  return (
    <ul className="divide-y divide-slate-100">
      {locations.map((loc) => (
        <li key={loc.key} className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", loc.point ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400")}>
                <MapPin className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {loc.label} {loc.key === MAIN_LOCATION_KEY && <span className="font-normal text-slate-400">{L.locationMainSuffix}</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {loc.point ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      {L.locationSet} · CP {loc.postalCode}
                    </span>
                  ) : (
                    L.locationMissing
                  )}
                </p>
              </div>
            </div>
            {!readOnly && editing !== loc.key && (
              <button
                type="button"
                onClick={() => setEditing(loc.key)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {loc.point ? L.locationChange : L.locationSetAction}
              </button>
            )}
          </div>
          {editing === loc.key && (
            <LocationForm
              location={loc}
              fallbackCenter={located.find((l) => l.key !== loc.key)?.point ?? DEFAULT_REFERENCE}
              onDone={() => setEditing(null)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function LocationForm({ location, fallbackCenter, onDone }: { location: LoyaltyLocationView; fallbackCenter: GeoPoint; onDone: () => void }) {
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const router = useRouter();
  const [cp, setCp] = useState(location.postalCode ?? "");
  const [point, setPoint] = useState<GeoPoint | null>(location.point);
  const [pending, start] = useTransition();
  // Si el CP está en el catálogo, el mapa abre en esa zona para encontrar la tienda más rápido.
  const center = useMemo(() => {
    const n = normalizePostalCode(cp);
    return (n && zonePoint(n)) || fallbackCenter;
  }, [cp, fallbackCenter]);

  function save() {
    if (!point) {
      toast.error(L.locationNoPin);
      return;
    }
    start(async () => {
      try {
        await saveLoyaltyLocation({ branchKey: location.key, postalCode: cp, lat: point.lat, lng: point.lng });
        toast.success(L.locationSaved);
        onDone();
        router.refresh();
      } catch (err) {
        toast.error(getErrorMessage(err, lang === "es" ? "Error al guardar" : "Error saving"));
      }
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">{L.locationCp}</span>
          <input
            value={cp}
            onChange={(e) => setCp(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
            inputMode="numeric"
            maxLength={5}
            placeholder="64610"
            className="mt-1 block w-28 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </label>
        <p className="flex-1 text-xs text-slate-500">{L.locationClickHint}</p>
      </div>
      <LocationPickerMap value={point} center={center} onChange={setPoint} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} disabled={pending} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          {L.locationCancel}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || !normalizePostalCode(cp) || !point}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {L.locationSave}
        </button>
      </div>
    </div>
  );
}
