"use client";

import { useState, useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { previewClientResetAction, resetClientDataAction } from "@/actions/admin/client-reset";
import type { ClientResetSummary } from "@/lib/client-reset";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

const COPY = {
  es: {
    title: "Dejar como nuevo (borrar datos de prueba)",
    intro: "Borra todo lo que se generó al probar y deja el negocio listo para entregar. No se puede deshacer.",
    deletes: "Se borra: contactos, oportunidades, tareas, citas, conversaciones; clientes y Lealtad (integrantes, visitas, recompensas); ventas, compras, movimientos de inventario, comandas, cortes y delivery; historial de automatizaciones. Las existencias quedan en 0.",
    keeps: "Se conserva: usuarios, módulos y plan; menú, recetas, modificadores, insumos, proveedores, gastos fijos y sucursales; embudos, reglas y configuración; programa de Lealtad; automatizaciones, agentes y base de conocimiento; facturación y bitácora.",
    review: "Revisar qué se borraría",
    rows: (s: ClientResetSummary) => [
      ["Contactos", s.leads], ["Oportunidades", s.opportunities], ["Tareas", s.tasks], ["Citas", s.appointments],
      ["Conversaciones", s.conversations], ["Mensajes", s.messages], ["Clientes", s.customers], ["Integrantes de Lealtad", s.loyaltyMembers],
      ["Visitas de Lealtad", s.loyaltyVisits], ["Ventas", s.sales], ["Compras", s.purchases], ["Movimientos de inventario", s.inventoryMovements],
      ["Ejecuciones de automatizaciones", s.automationRuns], ["Insumos con existencia (quedan en 0)", s.stockItems],
    ] as [string, number][],
    nothing: "No hay datos de operación: el negocio ya está como nuevo.",
    action: "Dejar como nuevo",
    confirmTitle: "Confirmar: dejar como nuevo",
    confirmText: (name: string) => `Escribe el nombre exacto del negocio («${name}») para confirmar. Se borra todo lo de arriba, no se puede deshacer y queda en la bitácora.`,
    before: "Antes: en cada tablet o caja del POS borra los datos de la app (Ajustes → Apps → Reymen POS → Almacenamiento → Borrar datos), para que no vuelva a enviar ventas de prueba pendientes.",
    cancel: "Cancelar",
    confirm: "Borrar y dejar como nuevo",
    done: "Listo: el negocio quedó como nuevo",
    error: "No se pudo completar",
  },
  en: {
    title: "Reset as new (delete test data)",
    intro: "Deletes everything generated while testing and leaves the business ready to hand over. This can't be undone.",
    deletes: "Deleted: contacts, opportunities, tasks, appointments, conversations; customers and Loyalty (members, visits, rewards); sales, purchases, inventory movements, kitchen tickets, shift closes and delivery; automation history. Stock is set to 0.",
    keeps: "Kept: users, modules and plan; menu, recipes, modifiers, inventory items, suppliers, fixed costs and branches; pipelines, rules and settings; Loyalty program; automations, agents and knowledge base; billing and audit log.",
    review: "Review what would be deleted",
    rows: (s: ClientResetSummary) => [
      ["Contacts", s.leads], ["Opportunities", s.opportunities], ["Tasks", s.tasks], ["Appointments", s.appointments],
      ["Conversations", s.conversations], ["Messages", s.messages], ["Customers", s.customers], ["Loyalty members", s.loyaltyMembers],
      ["Loyalty visits", s.loyaltyVisits], ["Sales", s.sales], ["Purchases", s.purchases], ["Inventory movements", s.inventoryMovements],
      ["Automation runs", s.automationRuns], ["Items with stock (set to 0)", s.stockItems],
    ] as [string, number][],
    nothing: "No operational data: the business is already like new.",
    action: "Reset as new",
    confirmTitle: "Confirm: reset as new",
    confirmText: (name: string) => `Type the exact business name ("${name}") to confirm. Everything above is deleted, this can't be undone and it's recorded in the audit log.`,
    before: "First: on every POS tablet or register clear the app data (Settings → Apps → Reymen POS → Storage → Clear data), so it doesn't resend pending test sales.",
    cancel: "Cancel",
    confirm: "Delete and reset",
    done: "Done: the business is like new",
    error: "Couldn't complete",
  },
};

export function ClientResetPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [summary, setSummary] = useState<ClientResetSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const total = summary ? Object.values(summary).reduce((a, b) => a + b, 0) : 0;
  const matches = typed.trim() === orgName.trim();

  function review() {
    startTransition(async () => {
      try {
        setSummary(await previewClientResetAction({ orgId }));
      } catch (e) {
        setSummary(null);
        toast.error(getErrorMessage(e, t.error));
      }
    });
  }

  function reset() {
    startTransition(async () => {
      try {
        await resetClientDataAction({ orgId, confirm: typed });
        toast.success(t.done);
        setOpen(false);
        setTyped("");
        setSummary(await previewClientResetAction({ orgId }));
      } catch (e) {
        toast.error(getErrorMessage(e, t.error));
      }
    });
  }

  return (
    <Card className="border-red-100" data-testid="client-reset">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t.title}</CardTitle>
        <RotateCcw className="h-4 w-4 text-red-400" />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">{t.intro}</p>
        <p className="text-xs text-slate-500">{t.deletes}</p>
        <p className="text-xs text-slate-500">{t.keeps}</p>
        <Button variant="outline" onClick={review} disabled={pending}>
          {pending && !open ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t.review}
        </Button>
        {summary && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            {total === 0 ? (
              <p className="text-slate-600">{t.nothing}</p>
            ) : (
              <>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                  {t.rows(summary).filter(([, n]) => n > 0).map(([label, n]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-slate-600">{label}</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{n}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-amber-700">{t.before}</p>
                <div className="mt-3 flex justify-end">
                  <Button variant="destructive" onClick={() => setOpen(true)} disabled={pending}>{t.action}</Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !o && (setOpen(false), setTyped(""))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.confirmTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">{t.confirmText(orgName)}</p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={orgName} autoComplete="off" aria-label={t.confirmTitle} />
          <DialogFooter>
            <Button variant="outline" onClick={() => (setOpen(false), setTyped(""))} disabled={pending}>{t.cancel}</Button>
            <Button variant="destructive" onClick={reset} disabled={pending || !matches}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
