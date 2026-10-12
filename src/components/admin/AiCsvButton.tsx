"use client";

import { useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportAiUsageCsv } from "@/actions/admin/ai-usage";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

/** Descarga el ledger de IA (con los filtros actuales) como CSV. */
export function AiCsvButton({ filters }: { filters: Record<string, string | undefined> }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const csv = await exportAiUsageCsv(filters);
            const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `consumo-ia-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (e) {
            toast.error(getErrorMessage(e, es ? "No se pudo exportar" : "Couldn't export"));
          }
        })
      }
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      CSV
    </Button>
  );
}
