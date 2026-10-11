"use client";

import { useState, useTransition } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePreferences } from "@/context/preferences";
import {
  createPipelineStage, updatePipelineStage, swapPipelineStageOrder, deletePipelineStage,
} from "@/actions/pipeline-stages";
import { getErrorMessage } from "@/lib/user-error";
import type { LeadStatus } from "@prisma/client";

interface StageRow {
  id: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  leadStatus: LeadStatus | null;
  opportunityCount: number;
}

const STATUS_LABEL: Record<LeadStatus, { es: string; en: string }> = {
  NEW: { es: "Nuevo", en: "New" },
  CONTACTED: { es: "Contactado", en: "Contacted" },
  QUALIFIED: { es: "Calificado", en: "Qualified" },
  PROPOSAL: { es: "Propuesta", en: "Proposal" },
  WON: { es: "Ganado", en: "Won" },
  LOST: { es: "Perdido", en: "Lost" },
};

export function PipelineStagesPanel({ stages, canManage }: { stages: StageRow[]; canManage: boolean }) {
  const { lang } = usePreferences();
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleRename(stageId: string, name: string) {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        await updatePipelineStage({ stageId, name: name.trim() });
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al renombrar" : "Error renaming")));
      }
    });
  }

  function handleToggle(stageId: string, field: "isWon" | "isLost", value: boolean) {
    startTransition(async () => {
      try {
        await updatePipelineStage({ stageId, [field]: value });
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al actualizar" : "Error updating")));
      }
    });
  }

  function handleLeadStatus(stageId: string, value: string) {
    startTransition(async () => {
      try {
        await updatePipelineStage({ stageId, leadStatus: value === "" ? null : (value as LeadStatus) });
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al actualizar" : "Error updating")));
      }
    });
  }

  function handleMove(stageId: string, direction: -1 | 1) {
    const index = stages.findIndex((s) => s.id === stageId);
    const target = stages[index + direction];
    if (!target) return;
    startTransition(async () => {
      try {
        await swapPipelineStageOrder(stageId, target.id);
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al reordenar" : "Error reordering")));
      }
    });
  }

  function handleDelete(stageId: string, opportunityCount: number) {
    if (opportunityCount > 0) {
      toast.error(lang === "es" ? "No se puede eliminar una etapa con oportunidades activas" : "Cannot delete a stage with active opportunities");
      return;
    }
    if (!confirm(lang === "es" ? "¿Eliminar esta etapa?" : "Delete this stage?")) return;
    startTransition(async () => {
      try {
        await deletePipelineStage(stageId);
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al eliminar" : "Error deleting")));
      }
    });
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await createPipelineStage({ name });
        setNewName("");
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al crear etapa" : "Error creating stage")));
      }
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {lang === "es"
          ? "Cuando una oportunidad llega a una etapa, el contacto pasa al estado que elijas aquí. El estado solo avanza (no retrocede) y un contacto sin más oportunidades abiertas se marca perdido al perder la última."
          : "When an opportunity reaches a stage, the contact moves to the status you choose here. Status only moves forward (never back), and a contact is marked lost when its last open opportunity is lost."}
      </p>
      {stages.map((stage, i) => (
        <div key={stage.id} className="flex items-center gap-2 rounded-md border border-slate-100 p-2">
          {canManage ? (
            <Input
              defaultValue={stage.name}
              onBlur={(e) => e.target.value !== stage.name && handleRename(stage.id, e.target.value)}
              className="h-8 flex-1 text-sm"
              disabled={isPending}
            />
          ) : (
            <span className="flex-1 text-sm font-medium text-slate-900">{stage.name}</span>
          )}

          <label className="flex items-center gap-1 text-xs text-slate-500">
            <span className="hidden sm:inline">{lang === "es" ? "El contacto pasa a:" : "Contact becomes:"}</span>
            <select
              value={stage.leadStatus ?? ""}
              onChange={(e) => handleLeadStatus(stage.id, e.target.value)}
              disabled={!canManage || isPending}
              aria-label={lang === "es" ? "Estado del contacto al llegar a esta etapa" : "Contact status on reaching this stage"}
              className="h-8 rounded-md border border-slate-200 bg-white px-1.5 text-xs text-slate-700 disabled:opacity-60"
            >
              <option value="">{lang === "es" ? "(sin cambio)" : "(no change)"}</option>
              {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((v) => (
                <option key={v} value={v}>{STATUS_LABEL[v][lang === "es" ? "es" : "en"]}</option>
              ))}
            </select>
          </label>

          {stage.isWon && <Badge variant="success" className="text-xs">{lang === "es" ? "Ganado" : "Won"}</Badge>}
          {stage.isLost && <Badge variant="destructive" className="text-xs">{lang === "es" ? "Perdido" : "Lost"}</Badge>}

          {canManage && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => handleToggle(stage.id, "isWon", !stage.isWon)}
                disabled={isPending}
                className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-50 hover:text-emerald-600"
                title={lang === "es" ? "Marcar como ganado" : "Mark as won"}
              >
                {lang === "es" ? "G" : "W"}
              </button>
              <button
                onClick={() => handleToggle(stage.id, "isLost", !stage.isLost)}
                disabled={isPending}
                className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-50 hover:text-red-600"
                title={lang === "es" ? "Marcar como perdido" : "Mark as lost"}
              >
                {lang === "es" ? "P" : "L"}
              </button>
              <button onClick={() => handleMove(stage.id, -1)} disabled={isPending || i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-50 disabled:opacity-30">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => handleMove(stage.id, 1)} disabled={isPending || i === stages.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-50 disabled:opacity-30">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(stage.id, stage.opportunityCount)}
                disabled={isPending}
                className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      ))}

      {canManage && (
        <div className="flex gap-1.5 pt-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
            placeholder={lang === "es" ? "Nueva etapa..." : "New stage..."}
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" onClick={handleCreate} disabled={isPending || !newName.trim()}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}
    </div>
  );
}
