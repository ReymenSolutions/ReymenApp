"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestAiCapacity } from "@/actions/ai-capacity";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

export function AiUsageRequestButton({ pending: alreadyOpen }: { pending: boolean }) {
  const { lang } = usePreferences();
  const es = lang !== "en";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const disabled = pending || alreadyOpen || sent;

  return (
    <Button
      disabled={disabled}
      onClick={() =>
        start(async () => {
          try {
            await requestAiCapacity();
            setSent(true);
            toast.success(es ? "Solicitud enviada" : "Request sent");
            router.refresh();
          } catch (e) {
            toast.error(getErrorMessage(e, es ? "No se pudo enviar" : "Couldn't send"));
          }
        })
      }
    >
      {alreadyOpen || sent ? (es ? "Solicitud en revisión" : "Request under review") : es ? "Solicitar capacidad adicional" : "Request additional capacity"}
    </Button>
  );
}
