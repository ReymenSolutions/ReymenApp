"use client";

import { useState, useTransition } from "react";
import { Archive, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { createBranch, renameBranch, setBranchActive } from "@/actions/branches";
import { getErrorMessage } from "@/lib/user-error";

interface BranchRow {
  id: string;
  name: string;
  isActive: boolean;
}

/** Sucursales del negocio. La "Principal" siempre existe; aquí se agregan las demás. */
export function BranchesPanel({ branches, canManage, max }: { branches: BranchRow[]; canManage: boolean; max: number }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const active = branches.filter((b) => b.isActive);
  const archived = branches.filter((b) => !b.isActive);

  function run(fn: () => Promise<unknown>, fallback: string, after?: () => void) {
    startTransition(async () => {
      try {
        await fn();
        after?.();
      } catch (e) {
        toast.error(getErrorMessage(e, fallback));
      }
    });
  }

  const add = () => run(() => createBranch(name), es ? "No se pudo crear la sucursal" : "Couldn't create the branch", () => setName(""));

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {es
          ? "Cada caja del POS se asocia a una sucursal para que sus ventas se vean por separado (y también todas juntas). Lo que ya vendías queda en la sucursal Principal."
          : "Each POS register is linked to a branch so its sales can be seen separately (and all together). What you already sold stays in the Main branch."}
      </p>
      <ul className="space-y-2">
        <li className="flex items-center gap-2 rounded-md border border-slate-100 p-2 text-sm font-medium text-slate-900">
          {es ? "Principal" : "Main"} <span className="text-xs font-normal text-slate-400">{es ? "(siempre existe)" : "(always exists)"}</span>
        </li>
        {active.map((b) => (
          <li key={b.id} className="flex items-center gap-2 rounded-md border border-slate-100 p-2">
            {canManage ? (
              <Input
                defaultValue={b.name}
                aria-label={es ? "Nombre de la sucursal" : "Branch name"}
                onBlur={(e) => e.target.value.trim() && e.target.value !== b.name && run(() => renameBranch(b.id, e.target.value), es ? "No se pudo renombrar" : "Couldn't rename")}
                className="h-8 flex-1 text-sm"
                disabled={pending}
              />
            ) : (
              <span className="flex-1 text-sm font-medium text-slate-900">{b.name}</span>
            )}
            {canManage && (
              <button
                onClick={() => run(() => setBranchActive(b.id, false), es ? "No se pudo archivar" : "Couldn't archive")}
                disabled={pending}
                className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                title={es ? "Archivar (sus ventas se conservan)" : "Archive (its sales are kept)"}
                aria-label={es ? "Archivar sucursal" : "Archive branch"}
              >
                <Archive className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (name.trim()) add(); } }}
            placeholder={es ? "Nueva sucursal (ej. Centro)" : "New branch (e.g. Downtown)"}
            className="h-9 min-w-[12rem] flex-1 text-sm"
            maxLength={60}
          />
          <Button size="sm" onClick={add} disabled={pending || !name.trim() || branches.length >= max}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {es ? "Agregar" : "Add"}
          </Button>
        </div>
      )}
      {archived.length > 0 && (
        <ul className="space-y-1.5">
          {archived.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm text-slate-500">
              <span className="flex-1">{b.name} · {es ? "archivada" : "archived"}</span>
              {canManage && (
                <button
                  onClick={() => run(() => setBranchActive(b.id, true), es ? "No se pudo reactivar" : "Couldn't restore")}
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-white hover:text-slate-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {es ? "Reactivar" : "Restore"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
