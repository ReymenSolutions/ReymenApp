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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { updateFoodSupplier } from "@/actions/food-inventory";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

const schema = z.object({
  name: z.string().trim().min(1, "Nombre requerido"),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export interface EditableSupplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export function FoodSupplierEditDialog({ supplier }: { supplier: EditableSupplier }) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const defaults = {
    name: supplier.name,
    contactName: supplier.contactName ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    notes: supplier.notes ?? "",
  };
  const { register, reset, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: defaults });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await updateFoodSupplier(supplier.id, data);
      toast.success(lang === "es" ? "Proveedor actualizado" : "Supplier updated");
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
          <DialogTitle>{lang === "es" ? "Editar proveedor" : "Edit supplier"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="foodsuppliereditdialog-f1">{lang === "es" ? "Nombre *" : "Name *"}</Label>
            <Input id="foodsuppliereditdialog-f1" {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="foodsuppliereditdialog-f2">{lang === "es" ? "Contacto" : "Contact"}</Label>
              <Input id="foodsuppliereditdialog-f2" {...register("contactName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="foodsuppliereditdialog-f3">{lang === "es" ? "Teléfono" : "Phone"}</Label>
              <Input id="foodsuppliereditdialog-f3" type="tel" {...register("phone")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="foodsuppliereditdialog-f4">{lang === "es" ? "Correo" : "Email"}</Label>
            <Input id="foodsuppliereditdialog-f4" type="email" {...register("email")} />
            {errors.email && <p className="text-xs text-red-500">{translateMessage(errors.email.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="foodsuppliereditdialog-f5">{lang === "es" ? "Notas" : "Notes"}</Label>
            <Textarea id="foodsuppliereditdialog-f5" rows={2} {...register("notes")} />
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
