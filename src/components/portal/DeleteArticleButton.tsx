"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteArticle } from "@/actions/knowledge-base";
import { usePreferences } from "@/context/preferences";

export function DeleteArticleButton({ id }: { id: string }) {
  const { lang } = usePreferences();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(lang === "es" ? "¿Eliminar este artículo? Esta acción no se puede deshacer." : "Delete this article? This action cannot be undone.")) return;
    setLoading(true);
    try {
      await deleteArticle(id);
      toast.success(lang === "es" ? "Artículo eliminado" : "Article deleted");
    } catch {
      toast.error(lang === "es" ? "Error al eliminar artículo" : "Error deleting article");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={lang === "es" ? "Eliminar artículo" : "Delete article"}
      className="h-11 w-11 text-slate-400 hover:text-red-600"
      onClick={handleDelete}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}
