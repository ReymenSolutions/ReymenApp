"use client";

import { useState, useTransition } from "react";
import { Loader2, Layers, Check, Ban, Clock3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { setOrganizationModule, syncModulesToPlan, type ModuleEntitlementView } from "@/actions/admin/modules";
import { usePreferences } from "@/context/preferences";
import type { ModuleSource, ModuleStatus, PlatformModule } from "@prisma/client";
import { getErrorMessage } from "@/lib/user-error";
import { getModuleLabel } from "@/lib/modules";


// MARKETING_ADS is reserved for a future module — no functionality exists
// behind it yet, so it's shown but can't be toggled on here. NFC_QR used to
// be reserved too, but the SmartCard SSO bridge (src/app/(portal)/portal/
// smartcard/route.ts, gated on requireModule(..., "NFC_QR")) is real and
// working now — it just needs to be toggle-able here for an admin to grant it.
const RESERVED_MODULES: PlatformModule[] = ["MARKETING_ADS"];

const STATUS_BADGE_ES: Record<ModuleStatus, { variant: "success" | "secondary" | "destructive"; icon: typeof Check; label: string }> = {
  ACTIVE: { variant: "success", icon: Check, label: "Activo" },
  SUSPENDED: { variant: "secondary", icon: Clock3, label: "Suspendido" },
  CANCELLED: { variant: "destructive", icon: Ban, label: "Cancelado" },
};

// Opción para quitar el módulo por completo (queda como "sin habilitar", igual que uno que nunca se contrató).
const NOT_ENABLED_LABEL = { es: "Sin habilitar", en: "Not enabled" } as const;

const STATUS_BADGE_EN: Record<ModuleStatus, { variant: "success" | "secondary" | "destructive"; icon: typeof Check; label: string }> = {
  ACTIVE: { variant: "success", icon: Check, label: "Active" },
  SUSPENDED: { variant: "secondary", icon: Clock3, label: "Suspended" },
  CANCELLED: { variant: "destructive", icon: Ban, label: "Cancelled" },
};

export function OrganizationModulesPanel({
  orgId,
  modules,
  planLabel,
  planModules,
}: {
  orgId: string;
  modules: ModuleEntitlementView[];
  planLabel: string;
  planModules: PlatformModule[];
}) {
  const { lang } = usePreferences();
  const MODULE_LABEL = getModuleLabel(lang);
  const STATUS_BADGE = lang === "es" ? STATUS_BADGE_ES : STATUS_BADGE_EN;
  const [editing, setEditing] = useState<PlatformModule | null>(null);
  const [status, setStatus] = useState<ModuleStatus | "NOT_ENABLED">("ACTIVE");
  const [source, setSource] = useState<ModuleSource>("SUBSCRIBED");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);

  const missingFromPlan = planModules.filter(
    (m) => !modules.find((entry) => entry.module === m && entry.status === "ACTIVE")
  );

  function handleSync() {
    setSyncing(true);
    startTransition(async () => {
      try {
        const result = await syncModulesToPlan(orgId);
        if (result.activatedModules.length === 0) {
          toast.success(lang === "es" ? "Los módulos ya coinciden con el plan actual" : "Modules already match the current plan");
        } else {
          toast.success(lang === "es" ? `Activado: ${result.activatedModules.join(", ")}` : `Activated: ${result.activatedModules.join(", ")}`);
        }
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al sincronizar módulos" : "Error syncing modules")));
      } finally {
        setSyncing(false);
      }
    });
  }

  function openDialog(m: ModuleEntitlementView) {
    setEditing(m.module);
    setStatus(m.status ?? "ACTIVE");
    setSource(m.source ?? "ADMIN_GRANTED");
    setNotes(m.notes ?? "");
  }

  function handleSave() {
    if (!editing) return;
    startTransition(async () => {
      try {
        await setOrganizationModule({ orgId, module: editing, status, source, notes: notes || undefined });
        toast.success(lang === "es" ? `Módulo "${MODULE_LABEL[editing]}" actualizado` : `Module "${MODULE_LABEL[editing]}" updated`);
        setEditing(null);
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al actualizar el módulo" : "Error updating the module")));
      }
    });
  }

  return (
    <>
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{lang === "es" ? "Módulos contratados" : "Contracted modules"}</CardTitle>
            <p className="mt-0.5 text-xs text-slate-400">
              {lang === "es" ? "Plan" : "Plan"} {planLabel} {lang === "es" ? "incluye" : "includes"}: {planModules.map((m) => MODULE_LABEL[m]).join(", ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {missingFromPlan.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {lang === "es" ? "Sincronizar con plan" : "Sync with plan"}
              </Button>
            )}
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-100">
            {modules.map((m) => {
              const reserved = RESERVED_MODULES.includes(m.module);
              const badge = m.status ? STATUS_BADGE[m.status] : null;
              const includedInPlan = planModules.includes(m.module);
              return (
                <div key={m.module} className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-slate-900">{MODULE_LABEL[m.module]}</p>
                      {includedInPlan && !reserved && (
                        <Badge variant="info" className="text-xs">{lang === "es" ? "Incluido en el plan" : "Included in plan"}</Badge>
                      )}
                    </div>
                    {reserved ? (
                      <p className="text-xs text-slate-400">{lang === "es" ? "Reservado — sin funcionalidad propia todavía" : "Reserved — no functionality of its own yet"}</p>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {m.source === "ADMIN_GRANTED"
                          ? (lang === "es" ? "Asignado por Reymen" : "Granted by Reymen")
                          : m.source === "SUBSCRIBED"
                          ? (lang === "es" ? "Suscrito" : "Subscribed")
                          : (lang === "es" ? "Sin habilitar" : "Not enabled")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {badge ? (
                      <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">{lang === "es" ? "Sin habilitar" : "Not enabled"}</Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reserved}
                      onClick={() => openDialog(m)}
                    >
                      {lang === "es" ? "Gestionar" : "Manage"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? MODULE_LABEL[editing] : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <span id="mod-status-label" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{lang === "es" ? "Estado" : "Status"}</span>
              <div role="radiogroup" aria-labelledby="mod-status-label" className="flex flex-wrap gap-2">
                {(["ACTIVE", "SUSPENDED", "CANCELLED", "NOT_ENABLED"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={status === s}
                    onClick={() => setStatus(s)}
                    className={`flex-1 rounded-md border-2 px-3 py-2 text-xs font-medium transition-colors ${
                      status === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {s === "NOT_ENABLED" ? NOT_ENABLED_LABEL[lang === "es" ? "es" : "en"] : STATUS_BADGE[s].label}
                  </button>
                ))}
              </div>
            </div>

            {status === "NOT_ENABLED" ? (
              <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                {lang === "es"
                  ? "El módulo se quita por completo: el cliente deja de verlo y vuelve a \"Sin habilitar\", como si nunca se hubiera contratado. Se puede volver a activar cuando quieras."
                  : "The module is removed entirely: the client stops seeing it and it goes back to \"Not enabled\", as if it was never contracted. You can activate it again any time."}
              </p>
            ) : (<>
            <div>
              <span id="mod-source-label" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{lang === "es" ? "Origen" : "Source"}</span>
              <div role="radiogroup" aria-labelledby="mod-source-label" className="flex gap-2">
                {(["SUBSCRIBED", "ADMIN_GRANTED"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={source === s}
                    onClick={() => setSource(s)}
                    className={`flex-1 rounded-md border-2 px-3 py-2 text-xs font-medium transition-colors ${
                      source === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {s === "SUBSCRIBED"
                      ? (lang === "es" ? "Suscrito (plan pago)" : "Subscribed (paid plan)")
                      : (lang === "es" ? "Asignado por Reymen" : "Granted by Reymen")}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="module-notes" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {lang === "es" ? "Notas internas (solo visible para admins)" : "Internal notes (only visible to admins)"}
              </label>
              <textarea
                id="module-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder={lang === "es" ? "Ej: cortesía de prueba por 30 días, suspendido por falta de pago…" : "E.g.: 30-day trial courtesy, suspended for non-payment…"}
              />
            </div>
            </>)}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
