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
    if (!confirm(lang === "es" ? "¿Desactivar este artículo? Se conservarán su contenido y sus versiones." : "Deactivate this article? Its content and versions will be preserved.")) return;
    setLoading(true);
    try {
      await deleteArticle(id);
      toast.success(lang === "es" ? "Artículo desactivado" : "Article deactivated");
    } catch {
      toast.error(lang === "es" ? "Error al desactivar artículo" : "Error deactivating article");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={lang === "es" ? "Desactivar artículo" : "Deactivate article"}
      className="h-11 w-11 text-slate-400 hover:text-red-600"
      onClick={handleDelete}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}
