"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEnabledModules } from "@/context/modules";
import { usePreferences } from "@/context/preferences";
import { getCrmTabs, type CrmTabKey } from "@/lib/crm-tabs";
import { cn } from "@/lib/utils";

const LABEL: Record<"es" | "en", Record<CrmTabKey, string>> = {
  es: { today: "Hoy", contacts: "Leads", pipeline: "Pipeline", inbox: "Inbox", appointments: "Citas", customers: "Clientes del negocio" },
  en: { today: "Today", contacts: "Leads", pipeline: "Pipeline", inbox: "Inbox", appointments: "Appointments", customers: "Business customers" },
};

/** Pestañas del CRM (una sola entrada del menú): cada pestaña es la pantalla de siempre, con su dirección de siempre. */
export function CrmTabs() {
  const modules = useEnabledModules();
  const { lang } = usePreferences();
  const pathname = usePathname();
  const tabs = getCrmTabs(modules);
  const labels = LABEL[lang === "en" ? "en" : "es"];
  // Sin el módulo CRM las pantallas conservan sus entradas sueltas en el menú: no hay pestañas que mostrar.
  if (!modules.includes("CRM")) return null;

  return (
    <nav aria-label="CRM" className="mb-5 -mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {tabs.map((tab) => {
        // Las subpantallas (la ficha de un contacto, ajustes de citas…) mantienen activa su pestaña.
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium motion-micro transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-4",
              active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {labels[tab.key]}
          </Link>
        );
      })}
    </nav>
  );
}
