import Link from "next/link";
import { getRealtyContext } from "@/lib/realty/context";
import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES } from "@/lib/realty/constants";
import { priceText } from "@/lib/realty/page-helpers";
import { Empty, ScorePill, SectionCard } from "@/components/realty/RealtyBits";
import { MatchBreakdown } from "@/components/realty/MatchBreakdown";
import { RecomputeButton } from "@/components/realty/PropertyTools";

const MIN_OPTIONS = [80, 65, 50] as const;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ min?: string }> }) {
  const ctx = await getRealtyContext();
  const { R } = ctx;
  const sp = await searchParams;
  const min = MIN_OPTIONS.find((m) => String(m) === sp.min) ?? 65;
  const rows = await prisma.realtyMatch.findMany({
    where: { organizationId: ctx.orgId, totalScore: { gte: min }, profile: { active: true }, property: { status: { in: OPEN_STATUSES } } },
    orderBy: [{ totalScore: "desc" }, { calculatedAt: "desc" }],
    take: 150,
    include: {
      profile: { select: { id: true, lead: { select: { name: true } } } },
      property: { select: { id: true, title: true, price: true, currency: true, zone: { select: { name: true } } } },
    },
  });

  return (
    <SectionCard title={R.matchesTitle} subtitle={R.matchesSubtitle}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">{R.minScore}</span>
        {MIN_OPTIONS.map((m) => (
          <Link key={m} href={`/portal/realty/matches?min=${m}`} aria-current={m === min ? "true" : undefined} className={m === min ? "rounded-full bg-[#031738] px-3 py-1 text-xs font-semibold text-white" : "rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:border-[#063C82]"}>
            ≥ {m}
          </Link>
        ))}
        {ctx.canManage && <div className="ml-auto"><RecomputeButton /></div>}
      </div>
      {rows.length === 0 ? (
        <Empty>{R.matchesEmpty}</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((m) => (
            <li key={m.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <Link href={`/portal/realty/prospects/${m.profile.id}`} className="font-semibold text-slate-900 hover:underline">{m.profile.lead?.name ?? R.prospect}</Link>
                  <span className="text-slate-400"> ↔ </span>
                  <Link href={`/portal/realty/properties/${m.property.id}`} className="font-semibold text-[#063C82] hover:underline">{m.property.title}</Link>
                  <p className="text-xs text-slate-500">{m.property.zone.name} · {priceText(Number(m.property.price), m.property.currency)}</p>
                </div>
                <ScorePill value={m.totalScore} />
              </div>
              <MatchBreakdown R={R} m={m} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
