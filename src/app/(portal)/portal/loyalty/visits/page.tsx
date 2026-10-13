import Link from "next/link";
import { getLoyaltyContext } from "@/lib/loyalty/context";
import { getCheckoutMember, listRecentVisits } from "@/lib/loyalty/queries";
import { dateTime, money } from "@/lib/loyalty/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoProgram } from "@/components/loyalty/NoProgram";
import { RegisterVisitPanel } from "@/components/loyalty/RegisterVisitPanel";

export default async function LoyaltyVisitsPage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const ctx = await getLoyaltyContext();
  const { L, program, lang } = ctx;
  if (!program) return <NoProgram L={L} canManage={ctx.canManage} />;

  const sp = await searchParams;
  const [initialMember, visits] = await Promise.all([
    sp.member ? getCheckoutMember(ctx.orgId, sp.member.slice(0, 40), program.rule.visitGoal) : Promise.resolve(null),
    listRecentVisits(ctx.orgId, program.id, undefined, 15),
  ]);
  const tz = ctx.org.timezone;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">{L.visitsTitle}</CardTitle>
          <p className="text-sm text-slate-500">{L.visitsSubtitle}</p>
        </CardHeader>
        <CardContent>
          <RegisterVisitPanel
            branches={ctx.branches}
            fixedBranch={program.scope === "BRANCH" ? program.branchId : undefined}
            initialMember={initialMember}
            canOperate={ctx.canOperate}
            programActive={program.status === "ACTIVE"}
          />
        </CardContent>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle>{L.recentVisits}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {visits.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-slate-500">{L.noVisits}</p>
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-6 py-2.5 font-medium">{L.colWhen}</th>
                  <th className="px-3 py-2.5 font-medium">{L.colMember}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{L.colAmount}</th>
                  <th className="px-3 py-2.5 font-medium">{L.colBranch}</th>
                  <th className="hidden px-6 py-2.5 font-medium 2xl:table-cell">{L.colEmployee}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visits.map((v) => (
                  <tr key={v.id}>
                    <td className="whitespace-nowrap px-6 py-2.5 text-slate-600">{dateTime(v.occurredAt, lang, tz)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Link href={`/portal/loyalty/members/${v.memberId}`} className="font-medium text-slate-900 hover:text-brand-600 hover:underline">{v.memberName}</Link>
                      <span className="ml-1.5 text-xs text-slate-400">CP {v.postalCode}</span>
                      {v.rewardEarned && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">{L.rewardBadge(v.rewardEarned)}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{v.saleAmount !== null ? money(v.saleAmount, true) : "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">{v.branch ?? L.mainBranch}</td>
                    <td className="hidden px-6 py-2.5 text-slate-500 2xl:table-cell">{v.employee ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
