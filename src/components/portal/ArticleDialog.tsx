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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { createArticle, updateArticle } from "@/actions/knowledge-base";
import { usePreferences } from "@/context/preferences";
import type { KnowledgeBase } from "@prisma/client";
import { getErrorMessage, translateMessage } from "@/lib/user-error";

const schema = z.object({
  title: z.string().min(1, "Título requerido").max(240),
  content: z.string().min(1, "Contenido requerido").max(50000),
  category: z.string().max(120).optional(),
  tags: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ArticleDialogProps {
  article?: KnowledgeBase;
  mode?: "create" | "edit";
}

export function ArticleDialog({ article, mode = "create" }: ArticleDialogProps) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expectedVersion, setExpectedVersion] = useState(article?.knowledgeVersion ?? 0);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: article
      ? { title: article.title, content: article.content, category: article.category ?? "", tags: article.tags.join(", ") }
      : {},
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const tags = (data.tags ?? "").split(",").map(tag => tag.trim()).filter(Boolean);
      if (mode === "edit" && article) {
        await updateArticle(article.id, { ...data, tags, expectedVersion, category: data.category || undefined });
        toast.success(lang === "es" ? "Artículo actualizado" : "Article updated");
      } else {
        await createArticle({ ...data, tags, category: data.category || undefined });
        toast.success(lang === "es" ? "Artículo creado" : "Article created");
        reset();
      }
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, lang === "es" ? "Error al guardar artículo" : "Error saving article"));
    } finally {
      setLoading(false);
    }
  }

  function changeOpen(next: boolean) {
    if (next && mode === "edit" && article) {
      reset({ title: article.title, content: article.content, category: article.category ?? "", tags: article.tags.join(", ") });
      setExpectedVersion(article.knowledgeVersion);
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="sm" className="min-h-11">
            <Plus className="h-4 w-4" />
            {lang === "es" ? "Nuevo artículo" : "New article"}
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`${lang === "es" ? "Editar artículo" : "Edit article"}: ${article?.title ?? ""}`}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent touchClose closeLabel={lang === "es" ? "Cerrar ventana" : "Close dialog"} className="max-w-2xl">
        <DialogHeader className="pr-10">
          <DialogTitle>
            {mode === "create" ? (lang === "es" ? "Crear artículo" : "Create article") : (lang === "es" ? "Editar artículo" : "Edit article")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="articledialog-f1">{lang === "es" ? "Título *" : "Title *"}</Label>
              <Input className="min-h-11 text-base" id="articledialog-f1" placeholder={lang === "es" ? "¿Cuáles son los horarios de atención?" : "What are your business hours?"} {...register("title")} />
              {errors.title && <p className="text-xs text-red-500">{translateMessage(errors.title.message)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="articledialog-f2">{lang === "es" ? "Categoría" : "Category"}</Label>
              <Input className="min-h-11 text-base" id="articledialog-f2" placeholder={lang === "es" ? "faq, precios, servicios..." : "faq, pricing, services..."} {...register("category")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="articledialog-f3">{lang === "es" ? "Contenido *" : "Content *"}</Label>
            <Textarea className="text-base" id="articledialog-f3"
              placeholder={lang === "es" ? "Escribe el contenido que el asistente usará para responder..." : "Write the content the assistant will use to reply..."}
              rows={8}
              {...register("content")}
            />
            {errors.content && <p className="text-xs text-red-500">{translateMessage(errors.content.message)}</p>}
            <p className="text-xs text-slate-400">
              {lang === "es" ? "Este contenido es consultado por el asistente AI para responder preguntas de los clientes." : "This content is consulted by the AI assistant to answer customer questions."}
            </p>
          </div>
          <div className="space-y-2"><Label htmlFor="article-tags">{lang === "es" ? "Etiquetas (separadas por coma)" : "Tags (comma separated)"}</Label><Input id="article-tags" className="min-h-11 text-base" {...register("tags")} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" className="min-h-11" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "create" ? (lang === "es" ? "Crear artículo" : "Create article") : (lang === "es" ? "Guardar cambios" : "Save changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
