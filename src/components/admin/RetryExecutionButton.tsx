"use client";

import { useTransition } from "react";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { retryExecution } from "@/actions/admin/executions";
import { getErrorMessage } from "@/lib/user-error";

/** Reintento manual de una ejecución fallida (solo se muestra activo cuando es seguro: lo decide el servidor). */
export function RetryExecutionButton({ orgId, executionId, disabledReason }: { orgId: string; executionId: string; disabledReason?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={!!disabledReason || pending}
      loading={pending}
      title={disabledReason ?? "Vuelve a mandar este mensaje"}
      onClick={() =>
        start(async () => {
          try {
            await retryExecution({ orgId, executionId });
            toast.success("Reintento programado");
            router.refresh();
          } catch (e) {
            toast.error("No se pudo reintentar", { description: getErrorMessage(e, "") || undefined });
          }
        })
      }
    >
      {!pending && <RotateCw className="h-3.5 w-3.5" />} Reintentar
    </Button>
  );
}
