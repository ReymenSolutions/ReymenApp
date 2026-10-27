import Link from "next/link";
import { getRealtyContext } from "@/lib/realty/context";
import { listProspects, listZones } from "@/lib/realty/queries";
import { enumLabel } from "@/lib/i18n-realty";
import { relativeDay } from "@/lib/loyalty/format";
import { budgetText, one } from "@/lib/realty/page-helpers";
import { OPERATIONS } from "@/lib/realty/constants";
import { parsePaging } from "@/lib/paging";
import { UrlPagination } from "@/components/shared/Pagination";
import { Empty, ScorePill } from "@/components/realty/RealtyBits";
import { FilterBar } from "@/components/realty/FilterBar";

type SP = { q?: string; operation?: string; zone?: string; status?: string; page?: string; ps?: string };

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await getRealtyContext();
  const { R, lang } = ctx;
  const sp = await searchParams;
  const operation = one(sp.operation, OPERATIONS);
  const status = one(sp.status, ["active", "inactive", "all"] as const) ?? "active";
  const { page, pageSize } = parsePaging(sp, 25);
  const [{ rows, total }, zones] = await Promise.all([listProspects(ctx.orgId, { q: sp.q, operation, zoneId: sp.zone || undefined, status }, { page, pageSize }), listZones(ctx.orgId)]);

  return (
    <div>
      <FilterBar
        submitLabel={R.filter}
        fields={[
          { name: "q", label: R.search, value: sp.q, placeholder: `${R.name}, ${R.phone.toLowerCase()}…` },
          { name: "operation", label: R.operation, value: operation, options: [{ value: "", label: R.all }, ...OPERATIONS.map((o) => ({ value: o, label: enumLabel(R, "opBuy", o) }))] },
          { name: "zone", label: R.zone, value: sp.zone, options: [{ value: "", label: R.all }, ...zones.map((z) => ({ value: z.id, label: z.name }))] },
          { name: "status", label: R.status, value: status, options: [{ value: "active", label: R.active }, { value: "inactive", label: R.inactive }, { value: "all", label: R.all }] },
        ]}
        extra={ctx.canOperate && <Link href="/portal/realty/prospects/new" className="ml-auto inline-flex h-9 items-center rounded-md bg-[#22C55E] px-4 text-sm font-semibold text-[#080C13] hover:bg-[#16a34a]">{R.newProspect}</Link>}
      />
      {rows.length === 0 ? (
        <Empty>{R.prospectsEmpty}</Empty>
      ) : (
        <>
        <ul className="space-y-2 sm:hidden">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/portal/realty/prospects/${p.id}`} className="flex items-start justify-between gap-3 rounded-card border border-slate-200 bg-white p-3 shadow-card">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{p.lead?.name ?? R.prospect}</p>
                  <p className="text-xs text-slate-600">{enumLabel(R, "type", p.propertyType)} · {enumLabel(R, "opBuy", p.operation)} · {budgetText(p.minBudget, p.maxBudget)}</p>
                  <p className="truncate text-xs text-slate-500">{p.zones.map((z) => z.zone.name).join(", ") || "—"} · {relativeDay(p.createdAt, lang)}</p>
                </div>
                <ScorePill value={p.bestMatch} />
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-card border border-slate-200 bg-white shadow-card sm:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#F2F4F6] text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{R.prospect}</th>
                <th className="px-4 py-2.5 font-semibold">{R.lookingFor}</th>
                <th className="px-4 py-2.5 font-semibold">{R.budget}</th>
                <th className="px-4 py-2.5 font-semibold">{R.zones}</th>
                <th className="px-4 py-2.5 font-semibold">{R.bestMatch}</th>
                <th className="px-4 py-2.5 font-semibold">{R.advisor}</th>
                <th className="px-4 py-2.5 font-semibold">{R.createdAt}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/portal/realty/prospects/${p.id}`} className="font-semibold text-slate-900 hover:text-[#063C82] hover:underline">{p.lead?.name ?? R.prospect}</Link>
                    <p className="text-xs text-slate-500">{p.lead?.phone ?? ""}{!p.active && ` · ${R.inactive}`}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{enumLabel(R, "type", p.propertyType)} · {enumLabel(R, "opBuy", p.operation)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-700">{budgetText(p.minBudget, p.maxBudget)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{p.zones.map((z) => z.zone.name).join(", ") || "—"}</td>
                  <td className="px-4 py-2.5"><ScorePill value={p.bestMatch} /></td>
                  <td className="px-4 py-2.5 text-slate-700">{p.advisor?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{relativeDay(p.createdAt, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded-card border border-slate-200 bg-white shadow-card">
          <UrlPagination page={page} pageSize={pageSize} total={total} className="border-t-0" />
        </div>
        </>
      )}
    </div>
  );
}
