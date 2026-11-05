"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePreferences } from "@/context/preferences";
import { createPipeline, deletePipeline, renamePipeline, setDefaultPipeline } from "@/actions/pipeline-stages";
import { getErrorMessage } from "@/lib/user-error";
import { PipelineStagesPanel, type StageRow } from "./PipelineStagesPanel";

export interface PipelineRow {
  id: string;
  name: string;
  isDefault: boolean;
  stages: StageRow[];
}

/** Configuración de embudos: varios por negocio, cada uno con sus etapas. El principal recibe lo nuevo. */
export function PipelinesManager({ pipelines, canManage }: { pipelines: PipelineRow[]; canManage: boolean }) {
  const { lang } = usePreferences();
  const es = lang !== "en";
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>, error: string, done?: () => void) {
    startTransition(async () => {
      try {
        await fn();
        done?.();
      } catch (e) {
        toast.error(getErrorMessage(e, error));
      }
    });
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    run(() => createPipeline(name), es ? "No se pudo crear el embudo" : "Could not create the pipeline", () => {
      setNewName("");
      toast.success(es ? "Embudo creado" : "Pipeline created");
    });
  }

  function handleDelete(p: PipelineRow) {
    if (!confirm(es ? `¿Eliminar el embudo «${p.name}»?` : `Delete the "${p.name}" pipeline?`)) return;
    run(() => deletePipeline(p.id), es ? "No se pudo eliminar" : "Could not delete");
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        {es
          ? "Usa un embudo por cada proceso de venta (por ejemplo: ventas nuevas, renovaciones, postventa). Las oportunidades nuevas caen en el embudo principal. Cuando una oportunidad llega a una etapa, el contacto pasa al estado que elijas; el estado solo avanza."
          : "Use one pipeline per sales process (e.g. new sales, renewals, after-sales). New opportunities go to the main pipeline. When an opportunity reaches a stage, the contact moves to the status you choose; status only moves forward."}
      </p>

      {pipelines.map((p) => {
        const opportunityCount = p.stages.reduce((sum, s) => sum + s.opportunityCount, 0);
        return (
          <section key={p.id} className="rounded-lg border border-slate-200 p-3" data-testid="pipeline-config">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {canManage ? (
                <Input
                  defaultValue={p.name}
                  aria-label={es ? "Nombre del embudo" : "Pipeline name"}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== p.name) run(() => renamePipeline(p.id, v), es ? "No se pudo renombrar" : "Could not rename");
                  }}
                  className="h-8 max-w-xs text-sm font-semibold"
                  disabled={isPending}
                />
              ) : (
                <h3 className="text-sm font-semibold text-slate-900">{p.name}</h3>
              )}
              {p.isDefault && <Badge className="text-xs">{es ? "Principal" : "Main"}</Badge>}
              <span className="text-xs text-slate-400">{es ? `${opportunityCount} oportunidades` : `${opportunityCount} opportunities`}</span>
              {canManage && (
                <div className="ml-auto flex items-center gap-1">
                  {!p.isDefault && (
                    <button type="button" onClick={() => run(() => setDefaultPipeline(p.id), es ? "No se pudo actualizar" : "Could not update")} disabled={isPending} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-brand-600">
                      <Star className="h-3.5 w-3.5" />
                      {es ? "Hacer principal" : "Make main"}
                    </button>
                  )}
                  {!p.isDefault && (
                    <button type="button" onClick={() => handleDelete(p)} disabled={isPending} aria-label={es ? "Eliminar embudo" : "Delete pipeline"} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <PipelineStagesPanel stages={p.stages} canManage={canManage} pipelineId={p.id} showHelp={false} />
          </section>
        );
      })}

      {canManage && (
        <div className="flex gap-1.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
            placeholder={es ? "Nuevo embudo (ej. Renovaciones)" : "New pipeline (e.g. Renewals)"}
            aria-label={es ? "Nuevo embudo" : "New pipeline"}
            className="h-9 max-w-xs text-sm"
          />
          <Button size="sm" variant="outline" onClick={handleCreate} disabled={isPending || !newName.trim()}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {es ? "Crear embudo" : "Create pipeline"}
          </Button>
        </div>
      )}
    </div>
  );
}
