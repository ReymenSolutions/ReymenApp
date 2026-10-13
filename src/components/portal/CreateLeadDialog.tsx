"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createLead } from "@/actions/leads";
import { usePreferences } from "@/context/preferences";
import { translateMessage } from "@/lib/user-error";

const schema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function CreateLeadDialog() {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => v !== undefined && fd.append(k, v));
    try {
      await createLead(fd);
      toast.success(lang === "es" ? "Lead creado exitosamente" : "Lead created successfully");
      reset();
      setOpen(false);
    } catch {
      toast.error(lang === "es" ? "Error al crear lead" : "Error creating lead");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          {lang === "es" ? "Nuevo lead" : "New lead"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Agregar lead manualmente" : "Add lead manually"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="createleaddialog-f1">{lang === "es" ? "Nombre *" : "Name *"}</Label>
            <Input id="createleaddialog-f1" placeholder={lang === "es" ? "María López" : "Jane Doe"} {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="createleaddialog-f2">Email</Label>
              <Input id="createleaddialog-f2" type="email" placeholder="maria@email.com" {...register("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="createleaddialog-f3">{lang === "es" ? "Teléfono" : "Phone"}</Label>
              <Input id="createleaddialog-f3" placeholder="+52 55 1234 5678" {...register("phone")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{lang === "es" ? "Fuente" : "Source"}</Label>
            <Select onValueChange={(v) => setValue("source", v)} defaultValue="manual">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="referral">{lang === "es" ? "Referido" : "Referral"}</SelectItem>
                <SelectItem value="other">{lang === "es" ? "Otro" : "Other"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="createleaddialog-f4">{lang === "es" ? "Notas" : "Notes"}</Label>
            <Textarea id="createleaddialog-f4" placeholder={lang === "es" ? "Información adicional..." : "Additional information..."} rows={3} {...register("notes")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Crear lead" : "Create lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
