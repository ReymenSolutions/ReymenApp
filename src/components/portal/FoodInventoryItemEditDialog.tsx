"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { updateFoodInventoryItem } from "@/actions/food-inventory";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";
import { FOOD_UNIT_LABELS, FOOD_UNITS, isFoodUnit } from "@/lib/food-units";

const schema = z.object({
  name: z.string().trim().min(1, "Nombre requerido"),
  unit: z.string().trim().min(1, "Unidad requerida"),
  category: z.enum(["EDIBLE", "NON_EDIBLE"]),
  minStock: z.coerce.number<number>().min(0, "No puede ser negativo"),
  unitCost: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export interface EditableInventoryItem {
  id: string;
  name: string;
  unit: string;
  category: "EDIBLE" | "NON_EDIBLE";
  minStock: number;
  unitCost: number | null;
}

export function FoodInventoryItemEditDialog({ item }: { item: EditableInventoryItem }) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const defaults = { name: item.name, unit: item.unit, category: item.category, minStock: item.minStock, unitCost: item.unitCost?.toString() ?? "" };
  const { register, reset, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: defaults });

  async function onSubmit(data: FormData) {
    const cost = data.unitCost?.trim() ? Number(data.unitCost) : null;
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      toast.error(translateMessage("No puede ser negativo"));
      return;
    }
    setLoading(true);
    try {
      await updateFoodInventoryItem(item.id, { name: data.name, unit: data.unit, category: data.category, minStock: data.minStock, unitCost: cost });
      toast.success(lang === "es" ? "Insumo actualizado" : "Supply item updated");
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
          onClick={() => { reset(defaults); setOpen(true); }}
          className="h-7 w-7 p-0 text-slate-400 hover:text-brand-600"
          title={lang === "es" ? "Editar" : "Edit"}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Editar insumo" : "Edit supply item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="foodinventoryitemeditdialog-f1">{lang === "es" ? "Nombre *" : "Name *"}</Label>
            <Input id="foodinventoryitemeditdialog-f1" {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="foodinventoryitemeditdialog-f2">{lang === "es" ? "Unidad *" : "Unit *"}</Label>
              <select id="foodinventoryitemeditdialog-f2" {...register("unit")} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm">
                {/* Unidad escrita a mano antes de la lista: se conserva hasta que se elija otra. */}
                {!isFoodUnit(item.unit) && <option value={item.unit}>{item.unit} {lang === "es" ? "(actual, elige una de la lista)" : "(current, pick one from the list)"}</option>}
                {FOOD_UNITS.map((u) => (
                  <option key={u} value={u}>{FOOD_UNIT_LABELS[lang === "en" ? "en" : "es"][u]}</option>
                ))}
              </select>
              {errors.unit && <p className="text-xs text-red-500">{translateMessage(errors.unit.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="foodinventoryitemeditdialog-f3">{lang === "es" ? "Categoría" : "Category"}</Label>
              <select id="foodinventoryitemeditdialog-f3" {...register("category")} className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm">
                <option value="EDIBLE">{lang === "es" ? "Comestible" : "Edible"}</option>
                <option value="NON_EDIBLE">{lang === "es" ? "No comestible" : "Non-edible"}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="foodinventoryitemeditdialog-f4">{lang === "es" ? "Mínimo" : "Minimum"}</Label>
              <Input id="foodinventoryitemeditdialog-f4" type="number" step="0.001" min="0" {...register("minStock")} />
              {errors.minStock && <p className="text-xs text-red-500">{translateMessage(errors.minStock.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="foodinventoryitemeditdialog-f5">{lang === "es" ? "Costo unitario" : "Unit cost"}</Label>
              <Input id="foodinventoryitemeditdialog-f5" type="number" step="0.01" min="0" {...register("unitCost")} />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {lang === "es"
              ? "La existencia no se cambia aquí: usa \"Ajustar existencia\" para que el cambio quede registrado."
              : "Stock isn't changed here: use \"Adjust stock\" so the change is recorded."}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
