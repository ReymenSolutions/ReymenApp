"use client";
import { usePreferences } from "@/context/preferences";
export default function Error({ retry }: { retry: () => void }) {
  const { lang } = usePreferences();
  return <div role="alert" className="p-6"><p>{lang === "es" ? "No se pudo cargar Lealtad." : "Unable to load Loyalty."}</p><button className="mt-4 rounded border px-4 py-2" onClick={retry}>{lang === "es" ? "Reintentar" : "Retry"}</button></div>;
}
