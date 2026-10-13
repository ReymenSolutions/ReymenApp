"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { createFoodOperatingCost, updateFoodOperatingCost } from "@/actions/food";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

const schema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  amountMonthly: z.coerce.number().positive("El monto debe ser mayor a 0"),
});

type FormData = z.infer<typeof schema>;

interface ExistingCost { id: string; name: string; amountMonthly: number }

export function FoodOperatingCostFormDialog({ cost }: { cost?: ExistingCost }) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = !!cost;

  const { register, reset, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: cost ? { name: cost.name, amountMonthly: cost.amountMonthly } : { name: "", amountMonthly: undefined },
  });

  function openDialog() {
    reset(cost ? { name: cost.name, amountMonthly: cost.amountMonthly } : { name: "", amountMonthly: undefined });
    setOpen(true);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      if (isEdit && cost) {
        await updateFoodOperatingCost(cost.id, data);
        toast.success(lang === "es" ? "Gasto actualizado" : "Cost updated");
      } else {
        await createFoodOperatingCost(data);
        toast.success(lang === "es" ? "Gasto agregado" : "Cost added");
      }
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al guardar" : "Error saving")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm" onClick={openDialog} className="h-7 w-7 p-0 text-slate-400 hover:text-brand-600">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" onClick={openDialog}>
            <Plus className="h-4 w-4" />
            {lang === "es" ? "Agregar gasto fijo" : "Add fixed cost"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? (lang === "es" ? "Editar gasto fijo" : "Edit fixed cost") : (lang === "es" ? "Nuevo gasto fijo" : "New fixed cost")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="foodoperatingcostformdialog-f1">{lang === "es" ? "Nombre *" : "Name *"}</Label>
            <Input id="foodoperatingcostformdialog-f1" placeholder={lang === "es" ? "Renta del local" : "Rent"} {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="foodoperatingcostformdialog-f2">{lang === "es" ? "Monto mensual *" : "Monthly amount *"}</Label>
            <Input id="foodoperatingcostformdialog-f2" type="number" step="0.01" min="0" {...register("amountMonthly")} />
            {errors.amountMonthly && <p className="text-xs text-red-500">{translateMessage(errors.amountMonthly.message)}</p>}
          </div>
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
