import Link from "next/link";
import { Suspense } from "react";
import { getLoyaltyContext } from "@/lib/loyalty/context";
import { listMemberPostalCodes, listMembers, type MemberProgressFilter, type MemberSort, type MemberStatusFilter } from "@/lib/loyalty/queries";
import { parseBranchParam } from "@/lib/branches";
import { money, num, relativeDay } from "@/lib/loyalty/format";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { NoProgram } from "@/components/loyalty/NoProgram";
import { MembersFilters } from "@/components/loyalty/MembersFilters";
import { ProgressDots } from "@/components/loyalty/ProgressBar";

const STATUS: MemberStatusFilter[] = ["active", "at_risk", "inactive"];
const PROGRESS: MemberProgressFilter[] = ["one_away", "near"];
const SORTS: MemberSort[] = ["recent_visit", "visits", "spent", "newest"];

export default async function LoyaltyMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cp?: string; status?: string; reward?: string; progress?: string; branch?: string; sort?: string; page?: string }>;
}) {
  const ctx = await getLoyaltyContext();
  const { L, program, lang } = ctx;
  if (!program) return <NoProgram L={L} canManage={ctx.canManage} />;

  const sp = await searchParams;
  const goal = program.rule.visitGoal;
  const filters = {
    q: sp.q?.slice(0, 80),
    postalCode: sp.cp && /^\d{5}$/.test(sp.cp) ? sp.cp : undefined,
    status: STATUS.includes(sp.status as MemberStatusFilter) ? (sp.status as MemberStatusFilter) : undefined,
    rewardAvailable: sp.reward === "1",
    progress: PROGRESS.includes(sp.progress as MemberProgressFilter) ? (sp.progress as MemberProgressFilter) : undefined,
    branch: parseBranchParam(sp.branch, ctx.branches),
    sort: SORTS.includes(sp.sort as MemberSort) ? (sp.sort as MemberSort) : undefined,
    page: Math.max(1, Number(sp.page) || 1),
  };
  const [list, postalCodes] = await Promise.all([listMembers(ctx.orgId, program.id, goal, filters), listMemberPostalCodes(ctx.orgId, program.id)]);

  const statusLabel = { active: L.statusActive, at_risk: L.statusAtRisk, inactive: L.statusInactive };
  const statusCls = { active: "bg-emerald-50 text-emerald-700", at_risk: "bg-amber-50 text-amber-700", inactive: "bg-slate-100 text-slate-600" };
  const pageHref = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
    next.set("page", String(p));
    return `/portal/food/loyalty/members?${next.toString()}`;
  };

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{L.membersTitle}</h2>
        <span className="text-sm text-slate-500">{L.membersCount(list.total)}</span>
      </div>
      <Suspense>
        <MembersFilters postalCodes={postalCodes} branches={ctx.branches} />
      </Suspense>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {list.rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">{list.total === 0 && !sp.q ? L.noMembersYet : L.noMembersMatch}</p>
          ) : (
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">{L.colMember}</th>
                  <th className="px-3 py-3 font-medium">{L.colWhatsapp}</th>
                  <th className="px-3 py-3 font-medium">{L.colPostalCode}</th>
                  <th className="px-3 py-3 text-right font-medium">{L.colVisits}</th>
                  <th className="px-3 py-3 font-medium">{L.colProgress}</th>
                  <th className="px-3 py-3 text-right font-medium">{L.colSpent}</th>
                  <th className="px-3 py-3 text-right font-medium">{L.colTicket}</th>
                  <th className="px-3 py-3 font-medium">{L.colLastVisit}</th>
                  <th className="px-3 py-3 font-medium">{L.colStatus}</th>
                  <th className="px-4 py-3 font-medium">{L.colReward}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.rows.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/portal/food/loyalty/members/${m.id}`} className="font-medium text-slate-900 hover:text-brand-600 hover:underline">{m.name}</Link>
                      {m.enrollmentBranch && <p className="text-xs text-slate-400">{m.enrollmentBranch}</p>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{m.maskedWhatsapp}</td>
                    <td className="px-3 py-2.5 text-slate-700">{m.postalCode}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{num(m.totalVisits)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20"><ProgressDots current={m.progress.current} goal={m.progress.goal} bar /></div>
                        <span className="text-xs tabular-nums text-slate-500">{m.progress.current}/{m.progress.goal}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(m.totalSpent)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.avgTicket > 0 ? money(m.avgTicket) : "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{m.lastVisitAt ? relativeDay(m.lastVisitAt, lang) : L.never}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusCls[m.status])}>{statusLabel[m.status]}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {m.availableRewards > 0 ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          🎁 {L.rewardAvailable}{m.availableRewards > 1 ? ` ×${m.availableRewards}` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {list.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {list.page > 1 ? <Link href={pageHref(list.page - 1)} className="font-medium text-brand-600 hover:underline">{L.prevPage}</Link> : <span />}
          <span className="text-slate-500">{L.pageOf(list.page, list.pages)}</span>
          {list.page < list.pages ? <Link href={pageHref(list.page + 1)} className="font-medium text-brand-600 hover:underline">{L.nextPage}</Link> : <span />}
        </div>
      )}
    </div>
  );
}
