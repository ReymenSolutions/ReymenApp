import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ScanLine, ExternalLink, Gift, CheckCircle2 } from "lucide-react";
import { getLoyaltyContext } from "@/lib/loyalty/context";
import { getMemberProfile } from "@/lib/loyalty/queries";
import { memberCardPath } from "@/lib/loyalty/token";
import { getAppUrl } from "@/lib/app-url";
import { dateTime, formatPhone, money, num, relativeDay, shortDate } from "@/lib/loyalty/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoProgram } from "@/components/loyalty/NoProgram";
import { ProgressDots } from "@/components/loyalty/ProgressBar";
import { RedeemRewardButton } from "@/components/loyalty/RedeemRewardButton";

export default async function LoyaltyMemberPage({ params }: { params: Promise<{ memberId: string }> }) {
  const ctx = await getLoyaltyContext();
  const { L, program, lang } = ctx;
  if (!program) return <NoProgram L={L} canManage={ctx.canManage} />;
  const { memberId } = await params;
  const m = await getMemberProfile(ctx.orgId, memberId, program.rule.visitGoal);
  if (!m) notFound();

  const tz = ctx.org.timezone;
  const cardPath = memberCardPath(ctx.org.slug, m.publicToken);
  const qr = await QRCode.toDataURL(`${getAppUrl()}${cardPath}`, { margin: 1, width: 220 });
  const statusLabel = { active: L.statusActive, at_risk: L.statusAtRisk, inactive: L.statusInactive }[m.status];
  const statusCls = { active: "bg-emerald-50 text-emerald-700", at_risk: "bg-amber-50 text-amber-700", inactive: "bg-slate-100 text-slate-600" }[m.status];
  const fixedBranch = program.scope === "BRANCH" ? program.branchId : undefined;

  const facts: [string, string][] = [
    [L.profileWhatsapp, formatPhone(m.whatsapp)],
    [L.profileEmail, m.email ?? "—"],
    [L.profilePostalCode, m.postalCode],
    [L.profileEnrolled, shortDate(m.createdAt, lang, tz)],
    [L.profileEnrollmentBranch, m.enrollmentBranch ?? L.mainBranch],
    [L.profileLastVisit, m.lastVisitAt ? relativeDay(m.lastVisitAt, lang) : L.never],
  ];

  return (
    <div>
      <Link href="/portal/food/loyalty/members" className="text-sm font-medium text-brand-600 hover:underline">{L.backToMembers}</Link>
      <div className="mb-5 mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">{m.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{m.name}</h2>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusCls)}>{statusLabel}</span>
          </div>
        </div>
        {ctx.canOperate && program.status === "ACTIVE" && (
          <Link href={`/portal/food/loyalty/visits?member=${m.id}`} className="inline-flex items-center gap-2 self-start rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 sm:self-auto">
            <ScanLine className="h-4 w-4" aria-hidden="true" />
            {L.registerVisitCta}
          </Link>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{L.profileProgress}</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <p className="text-4xl font-bold tabular-nums text-slate-900">
                {m.progress.current}<span className="text-xl text-slate-400"> / {m.progress.goal}</span>
              </p>
              <p className="text-sm text-slate-600">{program.rule.rewardName}</p>
            </div>
            <div className="mt-3"><ProgressDots current={m.progress.current} goal={m.progress.goal} size="lg" /></div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                [L.profileTotalVisits, num(m.totalVisits)],
                [L.profileSpent, money(m.totalSpent)],
                [L.profileAvgTicket, m.avgTicket > 0 ? money(m.avgTicket) : "—"],
                [L.profileRewardsEarned, num(m.rewardsEarned)],
                [L.profileRewardsRedeemed, num(m.rewardsRedeemed)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[11px] font-medium text-slate-500">{k}</p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{v}</p>
                </div>
              ))}
            </div>
            <dl className="mt-6 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-100 py-2 text-sm">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{L.profileCard}</CardTitle>
            <p className="text-xs text-slate-500">{L.profileCardHint}</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={L.qrAlt} width={180} height={180} className="rounded-lg border border-slate-100" />
            <a href={cardPath} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {L.openCard}
            </a>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{L.profileRewards}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {m.rewards.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-slate-500">{L.noRewardsYet}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {m.rewards.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", r.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400")}>
                      {r.status === "AVAILABLE" ? <Gift className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {r.rewardName} <span className="text-xs font-normal text-slate-400">· {L.cycleLabel(r.cycleNumber)}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.status === "AVAILABLE"
                          ? `${L.rewardEarnedAt(relativeDay(r.earnedAt, lang))} · ${L.rewardAvailable}`
                          : L.rewardRedeemedAt(shortDate(r.redeemedAt, lang, tz), r.redeemedBranch ?? L.mainBranch)}
                      </p>
                      <p className="text-[11px] text-slate-400">{L.rewardRuleSnapshot(r.visitGoal, r.programVersion)}</p>
                    </div>
                    {r.status === "AVAILABLE" && ctx.canOperate && (
                      <RedeemRewardButton rewardId={r.id} rewardName={r.rewardName} branches={ctx.branches} fixedBranch={fixedBranch} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{L.profileHistory}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {m.visits.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-slate-500">{L.noVisitsYet}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {m.visits.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-6 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{L.visitRow(v.saleAmount !== null ? money(v.saleAmount, true) : null)}</p>
                      <p className="text-xs text-slate-500">
                        {v.branch ?? L.mainBranch}
                        {v.employee ? ` · ${L.registeredBy(v.employee)}` : ""}
                      </p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-slate-500">{dateTime(v.occurredAt, lang, tz)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
