"use client";

import { useState } from "react";
import { Loader2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { adjustFoodInventoryStock } from "@/actions/food-inventory";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

/** Conteo físico: se captura lo que realmente hay y la diferencia queda como ajuste. */
export function FoodStockAdjustDialog({ itemId, name, unit, currentStock, branchId }: { itemId: string; name: string; unit: string; currentStock: number; branchId?: string | null }) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [counted, setCounted] = useState(String(currentStock));
  const [note, setNote] = useState("");
  const countedNumber = Number(counted);
  const valid = counted.trim() !== "" && Number.isFinite(countedNumber);
  const diff = valid ? Math.round((countedNumber - currentStock) * 1000) / 1000 : 0;

  async function save() {
    if (!valid) return;
    setLoading(true);
    try {
      await adjustFoodInventoryStock(itemId, { countedStock: countedNumber, note: note || undefined, branchId: branchId ?? null });
      toast.success(lang === "es" ? "Existencia ajustada" : "Stock adjusted");
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, lang === "es" ? "Error al guardar" : "Error saving"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setCounted(String(currentStock)); setNote(""); setOpen(true); }}
          className="h-7 w-7 p-0 text-slate-400 hover:text-brand-600"
          title={lang === "es" ? "Ajustar existencia" : "Adjust stock"}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "es" ? `Ajustar existencia — ${name}` : `Adjust stock — ${name}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-600">
            {lang === "es" ? "Existencia en el sistema:" : "Stock in the system:"} <strong>{currentStock} {unit}</strong>
          </p>
          <div className="space-y-2">
            <Label>{lang === "es" ? `Existencia contada (${unit}) *` : `Counted stock (${unit}) *`}</Label>
            <Input type="number" step="0.001" value={counted} onChange={(e) => setCounted(e.target.value)} />
            {valid && diff !== 0 && (
              <p className={`text-xs font-medium ${diff > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {lang === "es" ? "Diferencia" : "Difference"}: {diff > 0 ? "+" : ""}{diff} {unit}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>{lang === "es" ? "Motivo (opcional)" : "Reason (optional)"}</Label>
            <Input
              placeholder={lang === "es" ? "Conteo semanal, merma, caducado..." : "Weekly count, waste, expired..."}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={save} disabled={loading || !valid || diff === 0}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {lang === "es" ? "Guardar ajuste" : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
