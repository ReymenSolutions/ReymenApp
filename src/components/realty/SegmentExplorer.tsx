"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SegmentTable, type SegmentLine } from "./RotationBits";

export interface SegmentGroup {
  key: string;
  label: string;
  /** Encabezado de la primera columna para esta agrupación. */
  segmentHead: string;
  rows: SegmentLine[];
}

/** Una sola tabla de rotación con selector de agrupación (zona, tipo, rango de precio). */
export function SegmentExplorer({ title, groups, heads, empty }: { title: string; groups: SegmentGroup[]; heads: { closed: string; open: string; median: string; status: string }; empty: string }) {
  const [key, setKey] = useState(groups[0].key);
  const g = groups.find((x) => x.key === key) ?? groups[0];
  return (
    <div className="space-y-3">
      <div role="group" aria-label={title} className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {groups.map((x) => (
          <button
            key={x.key}
            type="button"
            aria-pressed={x.key === g.key}
            onClick={() => setKey(x.key)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", x.key === g.key ? "bg-white text-[#031738] shadow-sm" : "text-slate-600 hover:text-slate-900")}
          >
            {x.label}
          </button>
        ))}
      </div>
      <SegmentTable title={title} rows={g.rows} heads={{ segment: g.segmentHead, ...heads }} empty={empty} />
    </div>
  );
}
