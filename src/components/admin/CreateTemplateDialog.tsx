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
import { createTemplate } from "@/actions/admin/templates";
import { usePreferences } from "@/context/preferences";
import type { Lang } from "@/lib/i18n";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

export function getIndustries(lang: Lang) {
  return lang === "es"
    ? [
        { value: "clinic",       label: "🏥 Clínica / Salud" },
        { value: "real_estate",  label: "🏠 Inmobiliaria" },
        { value: "gym",          label: "💪 Gimnasio / Fitness" },
        { value: "legal",        label: "⚖️ Legal / Jurídico" },
        { value: "workshop",     label: "🔧 Taller / Automotriz" },
        { value: "ecommerce",    label: "🛍️ E-commerce" },
        { value: "restaurant",   label: "🍽️ Restaurante" },
        { value: "education",    label: "📚 Educación" },
        { value: "general",      label: "⚡ General" },
      ]
    : [
        { value: "clinic",       label: "🏥 Clinic / Health" },
        { value: "real_estate",  label: "🏠 Real Estate" },
        { value: "gym",          label: "💪 Gym / Fitness" },
        { value: "legal",        label: "⚖️ Legal" },
        { value: "workshop",     label: "🔧 Workshop / Automotive" },
        { value: "ecommerce",    label: "🛍️ E-commerce" },
        { value: "restaurant",   label: "🍽️ Restaurant" },
        { value: "education",    label: "📚 Education" },
        { value: "general",      label: "⚡ General" },
      ];
}

export function getCategories(lang: Lang) {
  return lang === "es"
    ? [
        { value: "lead_capture",   label: "Captura de leads" },
        { value: "appointments",   label: "Agendamiento" },
        { value: "follow_up",      label: "Seguimiento" },
        { value: "crm",            label: "CRM / Gestión" },
        { value: "retention",      label: "Retención" },
        { value: "notifications",  label: "Notificaciones" },
        { value: "onboarding",     label: "Onboarding" },
      ]
    : [
        { value: "lead_capture",   label: "Lead capture" },
        { value: "appointments",   label: "Appointments" },
        { value: "follow_up",      label: "Follow-up" },
        { value: "crm",            label: "CRM / Management" },
        { value: "retention",      label: "Retention" },
        { value: "notifications",  label: "Notifications" },
        { value: "onboarding",     label: "Onboarding" },
      ];
}

// Kept as the Spanish default for legacy imports; new callers should use getIndustries(lang)/getCategories(lang).
export const INDUSTRIES = getIndustries("es");
export const CATEGORIES = getCategories("es");

const EMOJIS = ["⚡","🤖","📋","📞","🗓️","💬","📊","🎯","🔔","✅","🚀","💡"];

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  description: z.string().min(10, "Mínimo 10 caracteres"),
  longDescription: z.string().optional(),
  industry: z.string().min(1, "Selecciona una industria"),
  category: z.string().min(1, "Selecciona una categoría"),
  iconEmoji: z.string(),
});

type FormData = z.infer<typeof schema>;

export function CreateTemplateDialog() {
  const { lang } = usePreferences();
  const industries = getIndustries(lang);
  const categories = getCategories(lang);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState("⚡");

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { iconEmoji: "⚡" },
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await createTemplate({ ...data, iconEmoji: selectedEmoji });
      toast.success(lang === "es" ? "Template creado exitosamente" : "Template created successfully");
      reset();
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al crear template" : "Error creating template")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" />{lang === "es" ? "Nuevo template" : "New template"}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{lang === "es" ? "Crear template de automatización" : "Create automation template"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Emoji picker */}
          <div className="space-y-2">
            <Label>{lang === "es" ? "Ícono" : "Icon"}</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setSelectedEmoji(e)}
                  className={`h-9 w-9 rounded-lg border text-lg transition-colors ${
                    selectedEmoji === e
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="createtemplatedialog-f1">{lang === "es" ? "Nombre *" : "Name *"}</Label>
            <Input id="createtemplatedialog-f1" placeholder={lang === "es" ? "Agendamiento de citas médicas" : "Medical appointment booking"} {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{lang === "es" ? "Industria *" : "Industry *"}</Label>
              <Select onValueChange={(v) => setValue("industry", v)}>
                <SelectTrigger><SelectValue placeholder={lang === "es" ? "Seleccionar" : "Select"} /></SelectTrigger>
                <SelectContent>
                  {industries.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.industry && <p className="text-xs text-red-500">{translateMessage(errors.industry.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label>{lang === "es" ? "Categoría *" : "Category *"}</Label>
              <Select onValueChange={(v) => setValue("category", v)}>
                <SelectTrigger><SelectValue placeholder={lang === "es" ? "Seleccionar" : "Select"} /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-xs text-red-500">{translateMessage(errors.category.message)}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="createtemplatedialog-f2">{lang === "es" ? "Descripción corta *" : "Short description *"}</Label>
            <Input id="createtemplatedialog-f2" placeholder={lang === "es" ? "Captura y califica leads desde WhatsApp automáticamente" : "Automatically captures and qualifies leads from WhatsApp"} {...register("description")} />
            {errors.description && <p className="text-xs text-red-500">{translateMessage(errors.description.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="createtemplatedialog-f3">{lang === "es" ? "Descripción detallada" : "Detailed description"}</Label>
            <Textarea id="createtemplatedialog-f3" placeholder={lang === "es" ? "Explicación completa de qué hace el template..." : "Full explanation of what the template does..."} rows={3} {...register("longDescription")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Crear template" : "Create template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
