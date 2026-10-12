"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { usePreferences } from "@/context/preferences";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { MOTION } from "@/lib/motion";

interface DataPoint {
  date: string;
  total: number;
}

interface LeadTrendChartProps {
  data: DataPoint[];
}

export function LeadTrendChart({ data }: LeadTrendChartProps) {
  const { lang } = usePreferences();
  const reduced = useReducedMotion();
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-slate-400">{lang === "es" ? "Sin datos de leads en los últimos 30 días" : "No lead data in the last 30 days"}</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          labelStyle={{ color: "#475569" }}
          formatter={(value: number) => [value, "Leads"]}
        />
        <Bar dataKey="total" isAnimationActive={!reduced} animationDuration={MOTION.count} animationEasing="ease-out" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
