"use client";

import { useState, useTransition } from "react";
import { Archive, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import Link from "next/link";
import { createBranch, renameBranch, setBranchActive } from "@/actions/branches";
import { setInventoryPerBranch, setMenuPerBranch } from "@/actions/branch-menu";
import { getErrorMessage } from "@/lib/user-error";

interface BranchRow {
  id: string;
  name: string;
  isActive: boolean;
}

/** Sucursales del negocio. La "Principal" siempre existe; aquí se agregan las demás. */
export function BranchesPanel({ branches, canManage, max, menuPerBranch, inventoryPerBranch }: { branches: BranchRow[]; canManage: boolean; max: number; menuPerBranch: boolean; inventoryPerBranch: boolean }) {
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
      {active.length > 0 && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <label className="flex items-start justify-between gap-4">
            <span className="text-sm text-slate-700">
              <span className="block font-medium text-slate-900">{es ? "Menú por sucursal" : "Menu per branch"}</span>
              {es
                ? "Apagado: todas las sucursales venden el mismo menú y precios. Encendido: cada sucursal puede ocultar platillos y fijar sus precios."
                : "Off: every branch sells the same menu and prices. On: each branch can hide dishes and set its own prices."}
            </span>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
              checked={menuPerBranch}
              disabled={!canManage || pending}
              onChange={(e) => run(() => setMenuPerBranch(e.target.checked), es ? "No se pudo guardar" : "Couldn't save")}
            />
          </label>
          <label className="flex items-start justify-between gap-4 border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-700">
              <span className="block font-medium text-slate-900">{es ? "Inventario por sucursal" : "Inventory per branch"}</span>
              {es
                ? "Apagado: un solo inventario. Encendido: cada sucursal lleva sus propias existencias (la Principal conserva las actuales y las demás empiezan en 0), las ventas descuentan de la sucursal que vendió y hay traspasos entre sucursales. Proveedores y costos son los mismos."
                : "Off: a single inventory. On: each branch keeps its own stock (Main keeps the current one, the others start at 0), sales deduct from the selling branch and there are transfers between branches. Suppliers and costs are shared."}
            </span>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
              checked={inventoryPerBranch}
              disabled={!canManage || pending}
              onChange={(e) => run(() => setInventoryPerBranch(e.target.checked), es ? "No se pudo guardar" : "Couldn't save")}
            />
          </label>
          {menuPerBranch && (
            <Link href="/portal/food/branch-menu" className="inline-block text-sm font-medium text-brand-700 hover:underline">
              {es ? "Configurar el menú de cada sucursal →" : "Set up each branch's menu →"}
            </Link>
          )}
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
