"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { usePreferences } from "@/context/preferences";

export type AiCostPoint = { bucket: string; costMxn: number; calls: number };

/** Costo de IA por día, semana o mes (MXN). Solo datos reales del ledger. */
export function AiCostChart({ data }: { data: AiCostPoint[] }) {
  const { lang } = usePreferences();
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-slate-400">{lang === "es" ? "Sin consumo registrado en este periodo" : "No usage recorded in this period"}</p>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)} MXN`, lang === "es" ? "Costo" : "Cost"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
        <Bar dataKey="costMxn" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
