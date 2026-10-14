import type { Metadata } from "next";
import QRCode from "qrcode";
import { Gift, PartyPopper, Smartphone, Wallet } from "lucide-react";
import { getPublicCard } from "@/lib/loyalty/service";
import { progressOf } from "@/lib/loyalty/cycle";
import { firstName, memberCardPath, TOKEN_PATTERN } from "@/lib/loyalty/token";
import { getWalletAvailability } from "@/lib/loyalty/wallet";
import { getAppUrl } from "@/lib/app-url";
import { getServerLang } from "@/lib/i18n-server";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { shortDate } from "@/lib/loyalty/format";
import { ProgressDots } from "@/components/loyalty/ProgressBar";
import { PublicMessage, PublicShell } from "@/components/loyalty/PublicShell";

// La tarjeta es personal: no se indexa y no manda el token como Referer a otros sitios.
export const metadata: Metadata = { title: "Mi tarjeta de lealtad", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function LoyaltyCardPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const [{ slug, token }, lang] = await Promise.all([params, getServerLang()]);
  const L = pickDict(loyaltyStrings, lang);
  const card = TOKEN_PATTERN.test(token) ? await getPublicCard(slug, token) : null;
  if (!card) return <PublicMessage text={L.cardNotFound} />;

  const { org, program, member } = card;
  const p = progressOf(member.cycleVisits, program.rule.visitGoal);
  const url = `${getAppUrl()}${memberCardPath(org.slug, token)}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: "M" });
  const wallet = getWalletAvailability();
  const reward = member.availableRewards[0] ?? null;

  return (
    <PublicShell businessName={org.name} logoUrl={org.logoUrl}>
      {/* Tarjeta */}
      <div className="bg-gradient-to-br from-brand-900 to-brand-950 px-6 pb-6 pt-5 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-300">{program.name}</p>
        <p className="mt-3 text-lg text-brand-100">{L.hello(firstName(member.name))}</p>
        <p className="text-4xl font-bold tabular-nums">{L.visitsOf(p.current, p.goal)}</p>
        <div className="mt-3 rounded-xl bg-white/10 p-3">
          <ProgressDots current={p.current} goal={p.goal} size="lg" />
        </div>
        {!reward && (
          <p className="mt-3 text-base font-semibold">
            {L.remainingVisits(p.remaining)} <span className="font-normal text-brand-100">· {program.rule.rewardName}</span>
          </p>
        )}
      </div>

      {member.deficitVisits > 0 && <p role="status" className="mx-6 my-4 text-sm">{lang === "es" ? `Visitas por compensar tras cancelaciones: ${member.deficitVisits}.` : `Visits to replace after cancellations: ${member.deficitVisits}.`}</p>}
      {reward && (
        <div className="mx-6 -mt-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 text-center text-white shadow-lg">
          <PartyPopper className="mx-auto h-8 w-8" aria-hidden="true" />
          <p className="mt-1 text-lg font-bold">{L.rewardReadyTitle}</p>
          <p className="text-base">{reward.rewardName}</p>
          <p className="mt-1 inline-block rounded-full bg-white/20 px-3 py-0.5 text-xs font-semibold">{L.rewardReadyStatus}</p>
          {member.availableRewards.length > 1 && <p className="mt-1 text-xs text-emerald-100">+{member.availableRewards.length - 1}</p>}
        </div>
      )}

      <div className="px-6 py-5 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={L.qrAlt} width={220} height={220} className="mx-auto rounded-xl border border-slate-100" />
        <p className="mt-2 text-sm text-slate-500">{L.showQr}</p>

        <div className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <Gift className="h-4 w-4 text-orange-500" aria-hidden="true" />
          <span>
            {L.rewardLabel}: <strong>{program.rule.rewardName}</strong>
            {program.rule.rewardDescription ? ` — ${program.rule.rewardDescription}` : ""}
          </span>
        </div>

        {/* Wallet: botones reales solo si hay credenciales; si no, se dice claramente. */}
        <div className="mt-5 space-y-2">
          {wallet.apple ? (
            <a href={`${memberCardPath(org.slug, token)}/wallet/apple`} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-black text-sm font-semibold text-white">
              <Wallet className="h-4 w-4" aria-hidden="true" /> {L.walletApple}
            </a>
          ) : (
            <button type="button" disabled className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-black/80 text-sm font-semibold text-white opacity-60">
              <Wallet className="h-4 w-4" aria-hidden="true" /> {L.walletApple}
            </button>
          )}
          {wallet.google ? (
            <a href={`${memberCardPath(org.slug, token)}/wallet/google`} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900">
              <Wallet className="h-4 w-4" aria-hidden="true" /> {L.walletGoogle}
            </a>
          ) : (
            <button type="button" disabled className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 opacity-60">
              <Wallet className="h-4 w-4" aria-hidden="true" /> {L.walletGoogle}
            </button>
          )}
          {(!wallet.apple || !wallet.google) && <p className="text-xs text-slate-400">{L.walletPending}</p>}
          <p className="flex items-start justify-center gap-1.5 pt-1 text-xs text-slate-500">
            <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {L.walletSaveTip}
          </p>
        </div>

        <p className="mt-5 text-xs text-slate-400">
          {L.memberSince(shortDate(member.createdAt, lang))}
          {member.redeemedCount > 0 ? ` · ${L.redeemedSoFar(member.redeemedCount)}` : ""}
        </p>
      </div>
    </PublicShell>
  );
}
