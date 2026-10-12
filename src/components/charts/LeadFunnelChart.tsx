"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { usePreferences } from "@/context/preferences";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { MOTION } from "@/lib/motion";

interface FunnelItem {
  label: string;
  count: number;
  color: string;
}

interface LeadFunnelChartProps {
  data: FunnelItem[];
}

export function LeadFunnelChart({ data }: LeadFunnelChartProps) {
  const { lang } = usePreferences();
  const reduced = useReducedMotion();

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-slate-400">{lang === "es" ? "Sin datos de leads" : "No lead data"}</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={90}
          tick={{ fontSize: 11, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(value: number) => [value, "Leads"]}
        />
        <Bar dataKey="count" isAnimationActive={!reduced} animationDuration={MOTION.count} animationEasing="ease-out" radius={[0, 3, 3, 0]} maxBarSize={20}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
