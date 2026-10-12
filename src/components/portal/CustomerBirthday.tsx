"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cake, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { setCustomerBirthday } from "@/actions/customers";
import { getErrorMessage } from "@/lib/user-error";
import { MONTH_NAMES } from "@/lib/birthday";

/** Muestra el cumpleaños del cliente (día y mes) y deja capturarlo o corregirlo. Solo si el cliente aceptó el contacto. */
export function CustomerBirthday({ customerId, month, day, consent, canEdit }: { customerId: string; month: number | null; day: number | null; consent: boolean; canEdit: boolean }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [m, setM] = useState(month ?? 1);
  const [d, setD] = useState(day ?? 1);
  const label = month && day ? `${day} ${MONTH_NAMES[es ? "es" : "en"][month - 1]}` : null;

  const save = (value: { month: number; day: number } | null) =>
    startTransition(async () => {
      try {
        await setCustomerBirthday(customerId, value);
        toast.success(value ? (es ? "Cumpleaños guardado" : "Birthday saved") : es ? "Cumpleaños borrado" : "Birthday cleared");
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast.error(getErrorMessage(e, es ? "No se pudo guardar" : "Couldn't save"));
      }
    });

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select aria-label={es ? "Mes" : "Month"} value={m} onChange={(e) => setM(Number(e.target.value))} className="rounded-md border border-slate-300 px-2 py-1">
          {MONTH_NAMES[es ? "es" : "en"].map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
        </select>
        <input aria-label={es ? "Día" : "Day"} type="number" min={1} max={31} value={d} onChange={(e) => setD(Number(e.target.value))} className="w-16 rounded-md border border-slate-300 px-2 py-1" />
        <Button type="button" size="sm" disabled={pending} onClick={() => save({ month: m, day: d })}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : es ? "Guardar" : "Save"}</Button>
        {month && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save(null)}>{es ? "Borrar" : "Clear"}</Button>}
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{es ? "Cancelar" : "Cancel"}</Button>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <Cake className="h-3.5 w-3.5" />
      {label ?? (es ? "Sin cumpleaños" : "No birthday")}
      {canEdit && consent && (
        <button type="button" onClick={() => setEditing(true)} className="font-medium text-brand-700 hover:underline">
          {label ? (es ? "Editar" : "Edit") : es ? "Agregar" : "Add"}
        </button>
      )}
    </span>
  );
}
