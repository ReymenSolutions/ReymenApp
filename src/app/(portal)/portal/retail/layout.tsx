import { Store } from "lucide-react";
import { getRetailContext } from "@/lib/retail/context";

export default async function RetailLayout({ children }: { children: React.ReactNode }) {
  const { org, lang } = await getRetailContext();
  return (
    <div>
      <header className="mb-4 rounded-xl border border-[#04275A] bg-gradient-to-br from-[#031738] via-[#04275A] to-[#063C82] px-5 py-6 text-white sm:px-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#22C55E]">
          <Store className="h-4 w-4" aria-hidden="true" />
          {org.name}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-4xl">Reymen Retail</h1>
        <p className="mt-2 text-sm text-slate-200">
          {lang === "en" ? "Store operations and piece-level inventory" : "Operación de tiendas e inventario por pieza"}
        </p>
      </header>
      {children}
    </div>
  );
}
