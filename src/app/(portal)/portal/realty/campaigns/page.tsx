import { getRealtyContext } from "@/lib/realty/context";
import { listCampaigns, listOpenPropertiesForSelect } from "@/lib/realty/queries";
import { enumLabel } from "@/lib/i18n-realty";
import { num, shortDate } from "@/lib/loyalty/format";
import { compactPrice } from "@/lib/realty/page-helpers";
import { Empty, Kpi, SectionCard } from "@/components/realty/RealtyBits";
import { CampaignEditToggle, CampaignForm, EMPTY_CAMPAIGN } from "@/components/realty/ManageForms";
import { cn } from "@/lib/utils";

const money = (n: number | null) => (n === null ? "—" : compactPrice(n));
const pctx = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const RATING_STYLE = { EFFICIENT: "bg-emerald-100 text-emerald-800", NORMAL: "bg-slate-100 text-slate-700", DEFICIENT: "bg-red-100 text-red-700", NO_DATA: "bg-slate-100 text-slate-500" } as const;

export default async function CampaignsPage() {
  const ctx = await getRealtyContext();
  const { R, lang } = ctx;
  const [{ rows, totals }, properties] = await Promise.all([listCampaigns(ctx.orgId), ctx.canManage ? listOpenPropertiesForSelect(ctx.orgId) : Promise.resolve([])]);
  const propOptions = properties.map((p) => ({ id: p.id, title: p.title }));
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <div className="space-y-6">
      <p className="rounded-md bg-[#F2F4F6] px-3 py-2 text-xs text-slate-600">{R.campaignsNote}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={R.spend} value={compactPrice(totals.spend)} />
        <Kpi label={R.leads} value={num(totals.leads)} />
        <Kpi label={R.cpl} value={money(totals.cpl)} />
        <Kpi label={R.costPerVisit} value={money(totals.costPerVisit)} />
        <Kpi label={R.costPerClosing} value={money(totals.costPerClosing)} />
        <Kpi label={R.roi} value={pctx(totals.roi)} />
      </div>
      {ctx.canManage && (
        <details className="rounded-card border border-slate-200 bg-white shadow-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#031738] sm:px-5">+ {R.newCampaign}</summary>
          <div className="border-t border-slate-100 p-4 sm:p-5">
            <CampaignForm initial={EMPTY_CAMPAIGN} properties={propOptions} />
          </div>
        </details>
      )}
      <SectionCard title={R.tabCampaigns}>
        {rows.length === 0 ? (
          <Empty>{R.campaignsEmpty}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {[R.campaign, R.channel, R.spend, R.leads, R.visits, R.closingsCount, R.cpl, R.costPerVisit, R.costPerClosing, R.roi, R.rating].map((h) => (
                    <th key={h} className="pb-2 pr-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.property?.title ?? "—"} · {shortDate(c.startDate, lang)} · {enumLabel(R, "cst", c.status)}</p>
                      {ctx.canManage && (
                        <CampaignEditToggle
                          properties={c.property && !propOptions.some((p) => p.id === c.property!.id) ? [...propOptions, { id: c.property.id, title: c.property.title }] : propOptions}
                          initial={{ id: c.id, name: c.name, channel: c.channel, propertyId: c.propertyId ?? "", spend: String(c.spend), startDate: day(c.startDate), endDate: day(c.endDate), leadsCount: String(c.leadsCount), visitsCount: String(c.visitsCount), closingsCount: String(c.closingsCount), attributedRevenue: c.attributedRevenue === null ? "" : String(c.attributedRevenue), status: c.status }}
                        />
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700">{enumLabel(R, "ch", c.channel)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{compactPrice(c.spend)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{c.leadsCount}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{c.visitsCount}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{c.closingsCount}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{money(c.metrics.cpl)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{money(c.metrics.costPerVisit)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{money(c.metrics.costPerClosing)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{pctx(c.metrics.roi)}</td>
                    <td className="py-2.5 pr-3"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", RATING_STYLE[c.rating])}>{enumLabel(R, "rate", c.rating)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
