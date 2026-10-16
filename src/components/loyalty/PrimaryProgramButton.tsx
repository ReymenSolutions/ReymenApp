"use client";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { selectPrimaryLoyaltyProgram, viewLoyaltyProgram } from "@/actions/loyalty";
import { getErrorMessage } from "@/lib/user-error";
export function PrimaryProgramButton({ id, lang }: { id: string; lang: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => {
    try { await selectPrimaryLoyaltyProgram(id); router.refresh(); }
    catch (e) { toast.error(getErrorMessage(e, lang === "es" ? "No se pudo cambiar el programa" : "Unable to change program")); }
  })}>{pending ? "…" : lang === "es" ? "Usar como predeterminado" : "Use as default"}</Button>;
}

export function ViewProgramButton({ id, lang }: { id: string; lang: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => {
    try { await viewLoyaltyProgram(id); router.push("/portal/loyalty"); router.refresh(); }
    catch (e) { toast.error(getErrorMessage(e, "No se pudo abrir el programa")); }
  })}>{pending ? "…" : lang === "es" ? "Ver actividad" : "View activity"}</Button>;
}
