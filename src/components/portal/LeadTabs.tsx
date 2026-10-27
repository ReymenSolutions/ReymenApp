"use client";

import { useState } from "react";
import { TabBar } from "@/components/shared/TabBar";

export type LeadTabKey = "summary" | "activity" | "data";

/**
 * Pestañas de la ficha del contacto: Resumen, Actividad y Datos. Los tres paneles se renderizan siempre y solo se
 * ocultan, para no perder lo que se esté escribiendo (una nota) al cambiar de pestaña.
 */
export function LeadTabs({ labels, counts, initial, label, panels }: { labels: Record<LeadTabKey, string>; counts: Partial<Record<LeadTabKey, number>>; initial: LeadTabKey; label: string; panels: Record<LeadTabKey, React.ReactNode> }) {
  const [tab, setTab] = useState<LeadTabKey>(initial);
  const keys: LeadTabKey[] = ["summary", "activity", "data"];
  return (
    <div>
      <TabBar
        tabs={keys.map((k) => ({ key: k, label: labels[k], count: counts[k] || undefined }))}
        value={tab}
        onChange={(k) => setTab(k as LeadTabKey)}
        label={label}
        idBase="lead"
      />
      {keys.map((k) => (
        <div key={k} role="tabpanel" id={`lead-panel-${k}`} aria-labelledby={`lead-tab-${k}`} hidden={tab !== k} className="space-y-5">
          {panels[k]}
        </div>
      ))}
    </div>
  );
}
