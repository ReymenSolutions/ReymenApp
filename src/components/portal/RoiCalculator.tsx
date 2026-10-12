import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import type { RoiData } from "@/lib/roi";
import type { Lang } from "@/lib/i18n";

const RATE_SOURCE_LABEL = {
  es: { banxico: "tipo de cambio FIX de Banxico", frankfurter: "Banco Central Europeo", env: "tipo de cambio configurado manualmente" },
  en: { banxico: "Banxico FIX rate", frankfurter: "European Central Bank", env: "manually configured rate" },
} as const;

interface RoiCalculatorProps {
  data: RoiData;
  planLabel: string;
  lang: Lang;
}

export function RoiCalculator({ data, planLabel, lang }: RoiCalculatorProps) {
  // Si hay ventas ganadas pero ninguna se pudo convertir a USD, se muestra la
  // tarjeta con el aviso del tipo de cambio en vez de "aún no tienes ventas".
  if (!data.hasWonDeals && data.unconvertedOpportunities === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {lang === "es" ? "ROI real" : "Real ROI"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 text-center py-6">
            {lang === "es" ? (
              <>
                Aún no tienes oportunidades ganadas con valor registrado. Registra el valor de tus oportunidades en el{" "}
                <Link href="/portal/pipeline" className="text-brand-600 hover:underline font-medium">
                  Pipeline
                </Link>{" "}
                para ver tu ROI real aquí.
              </>
            ) : (
              <>
                You don&apos;t have any won opportunities with a recorded value yet. Record the value of your opportunities in the{" "}
                <Link href="/portal/pipeline" className="text-brand-600 hover:underline font-medium">
                  Pipeline
                </Link>{" "}
                to see your real ROI here.
              </>
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const roiPositive = (data.roi ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          {lang === "es" ? "ROI real" : "Real ROI"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: lang === "es" ? "Oportunidades ganadas (30 días)" : "Won opportunities (30 days)", value: data.last30WonOpportunities.toLocaleString("en-US"), color: "text-slate-900" },
            { label: lang === "es" ? "Ingresos reales (30 días)" : "Real revenue (30 days)", value: `$${data.last30Revenue.toLocaleString("en-US")} USD`, color: "text-emerald-600" },
            { label: lang === "es" ? "Valor promedio por deal" : "Average deal value", value: `$${Math.round(data.avgDealValue).toLocaleString("en-US")} USD`, color: "text-brand-600" },
            { label: lang === "es" ? "ROI real (30 días)" : "Real ROI (30 days)", value: data.roi !== null ? `${data.roi}%` : "—", color: roiPositive ? "text-emerald-600" : "text-red-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="info-box mt-4 rounded-lg border border-brand-100 bg-brand-50 p-3">
          <p className="info-box-title text-sm font-medium text-brand-900">
            {lang === "es" ? (
              <>
                Ingresos últimos 30 días:{" "}
                <span className="info-box-text text-brand-700">${data.last30Revenue.toLocaleString("en-US")} USD</span>
                {" "}vs. tu plan {planLabel}:{" "}
                <span className="info-box-text text-brand-700">{`$${data.planCostMxn.toLocaleString("en-US")} MXN/mes${data.planCost !== null ? ` (≈ $${data.planCost.toLocaleString("en-US")} USD)` : ""}`}</span>
              </>
            ) : (
              <>
                Revenue last 30 days:{" "}
                <span className="info-box-text text-brand-700">${data.last30Revenue.toLocaleString("en-US")} USD</span>
                {" "}vs. your {planLabel} plan:{" "}
                <span className="info-box-text text-brand-700">{`$${data.planCostMxn.toLocaleString("en-US")} MXN/mo${data.planCost !== null ? ` (≈ $${data.planCost.toLocaleString("en-US")} USD)` : ""}`}</span>
              </>
            )}
          </p>
          <p className="info-box-text text-xs text-brand-700 mt-0.5">
            {lang === "es" ? (
              <>
                Basado en {data.last30WonOpportunities} oportunidad{data.last30WonOpportunities === 1 ? "" : "es"} ganada
                {data.last30WonOpportunities === 1 ? "" : "s"} en tu pipeline durante los últimos 30 días. Histórico total:{" "}
                {data.totalWonOpportunities} oportunidades ganadas por ${data.totalRevenue.toLocaleString("en-US")} USD.
              </>
            ) : (
              <>
                Based on {data.last30WonOpportunities} won opportunit{data.last30WonOpportunities === 1 ? "y" : "ies"} in
                your pipeline over the last 30 days. All-time total:{" "}
                {data.totalWonOpportunities} won opportunities for ${data.totalRevenue.toLocaleString("en-US")} USD.
              </>
            )}
          </p>
          {data.mxnPerUsd !== null && (
            <p className="info-box-text text-xs text-brand-700 mt-1">
              {lang === "es"
                ? `Montos en MXN convertidos a USD con 1 USD = ${data.mxnPerUsd.toFixed(4)} MXN (${RATE_SOURCE_LABEL.es[data.rateSource ?? "env"]}${data.rateDate ? `, ${data.rateDate}` : ""}).`
                : `MXN amounts converted to USD at 1 USD = ${data.mxnPerUsd.toFixed(4)} MXN (${RATE_SOURCE_LABEL.en[data.rateSource ?? "env"]}${data.rateDate ? `, ${data.rateDate}` : ""}).`}
            </p>
          )}
        </div>

        {data.unconvertedOpportunities > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {lang === "es"
              ? `${data.unconvertedOpportunities} oportunidad(es) ganada(s) en MXN no se incluyen porque no se pudo obtener el tipo de cambio. Intenta más tarde o pide a tu administrador que configure MXN_PER_USD como respaldo.`
              : `${data.unconvertedOpportunities} won opportunit(ies) in MXN are not included because the exchange rate couldn't be retrieved. Try again later or ask your administrator to set MXN_PER_USD as a fallback.`}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
