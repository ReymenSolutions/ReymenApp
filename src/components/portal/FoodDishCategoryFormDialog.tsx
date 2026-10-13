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
import { createFoodDishCategory, updateFoodDishCategory } from "@/actions/food";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

const schema = z.object({
  name: z.string().min(1, "Nombre requerido"),
});

type FormData = z.infer<typeof schema>;

interface ExistingCategory { id: string; name: string }

export function FoodDishCategoryFormDialog({ category }: { category?: ExistingCategory }) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = !!category;

  const { register, reset, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: category ? { name: category.name } : { name: "" },
  });

  function openDialog() {
    reset(category ? { name: category.name } : { name: "" });
    setOpen(true);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      if (isEdit && category) {
        await updateFoodDishCategory(category.id, data);
        toast.success(lang === "es" ? "Categoría actualizada" : "Category updated");
      } else {
        await createFoodDishCategory(data);
        toast.success(lang === "es" ? "Categoría creada" : "Category created");
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
          <Button size="sm" variant="outline" onClick={openDialog}>
            <Plus className="h-4 w-4" />
            {lang === "es" ? "Nueva categoría" : "New category"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? (lang === "es" ? "Editar categoría" : "Edit category") : (lang === "es" ? "Nueva categoría" : "New category")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="fooddishcategoryformdialog-f1">{lang === "es" ? "Nombre *" : "Name *"}</Label>
            <Input id="fooddishcategoryformdialog-f1" placeholder={lang === "es" ? "Bebidas" : "Drinks"} {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
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
