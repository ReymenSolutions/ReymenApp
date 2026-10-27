"use client";

import { useState, useTransition } from "react";
import { Archive, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CustomFieldType } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePreferences } from "@/context/preferences";
import { createCustomField, setCustomFieldActive, updateCustomField } from "@/actions/custom-fields";
import { DeleteCustomFieldDialog } from "@/components/portal/DeleteCustomFieldDialog";
import { getErrorMessage } from "@/lib/user-error";

interface FieldRow {
  id: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  isActive: boolean;
}

const TYPE_LABEL: Record<CustomFieldType, { es: string; en: string }> = {
  TEXT: { es: "Texto", en: "Text" },
  NUMBER: { es: "Número", en: "Number" },
  DATE: { es: "Fecha", en: "Date" },
  SELECT: { es: "Lista de opciones", en: "Choice list" },
  BOOLEAN: { es: "Sí / No", en: "Yes / No" },
};

const SUGGESTIONS: { es: string; en: string; type: CustomFieldType; options?: { es: string; en: string } }[] = [
  { es: "Fecha de nacimiento", en: "Date of birth", type: "DATE" },
  { es: "Aseguradora", en: "Insurer", type: "TEXT" },
  { es: "Tratamiento de interés", en: "Treatment of interest", type: "TEXT" },
  { es: "Alergias", en: "Allergies", type: "TEXT" },
  { es: "Empresa", en: "Company", type: "TEXT" },
  { es: "Cómo nos conoció", en: "How they found us", type: "SELECT", options: { es: "Recomendación, Redes sociales, Google, Otro", en: "Referral, Social media, Google, Other" } },
  { es: "Acepta promociones", en: "Accepts promotions", type: "BOOLEAN" },
];

/** Configuración de los campos propios del cliente para sus contactos. */
export function CustomFieldsPanel({ fields, canManage, max }: { fields: FieldRow[]; canManage: boolean; max: number }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("TEXT");
  const [options, setOptions] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  // Campo que se está por eliminar (la confirmación cuenta cuántos contactos tienen dato en él).
  const [deleting, setDeleting] = useState<FieldRow | null>(null);

  const active = fields.filter((f) => f.isActive);
  const archived = fields.filter((f) => !f.isActive);
  const full = fields.length >= max;
  const taken = new Set(active.map((f) => f.label.toLowerCase()));

  function run(fn: () => Promise<unknown>, errorFallback: string, after?: () => void) {
    startTransition(async () => {
      try {
        await fn();
        after?.();
      } catch (e) {
        toast.error(getErrorMessage(e, errorFallback));
      }
    });
  }

  function add() {
    run(
      () => createCustomField({ label, type, options }),
      es ? "No se pudo crear el campo" : "Couldn't create the field",
      () => {
        setLabel("");
        setType("TEXT");
        setOptions("");
      }
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {es
          ? "Datos propios de tu negocio que quieres guardar de cada contacto (por ejemplo, la aseguradora de un paciente). Aparecen en la ficha del contacto y en la exportación."
          : "Your own business data to keep for each contact (for example, a patient's insurer). They show in the contact's page and in the export."}
      </p>

      {active.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 p-3 text-sm text-slate-400">{es ? "Aún no tienes campos." : "You have no fields yet."}</p>
      ) : (
        <ul className="space-y-2">
          {active.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 p-2">
              {canManage ? (
                <Input
                  defaultValue={f.label}
                  aria-label={es ? "Nombre del campo" : "Field name"}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== f.label && run(() => updateCustomField({ fieldId: f.id, label: e.target.value }), es ? "No se pudo renombrar" : "Couldn't rename")}
                  className="h-8 min-w-[10rem] flex-1 text-sm"
                  disabled={pending}
                />
              ) : (
                <span className="flex-1 text-sm font-medium text-slate-900">{f.label}</span>
              )}
              <Badge variant="secondary" className="text-xs">{TYPE_LABEL[f.type][es ? "es" : "en"]}</Badge>
              {f.type === "SELECT" &&
                (canManage ? (
                  <Input
                    defaultValue={f.options.join(", ")}
                    aria-label={es ? "Opciones (separadas por comas)" : "Options (comma separated)"}
                    onBlur={(e) => e.target.value !== f.options.join(", ") && run(() => updateCustomField({ fieldId: f.id, options: e.target.value }), es ? "No se pudieron guardar las opciones" : "Couldn't save the options")}
                    className="h-8 w-full text-xs sm:w-72"
                    disabled={pending}
                  />
                ) : (
                  <span className="text-xs text-slate-500">{f.options.join(", ")}</span>
                ))}
              {canManage && (
                <button
                  onClick={() => run(() => setCustomFieldActive(f.id, false), es ? "No se pudo archivar" : "Couldn't archive")}
                  disabled={pending}
                  className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                  title={es ? "Archivar (se oculta, los datos se conservan)" : "Archive (hidden, data is kept)"}
                  aria-label={es ? "Archivar campo" : "Archive field"}
                >
                  <Archive className="h-4 w-4" />
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => setDeleting(f)}
                  disabled={pending}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title={es ? "Eliminar campo" : "Delete field"}
                  aria-label={es ? `Eliminar campo ${f.label}` : `Delete field ${f.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">{es ? "Agregar un campo" : "Add a field"}</p>
          {!full && active.length < SUGGESTIONS.length + 1 && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.filter((s) => !taken.has(s[es ? "es" : "en"].toLowerCase())).map((s) => (
                <button
                  key={s.en}
                  type="button"
                  onClick={() => {
                    setLabel(s[es ? "es" : "en"]);
                    setType(s.type);
                    setOptions(s.options?.[es ? "es" : "en"] ?? "");
                  }}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700"
                >
                  + {s[es ? "es" : "en"]}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder={es ? "Nombre del campo (ej. Aseguradora)" : "Field name (e.g. Insurer)"}
              className="h-9 min-w-[12rem] flex-1 text-sm"
              maxLength={60}
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldType)}
              aria-label={es ? "Tipo de campo" : "Field type"}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
            >
              {(Object.keys(TYPE_LABEL) as CustomFieldType[]).map((tp) => (
                <option key={tp} value={tp}>{TYPE_LABEL[tp][es ? "es" : "en"]}</option>
              ))}
            </select>
          </div>
          {type === "SELECT" && (
            <Input
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={es ? "Opciones separadas por comas (ej. GNP, AXA, Metlife)" : "Options separated by commas (e.g. GNP, AXA, Metlife)"}
              className="h-9 text-sm"
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">{full ? (es ? `Llegaste al máximo de ${max} campos.` : `You reached the ${max}-field limit.`) : `${fields.length} / ${max}`}</p>
            <Button size="sm" onClick={add} disabled={pending || full || !label.trim()}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {es ? "Agregar" : "Add"}
            </Button>
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
            {showArchived ? (es ? "Ocultar archivados" : "Hide archived") : es ? `Ver archivados (${archived.length})` : `Show archived (${archived.length})`}
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-1.5">
              {archived.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-500">
                  <span className="flex-1">{f.label}</span>
                  {canManage && (
                    <button
                      onClick={() => run(() => setCustomFieldActive(f.id, true), es ? "No se pudo reactivar" : "Couldn't restore")}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-white hover:text-slate-800"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {es ? "Reactivar" : "Restore"}
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => setDeleting(f)}
                      disabled={pending}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title={es ? "Eliminar campo" : "Delete field"}
                      aria-label={es ? `Eliminar campo ${f.label}` : `Delete field ${f.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <DeleteCustomFieldDialog field={deleting} onClose={() => setDeleting(null)} archiveHint={false} />
    </div>
  );
}
