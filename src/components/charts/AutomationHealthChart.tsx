"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { usePreferences } from "@/context/preferences";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { MOTION } from "@/lib/motion";

interface AutomationHealthChartProps {
  success: number;
  failed: number;
  pending: number;
}

export function AutomationHealthChart({ success, failed, pending }: AutomationHealthChartProps) {
  const { lang } = usePreferences();
  const reduced = useReducedMotion();
  const data = [
    { name: lang === "es" ? "Exitosos" : "Successful", value: success, color: "#10b981" },
    { name: lang === "es" ? "Fallidos" : "Failed", value: failed, color: "#ef4444" },
    { name: lang === "es" ? "Pendientes" : "Pending", value: pending, color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-slate-400">{lang === "es" ? "Sin eventos de automatización" : "No automation events"}</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
          isAnimationActive={!reduced}
          animationDuration={MOTION.count}
          animationEasing="ease-out"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(value: number) => [value, lang === "es" ? "eventos" : "events"]}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
