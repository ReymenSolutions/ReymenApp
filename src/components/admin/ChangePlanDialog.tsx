"use client";

import { useState } from "react";
import { Loader2, CreditCard, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { changePlan } from "@/actions/admin/clients";
import { planName, type PlanDef } from "@/lib/plans";
import { accentTone } from "@/lib/plan-accent";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getModuleLabel } from "@/lib/modules";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

interface ChangePlanDialogProps {
  orgId: string;
  currentPlan: string;
  /** El catálogo de planes activos (Admin → Planes). */
  plans: PlanDef[];
  /** Precio pactado actual (MXN/mes), o null si paga el precio de lista del plan. */
  currentCustomPrice: number | null;
}

export function ChangePlanDialog({ orgId, currentPlan, currentCustomPrice, plans }: ChangePlanDialogProps) {
  const { lang } = usePreferences();
  const MODULE_LABEL = getModuleLabel(lang);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentPlan);
  const [customPrice, setCustomPrice] = useState(currentCustomPrice !== null ? String(currentCustomPrice) : "");
  const parsedCustomPrice = customPrice.trim() === "" ? null : Number(customPrice);
  const customPriceInvalid = parsedCustomPrice !== null && !(Number.isFinite(parsedCustomPrice) && parsedCustomPrice > 0);
  const unchanged = selected === currentPlan && parsedCustomPrice === currentCustomPrice;
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (unchanged) { setOpen(false); return; }
    setLoading(true);
    try {
      await changePlan(orgId, selected, parsedCustomPrice);
      toast.success(lang === "es" ? `Plan actualizado a ${plans.find((p) => p.key === selected) ? planName(plans.find((p) => p.key === selected)!, lang) : selected}` : `Plan updated to ${plans.find((p) => p.key === selected) ? planName(plans.find((p) => p.key === selected)!, lang) : selected}`);
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al cambiar plan" : "Error changing plan")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CreditCard className="h-4 w-4" />
          {lang === "es" ? "Cambiar plan" : "Change plan"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Cambiar plan del cliente" : "Change client's plan"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {plans.map((plan) => {
            const tone = accentTone(plan.accent);
            const isSelected = selected === plan.key;
            // El precio sale del catálogo: es el mismo que usa el ROI, la facturación y el portal.
            const price = `$${plan.priceMxn.toLocaleString("en-US")} MXN/${lang === "es" ? "mes" : "mo"}`;
            const limitText = (n: number | null, one: [string, string], unlimited: [string, string]) => (n === null ? (lang === "es" ? unlimited[0] : unlimited[1]) : `${n.toLocaleString("en-US")} ${lang === "es" ? one[0] : one[1]}`);
            return (
              <button
                key={plan.key}
                onClick={() => setSelected(plan.key)}
                className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
                  isSelected ? `${tone.border} bg-slate-50` : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone.badge}`}>
                      {planName(plan, lang)}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{price}</span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-brand-600" />}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>{limitText(plan.limits.leads, ["leads", "leads"], ["Leads ilimitados", "Unlimited leads"])}</span>
                  <span>{limitText(plan.limits.users, ["usuarios", "users"], ["Usuarios ilimitados", "Unlimited users"])}</span>
                  <span>{limitText(plan.limits.automations, ["automatizaciones", "automations"], ["Automatizaciones ilimitadas", "Unlimited automations"])}</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  {lang === "es" ? "Incluye" : "Includes"}: {plan.modules.map((m) => MODULE_LABEL[m]).join(", ")}
                </p>
              </button>
            );
          })}

          {/* Personalizado: no es otro plan del catálogo, es un precio pactado sobre el plan elegido (se escribe abajo). */}
          <button
            type="button"
            onClick={() => document.getElementById("customPrice")?.focus()}
            className={`w-full rounded-lg border-2 p-4 text-left transition-all ${customPrice.trim() !== "" ? `${accentTone("violet").border} bg-slate-50` : "border-dashed border-slate-200 hover:border-violet-300"}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${accentTone("violet").badge}`}>{lang === "es" ? "Personalizado" : "Custom"}</span>
                <span className="text-sm font-medium text-slate-900">{customPrice.trim() !== "" ? `$${Number(customPrice).toLocaleString("en-US")} MXN/${lang === "es" ? "mes" : "mo"}` : lang === "es" ? "Precio pactado" : "Agreed price"}</span>
              </div>
              {customPrice.trim() !== "" && <Check className="h-4 w-4 text-violet-600" />}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{lang === "es" ? "Conserva el plan elegido (sus límites y módulos) con un precio propio para este cliente." : "Keeps the selected plan (its limits and modules) with its own price for this client."}</p>
          </button>
        </div>

        <div className="space-y-1.5">
            <Label htmlFor="customPrice">{lang === "es" ? "Precio mensual pactado (MXN, opcional)" : "Agreed monthly price (MXN, optional)"}</Label>
            <Input
              id="customPrice"
              type="number"
              min="0"
              step="0.01"
              placeholder={lang === "es" ? "Ej. 2500" : "E.g. 2500"}
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              {customPriceInvalid
                ? (lang === "es" ? "Debe ser un monto mayor a 0." : "Must be an amount greater than 0.")
                : (lang === "es" ? "Plan personalizado de este cliente. Vacío = precio de lista del plan. Se usa para el ROI." : "This client's custom plan. Empty = the plan's list price. Used for the ROI.")}
            </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={handleSave} disabled={loading || unchanged || customPriceInvalid}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {lang === "es" ? "Guardar" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
