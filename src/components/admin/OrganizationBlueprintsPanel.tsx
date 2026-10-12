"use client";

import { useState, useTransition } from "react";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { enableBlueprint, setBlueprintDryRun, disableBlueprint, type BlueprintRow } from "@/actions/admin/blueprints";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

const COPY = {
  es: {
    title: "Automatizaciones (blueprints)",
    intro: "Automatizaciones listas del catálogo. Nacen en simulación (dry-run): registran a quién se habría contactado, sin enviar nada.",
    enable: "Habilitar",
    pause: "Pausar",
    resume: "Reanudar",
    dry: "Simulación",
    live: "Envío real",
    toLive: "Pasar a envío real",
    toDry: "Volver a simulación",
    confirmLive: "¿Pasar a envío real? Solo hazlo si el negocio ya tiene su aviso de privacidad y el canal de envío conectado.",
    overlapWarn: (names: string) => `Este cliente ya tiene instalada la plantilla de n8n «${names}», que hace un trabajo parecido. Con las dos en envío real el cliente podría recibir mensajes duplicados.`,
    overlapConfirm: "¿Confirmas que no se duplicarán (por ejemplo, ya desactivaste la plantilla)?",
    needs: "Requiere",
    last: "Última ejecución",
    never: "Aún sin ejecuciones",
    paused: "Pausada",
    error: "No se pudo completar",
    status: { DRY_RUN: "simuladas", SKIPPED: "omitidas", PENDING: "pendientes", DISPATCHED: "enviadas", SUCCEEDED: "exitosas", FAILED: "fallidas" } as Record<string, string>,
  },
  en: {
    title: "Automations (blueprints)",
    intro: "Ready-made automations from the catalog. They start in simulation (dry-run): they log who would have been contacted, without sending anything.",
    enable: "Enable",
    pause: "Pause",
    resume: "Resume",
    dry: "Simulation",
    live: "Live sending",
    toLive: "Switch to live sending",
    toDry: "Back to simulation",
    overlapWarn: (names: string) => `This client already has the n8n template “${names}” installed, which does a similar job. With both live the customer could get duplicate messages.`,
    overlapConfirm: "Do you confirm they will not be duplicated (e.g. you already turned the template off)?",
    confirmLive: "Switch to live sending? Only do this if the business already has its privacy notice and the sending channel connected.",
    needs: "Requires",
    last: "Last run",
    never: "No runs yet",
    paused: "Paused",
    error: "Couldn't complete",
    status: { DRY_RUN: "simulated", SKIPPED: "skipped", PENDING: "pending", DISPATCHED: "sent", SUCCEEDED: "succeeded", FAILED: "failed" } as Record<string, string>,
  },
};

export function OrganizationBlueprintsPanel({ orgId, blueprints }: { orgId: string; blueprints: BlueprintRow[] }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        toast.error(getErrorMessage(err, t.error));
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4" /> {t.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {blueprints.map((b) => {
          const inst = b.instance;
          const active = inst?.status === "ACTIVE";
          return (
            <div key={b.key} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{b.name}</span>
                <Badge variant="secondary">v{b.version}</Badge>
                {inst && (active ? <Badge variant={inst.dryRun ? "secondary" : "success"}>{inst.dryRun ? t.dry : t.live}</Badge> : <Badge variant="secondary">{t.paused}</Badge>)}
              </div>
              <p className="text-sm text-muted-foreground">{b.description}</p>
              <p className="text-xs text-muted-foreground">
                {t.needs}: {b.requiredModules.join(", ")}
              </p>
              {b.overlaps.length > 0 && (
                <p role="note" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  {t.overlapWarn(b.overlaps.map((o) => o.templateName).join(", "))}
                </p>
              )}
              {inst && (
                <p className="text-xs text-muted-foreground">
                  {Object.keys(inst.counts).length === 0
                    ? t.never
                    : Object.entries(inst.counts)
                        .map(([s, n]) => `${n} ${t.status[s] ?? s}`)
                        .join(" · ")}
                  {inst.lastRunAt ? ` — ${t.last}: ${new Date(inst.lastRunAt).toLocaleString(lang === "en" ? "en-US" : "es-MX")}` : ""}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {!inst && (
                  <Button size="sm" disabled={pending} onClick={() => run(b.key, () => enableBlueprint({ orgId, key: b.key }))}>
                    {busy === b.key && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} {t.enable}
                  </Button>
                )}
                {inst && active && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        if (inst.dryRun && !window.confirm(t.confirmLive)) return;
                        // Con una plantilla n8n parecida activa, pasar a envío real exige confirmar que no se duplicará.
                        const acknowledgeOverlap = inst.dryRun && b.overlaps.length > 0;
                        if (acknowledgeOverlap && !window.confirm(`${t.overlapWarn(b.overlaps.map((o) => o.templateName).join(", "))}\n\n${t.overlapConfirm}`)) return;
                        run(b.key, () => setBlueprintDryRun({ orgId, automationId: inst.id, dryRun: !inst.dryRun, acknowledgeOverlap }));
                      }}
                    >
                      {inst.dryRun ? t.toLive : t.toDry}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(b.key, () => disableBlueprint({ orgId, automationId: inst.id }))}>
                      {t.pause}
                    </Button>
                  </>
                )}
                {inst && !active && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(b.key, () => enableBlueprint({ orgId, key: b.key }))}>
                    {t.resume}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
