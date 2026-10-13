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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/actions/admin/clients";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

const schema = z.object({
  orgName: z.string().min(2, "Mínimo 2 caracteres"),
  orgIndustry: z.string().optional(),
  userName: z.string().min(2, "Mínimo 2 caracteres"),
  userEmail: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

type FormData = z.infer<typeof schema>;

const INDUSTRIES_ES = [
  { value: "clinic", label: "Clínica / Salud" },
  { value: "real_estate", label: "Inmobiliaria" },
  { value: "gym", label: "Gimnasio / Fitness" },
  { value: "legal", label: "Legal / Jurídico" },
  { value: "workshop", label: "Taller / Automotriz" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "other", label: "Otro" },
];

const INDUSTRIES_EN = [
  { value: "clinic", label: "Clinic / Health" },
  { value: "real_estate", label: "Real Estate" },
  { value: "gym", label: "Gym / Fitness" },
  { value: "legal", label: "Legal" },
  { value: "workshop", label: "Workshop / Automotive" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "other", label: "Other" },
];

export function CreateClientDialog() {
  const { lang } = usePreferences();
  const INDUSTRIES = lang === "es" ? INDUSTRIES_ES : INDUSTRIES_EN;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => v && fd.append(k, v));
    try {
      await createClient(fd);
      toast.success(lang === "es" ? "Cliente creado exitosamente" : "Client created successfully");
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al crear cliente" : "Error creating client")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          {lang === "es" ? "Nuevo cliente" : "New client"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Crear nuevo cliente" : "Create new client"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="createclientdialog-f1">{lang === "es" ? "Nombre de empresa" : "Company name"}</Label>
            <Input id="createclientdialog-f1" placeholder={lang === "es" ? "Clínica San Rafael" : "San Rafael Clinic"} {...register("orgName")} />
            {errors.orgName && <p className="text-xs text-red-500">{translateMessage(errors.orgName.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label>{lang === "es" ? "Industria" : "Industry"}</Label>
            <Select onValueChange={(v) => setValue("orgIndustry", v)}>
              <SelectTrigger>
                <SelectValue placeholder={lang === "es" ? "Seleccionar industria" : "Select industry"} />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind.value} value={ind.value}>{ind.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <hr className="border-slate-200" />

          <div className="space-y-2">
            <Label htmlFor="createclientdialog-f2">{lang === "es" ? "Nombre del administrador" : "Administrator name"}</Label>
            <Input id="createclientdialog-f2" placeholder={lang === "es" ? "Juan García" : "John Smith"} {...register("userName")} />
            {errors.userName && <p className="text-xs text-red-500">{translateMessage(errors.userName.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="createclientdialog-f3">{lang === "es" ? "Email de acceso" : "Login email"}</Label>
            <Input id="createclientdialog-f3" type="email" placeholder="juan@empresa.com" {...register("userEmail")} />
            {errors.userEmail && <p className="text-xs text-red-500">{translateMessage(errors.userEmail.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="createclientdialog-f4">{lang === "es" ? "Contraseña inicial" : "Initial password"}</Label>
            <Input id="createclientdialog-f4" type="password" placeholder={lang === "es" ? "Mínimo 8 caracteres" : "At least 8 characters"} {...register("password")} />
            {errors.password && <p className="text-xs text-red-500">{translateMessage(errors.password.message)}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Crear cliente" : "Create client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
