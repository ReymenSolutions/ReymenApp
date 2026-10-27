"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CustomFieldType } from "@prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { updateLeadColumns } from "@/actions/lead-columns";
import { createCustomField } from "@/actions/custom-fields";
import { DeleteCustomFieldDialog } from "@/components/portal/DeleteCustomFieldDialog";
import { getErrorMessage } from "@/lib/user-error";
import { BASE_COLUMNS, type BaseColumn, type LeadColumnPrefs } from "@/lib/lead-columns";

export interface ColumnField {
  id: string;
  key: string;
  label: string;
}

const BASE_LABEL: Record<BaseColumn, { es: string; en: string }> = {
  contact: { es: "Contacto", en: "Contact" },
  source: { es: "Origen", en: "Source" },
  status: { es: "Estado", en: "Status" },
  score: { es: "Score AI", en: "AI Score" },
  date: { es: "Fecha", en: "Date" },
};

const TYPES: { value: CustomFieldType; es: string; en: string }[] = [
  { value: "TEXT", es: "Texto", en: "Text" },
  { value: "NUMBER", es: "Número", en: "Number" },
  { value: "DATE", es: "Fecha", en: "Date" },
  { value: "SELECT", es: "Lista de opciones", en: "Choice list" },
  { value: "BOOLEAN", es: "Sí / No", en: "Yes / No" },
];

/** Engrane de la tabla de leads: elegir qué columnas ver (por usuario) y crear campos nuevos sin salir de la tabla. */
export function LeadColumnsGear({ prefs: serverPrefs, fields, canCreateField }: { prefs: LeadColumnPrefs; fields: ColumnField[]; canCreateField: boolean }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  // Estado local para que las casillas respondan al instante; se vuelve a alinear con lo guardado.
  const [prefs, setPrefs] = useState(serverPrefs);
  const [seen, setSeen] = useState(serverPrefs);
  if (serverPrefs !== seen) {
    setSeen(serverPrefs);
    setPrefs(serverPrefs);
  }
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; label: string; key: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("TEXT");
  const [options, setOptions] = useState("");

  function save(next: LeadColumnPrefs) {
    setPrefs(next);
    startTransition(async () => {
      try {
        await updateLeadColumns(next);
      } catch (e) {
        setPrefs(serverPrefs);
        toast.error(getErrorMessage(e, es ? "No se pudieron guardar las columnas" : "Couldn't save the columns"));
      }
    });
  }

  const toggleBase = (col: BaseColumn) =>
    save({ ...prefs, hidden: prefs.hidden.includes(col) ? prefs.hidden.filter((c) => c !== col) : [...prefs.hidden, col] });
  const toggleCustom = (key: string) =>
    save({ ...prefs, custom: prefs.custom.includes(key) ? prefs.custom.filter((k) => k !== key) : [...prefs.custom, key] });

  function add() {
    startTransition(async () => {
      try {
        const res = await createCustomField({ label, type, options });
        const next = { ...prefs, custom: [...prefs.custom, res.key] };
        setPrefs(next);
        await updateLeadColumns(next);
        setLabel("");
        setType("TEXT");
        setOptions("");
      } catch (e) {
        toast.error(getErrorMessage(e, es ? "No se pudo crear el campo" : "Couldn't create the field"));
      }
    });
  }

  const row = "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={es ? "Columnas de la tabla" : "Table columns"}
        aria-label={es ? "Columnas de la tabla" : "Table columns"}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-slate-800"
      >
        <Settings2 className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{es ? "Columnas de la tabla" : "Table columns"}</DialogTitle>
            <DialogDescription>
              {es ? "Elige qué ver en la tabla. Es solo para ti; el resto del equipo mantiene la suya." : "Choose what to see in the table. This is only for you; the rest of the team keeps theirs."}
            </DialogDescription>
          </DialogHeader>

          <div>
            <p className="mb-1 text-xs font-medium uppercase text-slate-500">{es ? "Columnas" : "Columns"}</p>
            <label className={`${row} opacity-60`}>
              <input type="checkbox" checked disabled /> {es ? "Nombre (siempre visible)" : "Name (always shown)"}
            </label>
            {BASE_COLUMNS.map((c) => (
              <label key={c} className={row}>
                <input type="checkbox" checked={!prefs.hidden.includes(c)} onChange={() => toggleBase(c)} />
                {BASE_LABEL[c][es ? "es" : "en"]}
              </label>
            ))}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase text-slate-500">{es ? "Campos personalizados" : "Custom fields"}</p>
            {fields.length === 0 ? (
              <p className="px-2 text-sm text-slate-400">{es ? "Aún no tienes campos personalizados." : "You have no custom fields yet."}</p>
            ) : (
              fields.map((f) => (
                <div key={f.key} className="flex items-center gap-1">
                  <label className={`${row} flex-1`}>
                    <input type="checkbox" checked={prefs.custom.includes(f.key)} onChange={() => toggleCustom(f.key)} />
                    {f.label}
                  </label>
                  {canCreateField && (
                    <button
                      type="button"
                      onClick={() => setDeleting({ id: f.id, label: f.label, key: f.key })}
                      title={es ? "Eliminar campo" : "Delete field"}
                      aria-label={es ? `Eliminar campo ${f.label}` : `Delete field ${f.label}`}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {canCreateField && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-800">{es ? "Agregar un campo" : "Add a field"}</p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (label.trim()) add(); } }}
                  placeholder={es ? "Nombre del campo" : "Field name"}
                  className="h-9 min-w-[10rem] flex-1 text-sm"
                  maxLength={60}
                />
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as CustomFieldType)}
                  aria-label={es ? "Tipo de campo" : "Field type"}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                >
                  {TYPES.map((tp) => <option key={tp.value} value={tp.value}>{tp[es ? "es" : "en"]}</option>)}
                </select>
              </div>
              {type === "SELECT" && (
                <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder={es ? "Opciones separadas por comas" : "Options separated by commas"} className="h-9 text-sm" />
              )}
              <div className="flex justify-end">
                <Button size="sm" onClick={add} disabled={pending || !label.trim()}>
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {es ? "Agregar y mostrar" : "Add and show"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <DeleteCustomFieldDialog
        field={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          if (deleting) setPrefs((p) => ({ ...p, custom: p.custom.filter((k) => k !== deleting.key) }));
          router.refresh();
        }}
      />
    </>
  );
}
