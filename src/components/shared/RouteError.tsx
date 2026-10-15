"use client";
import { useTransition } from "react";
import { usePreferences } from "@/context/preferences";
export function RouteError({ retry }: { retry: () => void }) {
  const { lang } = usePreferences();
  const [pending, start] = useTransition();
  return <div role="alert" className="min-h-48 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
    <h2 className="font-semibold">{lang === "es" ? "No se pudo cargar esta pantalla" : "Unable to load this page"}</h2>
    <p className="mt-2 text-sm">{lang === "es" ? "Comprueba tu conexión y vuelve a intentarlo. Puedes navegar a otra sección desde el menú." : "Check your connection and try again. You can open another section from the menu."}</p>
    <button disabled={pending} className="mt-4 rounded border px-4 py-2" onClick={() => start(retry)}>{pending ? "…" : lang === "es" ? "Reintentar" : "Retry"}</button>
  </div>;
}
