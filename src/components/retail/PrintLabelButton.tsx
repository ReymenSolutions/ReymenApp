"use client";

export function PrintLabelButton({ lang }: { lang: "es" | "en" }) {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#04275A] px-4 py-2 text-sm font-semibold text-white">
    {lang === "en" ? "Print label" : "Imprimir etiqueta"}
  </button>;
}
