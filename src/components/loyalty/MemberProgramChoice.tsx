"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectMyLoyaltyProgram } from "@/actions/loyalty-public";
import { memberCardPath } from "@/lib/loyalty/token";
import { getErrorMessage } from "@/lib/user-error";
export function MemberProgramChoice({ slug, token, current, selected, programs, lang }: { slug: string; token: string; current: string; selected: boolean; programs: { id: string; name: string }[]; lang: string }) {
  const [choice, setChoice] = useState(current), [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <div className="space-y-2 px-6 py-4 text-sm">
    <label htmlFor="member-program">{lang === "es" ? "Programa para mis nuevas visitas" : "Program for my new visits"}</label>
    {!selected && <p>{lang === "es" ? "Esta tarjeta muestra un programa anterior. Tus visitas suman al programa que elegiste." : "This card shows a previous program. Visits accrue to your selected program."}</p>}
    <select id="member-program" value={choice} disabled={pending} onChange={(e) => setChoice(e.target.value)} className="w-full rounded border p-2">
      {!programs.some(p => p.id === current) && <option value={current} disabled>{lang === "es" ? "Programa en pausa" : "Paused program"}</option>}
      {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    <button disabled={pending || (choice === current && selected)} className="rounded border px-3 py-2" onClick={() => start(async () => {
      setError("");
      try { const result = await selectMyLoyaltyProgram({ slug, token, programId: choice }); router.replace(memberCardPath(slug, result.token)); router.refresh(); }
      catch(e) { setError(getErrorMessage(e, lang === "es" ? "No se pudo cambiar el programa" : "Unable to change program")); }
    })}>{pending ? "…" : lang === "es" ? "Elegir programa" : "Choose program"}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
