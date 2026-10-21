"use client";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { lang } = usePreferences();
  return <div role="alert" className="space-y-3 rounded-xl border border-slate-200 p-4"><p>{lang === "es" ? "No se pudo cargar el piloto. Comprueba tu sesión e inténtalo otra vez." : "The pilot could not be loaded. Check your session and try again."}</p><Button onClick={reset}>{lang === "es" ? "Reintentar" : "Try again"}</Button></div>;
}
