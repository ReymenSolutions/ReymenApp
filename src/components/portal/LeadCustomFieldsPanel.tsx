"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CustomFieldType } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { updateLeadCustomFields } from "@/actions/custom-fields";
import { getErrorMessage } from "@/lib/user-error";

interface FieldRow {
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  /** Valor ya convertido a texto para el campo ("true"/"false" en Sí/No). */
  value: string;
}

/** Datos adicionales de un contacto: un campo por cada campo personalizado del cliente. */
export function LeadCustomFieldsPanel({ leadId, fields, canEdit }: { leadId: string; fields: FieldRow[]; canEdit: boolean }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const [saved, setSaved] = useState<Record<string, string>>(values);
  const [pending, startTransition] = useTransition();
  const dirty = fields.some((f) => values[f.key] !== saved[f.key]);

  function save() {
    startTransition(async () => {
      try {
        await updateLeadCustomFields(leadId, values);
        setSaved(values);
        toast.success(es ? "Datos guardados" : "Saved");
        router.refresh();
      } catch (e) {
        toast.error(getErrorMessage(e, es ? "No se pudieron guardar los datos" : "Couldn't save"));
      }
    });
  }

  const inputClass = "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <label key={f.key} className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">{f.label}</span>
          {f.type === "SELECT" || f.type === "BOOLEAN" ? (
            <select value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} disabled={!canEdit || pending} className={inputClass}>
              <option value="">—</option>
              {f.type === "BOOLEAN" ? (
                <>
                  <option value="true">{es ? "Sí" : "Yes"}</option>
                  <option value="false">No</option>
                </>
              ) : (
                <>
                  {/* Si el valor guardado ya no está en la lista (se cambiaron las opciones), se sigue mostrando. */}
                  {values[f.key] && !f.options.includes(values[f.key]) && <option value={values[f.key]}>{values[f.key]}</option>}
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </>
              )}
            </select>
          ) : (
            <Input
              type={f.type === "DATE" ? "date" : f.type === "NUMBER" ? "number" : "text"}
              step={f.type === "NUMBER" ? "any" : undefined}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              disabled={!canEdit || pending}
              maxLength={f.type === "TEXT" ? 500 : undefined}
              className="h-9 text-sm"
            />
          )}
        </label>
      ))}
      {canEdit && (
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {es ? "Guardar datos" : "Save"}
        </Button>
      )}
    </div>
  );
}
