import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ExternalLink, Pencil } from "lucide-react";
import { getRealtyContext } from "@/lib/realty/context";
import { analyze, getProperty, listActiveProspectsForSelect, listAdvisors, loadSnapshot } from "@/lib/realty/queries";
import { enumLabel } from "@/lib/i18n-realty";
import { hasModule } from "@/lib/modules";
import { appUrl } from "@/lib/app-url";
import { dateTime, num, shortDate } from "@/lib/loyalty/format";
import { OPEN_STATUSES } from "@/lib/realty/constants";
import { priceText } from "@/lib/realty/page-helpers";
import { PROPERTY_SCORE_WEIGHTS } from "@/lib/realty/scores";
import { Empty, ScoreBar, ScorePill, SectionCard, StatusBadge } from "@/components/realty/RealtyBits";
import { ClosingForm, CopyLink, PhotoManager, StatusChanger } from "@/components/realty/PropertyTools";
import { VisitForm, VisitActions } from "@/components/realty/VisitForm";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getRealtyContext();
  const { R, lang } = ctx;
  const { id } = await params;
  const now = new Date();
  const [p, snap, smartcard] = await Promise.all([getProperty(ctx.orgId, id, now), loadSnapshot(ctx.orgId, now), hasModule(ctx.orgId, "NFC_QR")]);
  if (!p) notFound();
  const a = analyze(snap, { from: new Date(now.getTime() - 30 * 86_400_000), to: now });
  const score = a.scores.get(p.id);
  const insight = a.priceInsightFor(p.id);
  const open = OPEN_STATUSES.includes(p.status);
  const [prospects, advisors] = ctx.canOperate ? await Promise.all([listActiveProspectsForSelect(ctx.orgId), listAdvisors(ctx.orgId)]) : [[], []];
  const prospectOptions = [
    ...p.matches.filter((m) => m.profile.active).map((m) => ({ id: m.profile.id, name: `${m.profile.lead?.name ?? R.prospect} (${m.totalScore})` })),
    ...prospects.filter((x) => x.operation === p.operation && !p.matches.some((m) => m.profile.id === x.id)).map((x) => ({ id: x.id, name: x.lead?.name ?? R.prospect })),
  ];

  const publicUrl = appUrl(`/p/${p.slug}`);
  const smartcardUrl = `${publicUrl}?src=smartcard`;
  const qr = p.publishedAt ? await QRCode.toDataURL(smartcardUrl, { margin: 1, width: 320, color: { dark: "#031738", light: "#ffffff" } }) : null;
  const ev = p.events;
  const facts: [string, string][] = [
    [R.type, enumLabel(R, "type", p.propertyType)],
    [R.operation, enumLabel(R, "op", p.operation)],
    [R.zone, `${p.zone.name}${p.neighborhood ? ` · ${p.neighborhood}` : ""}`],
    [R.bedrooms, p.bedrooms?.toString() ?? "—"],
    [R.bathrooms, p.bathrooms?.toString() ?? "—"],
    [R.parking, p.parkingSpaces?.toString() ?? "—"],
    [R.constructionArea, p.constructionArea ? `${num(p.constructionArea)} m²` : "—"],
    [R.landArea, p.landArea ? `${num(p.landArea)} m²` : "—"],
    [R.age, p.ageYears?.toString() ?? "—"],
    [R.features, p.features.map((f) => enumLabel(R, "feat", f)).join(", ") || "—"],
    [R.advisor, p.advisor?.name ?? "—"],
    [R.address, p.addressLine ?? "—"],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} label={enumLabel(R, "st", p.status)} />
            {!p.publishedAt && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{R.draft}</span>}
          </div>
          <h2 className="mt-1 text-xl font-bold text-[#031738] dark:text-white">{p.title}</h2>
          <p className="text-lg font-bold text-slate-900">{priceText(p.price, p.currency)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.publishedAt && (
            <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {R.publicPage}
            </a>
          )}
          {ctx.canOperate && (
            <Link href={`/portal/realty/properties/${p.id}/edit`} className="inline-flex items-center gap-1.5 rounded-md bg-[#031738] px-3 py-2 text-sm font-semibold text-white hover:bg-[#04275A]">
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {R.edit}
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title={R.photos}>
            {p.media.length === 0 && !ctx.canOperate ? <Empty>{R.pubNoPhotos}</Empty> : <PhotoManager propertyId={p.id} media={p.media} canEdit={ctx.canOperate} title={p.title} />}
          </SectionCard>

          <SectionCard title={R.property}>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-50 py-1">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
            {p.description && <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{p.description}</p>}
          </SectionCard>

          <SectionCard title={R.matchesTitle} subtitle={R.matchesSubtitle}>
            {p.matches.length === 0 ? (
              <Empty>{R.matchesEmpty}</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {p.matches.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`/portal/realty/prospects/${m.profile.id}`} className="min-w-0 truncate font-medium text-slate-900 hover:underline">{m.profile.lead?.name ?? R.prospect}</Link>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {R.matchBudget} {m.budgetScore} · {R.matchZone} {m.zoneScore}
                      <ScorePill value={m.totalScore} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={R.visits} subtitle={R.visitAgendaNote}>
            {ctx.canOperate && open && (
              <div className="mb-4 rounded-lg bg-[#F2F4F6] p-4">
                <VisitForm properties={[]} prospects={prospectOptions} advisors={advisors} defaultPropertyId={p.id} defaultAdvisorId={p.advisorUserId ?? undefined} />
              </div>
            )}
            {p.visits.length === 0 ? (
              <Empty>{R.visitsEmpty}</Empty>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {p.visits.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium text-slate-900">{v.profile?.lead?.name ?? "—"}</p>
                      <p className="text-xs text-slate-500">{dateTime(v.appointment.startTime, lang, ctx.org.timezone)} · {enumLabel(R, "ap", v.appointment.status)}{v.outcome ? ` · ${v.outcome}` : ""}</p>
                    </div>
                    {ctx.canOperate && <VisitActions visitId={v.id} status={v.appointment.status} outcome={v.outcome} />}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title={R.opportunityScore} subtitle={R.opportunityNote}>
            {score ? (
              <>
                <div className="mb-3 flex items-center gap-3">
                  <ScorePill value={score.total} />
                  <span className="text-xs text-slate-500">0–100</span>
                </div>
                <div className="space-y-1.5">
                  <ScoreBar stacked label={`${R.scoreZoneDemand} · ${PROPERTY_SCORE_WEIGHTS.zoneDemand}%`} value={score.zoneDemand} />
                  <ScoreBar stacked label={`${R.scorePriceFit} · ${PROPERTY_SCORE_WEIGHTS.priceFit}%`} value={score.priceFit} />
                  <ScoreBar stacked label={`${R.scoreEngagement} · ${PROPERTY_SCORE_WEIGHTS.engagement}%`} value={score.engagement} />
                  <ScoreBar stacked label={`${R.scoreFreshness} · ${PROPERTY_SCORE_WEIGHTS.freshness}%`} value={score.freshness} />
                  <ScoreBar stacked label={`${R.scoreCompetition} · ${PROPERTY_SCORE_WEIGHTS.competition}%`} value={score.competition} />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {score.facts.demand} {R.prospects.toLowerCase()} · {score.facts.supply} {R.supply.toLowerCase()} · {score.facts.fitting} {R.budget.toLowerCase()} OK · {score.facts.points} {R.points} · {R.daysListed(score.facts.days)} · {score.facts.competitors} {R.scoreCompetition.toLowerCase()}
                </p>
              </>
            ) : (
              <Empty>{enumLabel(R, "st", p.status)}</Empty>
            )}
          </SectionCard>

          <SectionCard title={R.priceInsight} subtitle={R.priceInsightDisclaimer}>
            {insight && (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-slate-900">{enumLabel(R, "pi", insight.position)}{insight.diffPct !== null && ` (${insight.diffPct > 0 ? "+" : ""}${insight.diffPct}%)`}</p>
                {insight.median !== null && (
                  <p className="text-slate-600">
                    {insight.basis === "m2" ? R.pricePerM2 : R.price}: {priceText(insight.subject)} · {R.medianOfComparables(insight.sample)}: {priceText(insight.median)}
                  </p>
                )}
                {insight.budgetFitPct !== null && <p className="text-slate-600">{R.budgetFit(insight.budgetFitPct)}</p>}
                <p className="rounded bg-[#F2F4F6] px-2 py-1 text-xs text-slate-500">{insight.disclaimer}</p>
              </div>
            )}
          </SectionCard>

          <SectionCard title={R.interest30}>
            <dl className="grid grid-cols-4 gap-2 text-center">
              {([[R.views, ev.VIEW], [R.whatsappClicks, ev.WHATSAPP_CLICK], [R.scheduleClicks, ev.SCHEDULE_CLICK], [R.shareClicks, ev.SHARE_CLICK]] as const).map(([k, v]) => (
                <div key={k} className="rounded-md bg-[#F2F4F6] p-2">
                  <dd className="text-lg font-bold tabular-nums text-[#031738]">{num(v ?? 0)}</dd>
                  <dt className="text-[11px] text-slate-500">{k}</dt>
                </div>
              ))}
            </dl>
            {p.sources.length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                {R.bySource}: {p.sources.map((s) => `${s.source} ${s.count}`).join(" · ")}
              </p>
            )}
          </SectionCard>

          <SectionCard title={R.smartcardTitle} subtitle={R.smartcardDesc}>
            {qr ? (
              <div className="space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={`QR ${p.title}`} className="mx-auto h-40 w-40" />
                <p className="break-all rounded bg-[#F2F4F6] px-2 py-1 text-[11px] text-slate-600">{smartcardUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <CopyLink url={smartcardUrl} />
                  <a href={qr} download={`qr-${p.slug}.png`} className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">{R.downloadQr}</a>
                  {smartcard && <Link href="/portal/smartcard" className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#063C82] hover:bg-slate-50">{R.openSmartcard}</Link>}
                </div>
              </div>
            ) : (
              <Empty>{R.notPublished}</Empty>
            )}
          </SectionCard>

          {ctx.canOperate && (
            <SectionCard title={R.changeStatus}>
              {open ? <StatusChanger propertyId={p.id} status={p.status} /> : <p className="text-sm text-slate-500">{enumLabel(R, "st", p.status)}</p>}
              {open && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-[#063C82]">{R.registerClosing}</summary>
                  <div className="mt-3">
                    <ClosingForm propertyId={p.id} price={p.price} prospects={prospectOptions} advisors={advisors} defaultAdvisorId={p.advisorUserId ?? undefined} />
                  </div>
                </details>
              )}
              {p.closings.map((c) => (
                <p key={c.id} className="mt-3 text-xs text-slate-600">
                  {R.kpiClosings}: {priceText(Number(c.finalAmount))} · {shortDate(c.closedAt, lang)}{c.commissionAmount ? ` · ${R.commission} ${priceText(Number(c.commissionAmount))}` : ""}
                </p>
              ))}
            </SectionCard>
          )}

          <SectionCard title={R.history}>
            <ol className="space-y-2 text-xs">
              {p.statusHistory.map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <span className="text-slate-700">
                    {h.fromStatus ? `${enumLabel(R, "st", h.fromStatus)} → ` : ""}
                    <strong>{enumLabel(R, "st", h.toStatus)}</strong>
                    {h.notes ? ` · ${h.notes}` : ""}
                  </span>
                  <span className="shrink-0 text-slate-500">{shortDate(h.changedAt, lang)}{h.changedByName ? ` · ${h.changedByName}` : ""}</span>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
