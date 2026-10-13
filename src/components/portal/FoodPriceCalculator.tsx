"use client";

import { useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateFoodTargetCostPct } from "@/actions/food";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

export interface FoodDishOption { id: string; name: string; cost: number }

// Misma fórmula que recommendDishPrice() en src/lib/food.ts -- se repite
// aquí a propósito (no se importa desde lib/food.ts, que trae Prisma y
// rompería el bundle de cliente) en vez de crear un módulo compartido para
// una fórmula de una línea.
function recommendPrice(cost: number, targetPct: number): number {
  if (targetPct <= 0 || targetPct >= 100) return cost;
  return Math.round((cost / (targetPct / 100)) * 100) / 100;
}

export function FoodPriceCalculator({
  dishes,
  initialTargetPct,
  canSaveDefault = true,
}: {
  dishes: FoodDishOption[];
  initialTargetPct: number;
  /** Guardar el % para toda la organización requiere food:manage; calcular no. */
  canSaveDefault?: boolean;
}) {
  const { lang } = usePreferences();
  const [selectedDishId, setSelectedDishId] = useState<string>("manual");
  const [manualCost, setManualCost] = useState("");
  const [targetPct, setTargetPct] = useState(String(initialTargetPct));
  const [saving, setSaving] = useState(false);

  const cost = useMemo(() => {
    if (selectedDishId === "manual") return Number(manualCost) || 0;
    return dishes.find((d) => d.id === selectedDishId)?.cost ?? 0;
  }, [selectedDishId, manualCost, dishes]);

  const pct = Math.min(99, Math.max(1, Number(targetPct) || 0));
  const suggestedPrice = recommendPrice(cost, pct);

  async function handleSaveDefault() {
    setSaving(true);
    try {
      await updateFoodTargetCostPct(pct);
      toast.success(lang === "es" ? "% objetivo guardado como predeterminado" : "Target % saved as default");
    } catch (e) {
      toast.error(getErrorMessage(e, "Error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{lang === "es" ? "Precio recomendado" : "Recommended price"}</CardTitle>
        <p className="text-xs text-slate-500">
          {lang === "es"
            ? "Precio = costo del platillo ÷ % de costo objetivo. 30% es un punto de partida típico."
            : "Price = dish cost ÷ target cost %. 30% is a typical starting point."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="foodpricecalculator-f1">{lang === "es" ? "Platillo" : "Dish"}</Label>
          <select id="foodpricecalculator-f1"
            value={selectedDishId}
            onChange={(e) => setSelectedDishId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="manual">{lang === "es" ? "Costo manual" : "Manual cost"}</option>
            {dishes.map((d) => (
              <option key={d.id} value={d.id}>{d.name} (${d.cost.toFixed(2)})</option>
            ))}
          </select>
        </div>

        {selectedDishId === "manual" && (
          <div className="space-y-2">
            <Label htmlFor="foodpricecalculator-f2">{lang === "es" ? "Costo del platillo" : "Dish cost"}</Label>
            <Input id="foodpricecalculator-f2" type="number" step="0.01" min="0" value={manualCost} onChange={(e) => setManualCost(e.target.value)} />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="foodpricecalculator-f3">{lang === "es" ? "% de costo objetivo" : "Target cost %"}</Label>
          <Input id="foodpricecalculator-f3" type="number" step="1" min="1" max="90" value={targetPct} onChange={(e) => setTargetPct(e.target.value)} />
        </div>

        <div className="rounded-md bg-brand-50 p-3">
          <p className="text-[11px] font-medium text-brand-700">{lang === "es" ? "Precio sugerido" : "Suggested price"}</p>
          <p className="text-xl font-bold text-brand-900">${suggestedPrice.toFixed(2)}</p>
        </div>

        {canSaveDefault && (
          <Button variant="outline" size="sm" onClick={handleSaveDefault} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {lang === "es" ? "Guardar % como predeterminado" : "Save % as default"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
