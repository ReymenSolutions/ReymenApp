"use client";

// Dirección por partes, empezando por el código postal: con el CP se llenan
// solos el municipio y el estado (catálogo SEPOMEX) y la colonia se elige de
// una lista. Así nadie tiene que adivinar el formato de una dirección.

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupRealtyPostalCode } from "@/actions/realty";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { realtyStrings } from "@/lib/i18n-realty";
import { SELECT } from "./ProspectForm";

export interface AddressValue {
  cp: string;
  colonia: string;
  municipio: string;
  estado: string;
  street: string;
}

const OTHER = "__other__";

export function AddressFields({
  value,
  onChange,
  idPrefix,
  withStreet = true,
}: {
  value: AddressValue;
  onChange: (patch: Partial<AddressValue>) => void;
  idPrefix: string;
  /** false en zonas: solo CP y colonia. */
  withStreet?: boolean;
}) {
  const { lang } = usePreferences();
  const R = pickDict(realtyStrings, lang);
  const [colonias, setColonias] = useState<{ nombre: string; tipo: string }[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "missing">("idle");
  const [typing, setTyping] = useState(false);
  const lastCp = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Cada vez que el CP llega a 5 dígitos se consulta el catálogo (también al abrir una propiedad ya guardada).
  useEffect(() => {
    const cp = value.cp;
    if (!/^\d{5}$/.test(cp)) {
      lastCp.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setColonias(null);
      setStatus("idle");
      return;
    }
    if (lastCp.current === cp) return;
    const firstLoad = lastCp.current === null && !!value.colonia;
    lastCp.current = cp;
    setStatus("loading");
    let alive = true;
    let done = false;
    lookupRealtyPostalCode(cp)
      .then((info) => {
        done = true;
        if (!alive) return;
        if (!info) {
          setColonias(null);
          setStatus("missing");
          setTyping(true);
          return;
        }
        setColonias(info.colonias);
        setStatus("found");
        const known = info.colonias.some((c) => c.nombre === value.colonia);
        setTyping(!!value.colonia && !known);
        // Un CP nuevo cambia municipio/estado; la colonia se conserva si sigue en la lista.
        onChangeRef.current({
          municipio: info.municipio,
          estado: info.estado,
          ...(firstLoad || known ? {} : { colonia: info.colonias.length === 1 ? info.colonias[0].nombre : "" }),
        });
      })
      .catch(() => {
        done = true;
        if (alive) setStatus("missing");
      });
    return () => {
      alive = false;
      // Si se canceló a medias (p. ej. al volver a montar), la siguiente vez se consulta de nuevo.
      if (!done) lastCp.current = null;
    };
    // value.colonia solo se lee al llegar el CP; no debe volver a consultar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.cp]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-cp`}>{R.postalCode}</Label>
        <Input
          id={`${idPrefix}-cp`}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          placeholder="64610"
          value={value.cp}
          onChange={(e) => onChange({ cp: e.target.value.replace(/\D/g, "").slice(0, 5) })}
        />
        <p className="text-[11px] text-slate-500">
          {status === "loading" ? R.cpLoading : status === "missing" ? R.cpMissing : status === "found" ? R.cpFound(colonias?.length ?? 0) : R.cpHint}
        </p>
      </div>

      <div className="space-y-1.5 sm:col-span-1 lg:col-span-2">
        <Label htmlFor={`${idPrefix}-colonia`}>{R.neighborhood}</Label>
        {colonias && colonias.length > 0 && !typing ? (
          <select
            id={`${idPrefix}-colonia`}
            className={SELECT}
            value={value.colonia}
            onChange={(e) => {
              if (e.target.value === OTHER) {
                setTyping(true);
                onChange({ colonia: "" });
              } else onChange({ colonia: e.target.value });
            }}
          >
            <option value="" disabled>
              {R.chooseColonia}
            </option>
            {colonias.map((c) => (
              <option key={c.nombre} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
            <option value={OTHER}>{R.otherColonia}</option>
          </select>
        ) : (
          <Input id={`${idPrefix}-colonia`} value={value.colonia} onChange={(e) => onChange({ colonia: e.target.value })} maxLength={120} disabled={status === "idle" && !value.colonia} placeholder={status === "idle" ? R.cpFirst : undefined} />
        )}
        {colonias && colonias.length > 0 && typing && (
          <button type="button" onClick={() => setTyping(false)} className="text-[11px] font-medium text-[#063C82] hover:underline">
            {R.pickFromList}
          </button>
        )}
      </div>

      {status === "missing" ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-mun`}>{R.municipality}</Label>
            <Input id={`${idPrefix}-mun`} value={value.municipio} onChange={(e) => onChange({ municipio: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-edo`}>{R.stateLabel}</Label>
            <Input id={`${idPrefix}-edo`} value={value.estado} onChange={(e) => onChange({ estado: e.target.value })} maxLength={80} />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>{R.municipality}</Label>
          <p className="flex h-9 items-center rounded-md border border-dashed border-slate-200 px-3 text-sm text-slate-600">{value.municipio ? `${value.municipio}, ${value.estado}` : "—"}</p>
        </div>
      )}

      {withStreet && (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor={`${idPrefix}-street`}>{R.streetNumber}</Label>
          <Input id={`${idPrefix}-street`} value={value.street} onChange={(e) => onChange({ street: e.target.value })} maxLength={200} placeholder={R.streetPlaceholder} />
          <p className="text-[11px] text-slate-500">{R.streetPrivate}</p>
        </div>
      )}
    </div>
  );
}
