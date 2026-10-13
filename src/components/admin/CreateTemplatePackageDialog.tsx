"use client";

import { useState, useMemo } from "react";
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
import { getIndustries } from "@/components/admin/CreateTemplateDialog";
import { createTemplatePackage } from "@/actions/admin/template-packages";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

interface TemplateOption {
  id: string;
  name: string;
  industry: string;
  iconEmoji: string;
}

const EMOJIS = ["📦", "🚀", "⭐", "🏆", "🎁", "💼"];

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  description: z.string().min(10, "Mínimo 10 caracteres"),
  industry: z.string().min(1, "Selecciona una industria"),
});

type FormData = z.infer<typeof schema>;

export function CreateTemplatePackageDialog({ templates }: { templates: TemplateOption[] }) {
  const { lang } = usePreferences();
  const industries = getIndustries(lang);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState("📦");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const industry = watch("industry");
  const orderedTemplates = useMemo(() => {
    if (!industry) return templates;
    return [...templates].sort((a, b) => (a.industry === industry ? -1 : 0) - (b.industry === industry ? -1 : 0));
  }, [templates, industry]);

  function toggleTemplate(id: string) {
    setSelectedTemplateIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function onSubmit(data: FormData) {
    if (selectedTemplateIds.length === 0) {
      setItemsError(lang === "es" ? "Selecciona al menos un template" : "Select at least one template");
      return;
    }
    setItemsError(null);
    setLoading(true);
    try {
      await createTemplatePackage({ ...data, iconEmoji: selectedEmoji, templateIds: selectedTemplateIds });
      toast.success(lang === "es" ? "Paquete creado exitosamente" : "Package created successfully");
      reset();
      setSelectedTemplateIds([]);
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al crear paquete" : "Error creating package")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" />{lang === "es" ? "Nuevo paquete" : "New package"}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{lang === "es" ? "Crear paquete por industria" : "Create industry package"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === "es" ? "Ícono" : "Icon"}</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setSelectedEmoji(e)}
                  className={`h-9 w-9 rounded-lg border text-lg transition-colors ${
                    selectedEmoji === e ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="createtemplatepackagedialog-f1">{lang === "es" ? "Nombre *" : "Name *"}</Label>
            <Input id="createtemplatepackagedialog-f1" placeholder={lang === "es" ? "Paquete inicial de Clínica" : "Starter Clinic package"} {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{translateMessage(errors.name.message)}</p>}
          </div>

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
            <Label htmlFor="createtemplatepackagedialog-f2">{lang === "es" ? "Descripción *" : "Description *"}</Label>
            <Textarea id="createtemplatepackagedialog-f2" placeholder={lang === "es" ? "Lo esencial para arrancar una clínica con Reymen Solutions" : "The essentials to get a clinic started with Reymen Solutions"} rows={2} {...register("description")} />
            {errors.description && <p className="text-xs text-red-500">{translateMessage(errors.description.message)}</p>}
          </div>

          <div className="space-y-2">
            <Label>{lang === "es" ? "Templates incluidos *" : "Included templates *"}</Label>
            {templates.length === 0 ? (
              <p className="text-xs text-slate-400">{lang === "es" ? "No hay templates publicados todavía. Publica al menos uno primero." : "No published templates yet. Publish at least one first."}</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                {orderedTemplates.map((t) => (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTemplateIds.includes(t.id)}
                      onChange={() => toggleTemplate(t.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span>{t.iconEmoji}</span>
                    <span className="flex-1">{t.name}</span>
                  </label>
                ))}
              </div>
            )}
            {itemsError && <p className="text-xs text-red-500">{itemsError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Crear paquete" : "Create package"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
