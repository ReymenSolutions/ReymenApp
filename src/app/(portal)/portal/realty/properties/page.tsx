import Link from "next/link";
import { getRealtyContext } from "@/lib/realty/context";
import { analyze, listProperties, listZones, loadSnapshot } from "@/lib/realty/queries";
import { enumLabel } from "@/lib/i18n-realty";
import { daysBetween, OPERATIONS, PROPERTY_STATUSES, PROPERTY_TYPES } from "@/lib/realty/constants";
import { one, priceText } from "@/lib/realty/page-helpers";
import { Empty, ScorePill, StatusBadge, Thumb } from "@/components/realty/RealtyBits";
import { parsePaging } from "@/lib/paging";
import { UrlPagination } from "@/components/shared/Pagination";
import { FilterBar } from "@/components/realty/FilterBar";

type SP = { q?: string; status?: string; operation?: string; zone?: string; type?: string; page?: string; ps?: string };

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await getRealtyContext();
  const { R } = ctx;
  const sp = await searchParams;
  const status = sp.status === "" ? undefined : (one(sp.status, [...PROPERTY_STATUSES, "open"] as const) ?? "open");
  const operation = one(sp.operation, OPERATIONS);
  const type = one(sp.type, PROPERTY_TYPES);
  const now = new Date();
  const { page, pageSize } = parsePaging(sp, 25);
  const [{ rows, total }, zones, snap] = await Promise.all([listProperties(ctx.orgId, { q: sp.q, status, operation, zoneId: sp.zone || undefined, type }, { page, pageSize }), listZones(ctx.orgId), loadSnapshot(ctx.orgId, now)]);
  const a = analyze(snap, { from: new Date(now.getTime() - 30 * 86_400_000), to: now });

  return (
    <div>
      <FilterBar
        submitLabel={R.filter}
        fields={[
          { name: "q", label: R.search, value: sp.q, placeholder: `${R.title}, ${R.neighborhood.toLowerCase()}…` },
          { name: "status", label: R.status, value: status ?? "", options: [{ value: "open", label: `${R.stAVAILABLE} + ${R.stRESERVED} + ${R.stNEGOTIATION}` }, { value: "", label: R.all }, ...PROPERTY_STATUSES.map((s) => ({ value: s, label: enumLabel(R, "st", s) }))] },
          { name: "operation", label: R.operation, value: operation, options: [{ value: "", label: R.all }, ...OPERATIONS.map((o) => ({ value: o, label: enumLabel(R, "op", o) }))] },
          { name: "type", label: R.type, value: type, options: [{ value: "", label: R.all }, ...PROPERTY_TYPES.map((t) => ({ value: t, label: enumLabel(R, "type", t) }))] },
          { name: "zone", label: R.zone, value: sp.zone, options: [{ value: "", label: R.all }, ...zones.map((z) => ({ value: z.id, label: z.name }))] },
        ]}
        extra={ctx.canOperate && <Link href="/portal/realty/properties/new" className="ml-auto inline-flex h-9 items-center rounded-md bg-[#22C55E] px-4 text-sm font-semibold text-[#080C13] hover:bg-[#16a34a]">{R.newProperty}</Link>}
      />
      {rows.length === 0 ? (
        <Empty>{R.propertiesEmpty}</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const s = a.scores.get(p.id);
            return (
              <li key={p.id}>
                <Link href={`/portal/realty/properties/${p.id}`} className="block overflow-hidden rounded-card border border-slate-200 bg-white shadow-card transition-colors hover:border-[#063C82]">
                  <div className="relative">
                    <Thumb mediaId={p.coverId} alt={p.title} className="aspect-[3/2] w-full" />
                    <div className="absolute left-2 top-2 flex gap-1.5">
                      <StatusBadge status={p.status} label={enumLabel(R, "st", p.status)} />
                      {!p.publishedAt && <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{R.draft}</span>}
                    </div>
                    {s && <div className="absolute right-2 top-2"><ScorePill value={s.total} title={R.opportunityScore} /></div>}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold text-slate-900">{p.title}</p>
                    <p className="truncate text-xs text-slate-500">{p.zone.name}{p.neighborhood ? ` · ${p.neighborhood}` : ""} · {enumLabel(R, "type", p.propertyType)} · {enumLabel(R, "op", p.operation)}</p>
                    <p className="mt-1 text-base font-bold text-[#031738] dark:text-white">{priceText(p.price, p.currency)}{p.operation === "RENT" && <span className="text-xs font-normal text-slate-500"> /{ctx.lang === "es" ? "mes" : "mo"}</span>}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[p.bedrooms !== null && `${p.bedrooms} ${R.bedrooms.toLowerCase()}`, p.bathrooms !== null && `${p.bathrooms} ${R.bathrooms.toLowerCase()}`, p.constructionArea && `${p.constructionArea} m²`].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                      <span>{R.daysListed(daysBetween(p.availableSince, now))}</span>
                      <span>{p._count.matches} matches</span>
                      <span>{p._count.visits} {R.visits.toLowerCase()}</span>
                      {p.advisor?.name && <span>{p.advisor.name}</span>}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <div className="mt-4 rounded-card border border-slate-200 bg-white shadow-card">
          <UrlPagination page={page} pageSize={pageSize} total={total} className="border-t-0" />
        </div>
      )}
    </div>
  );
}
