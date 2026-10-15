import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { Gift } from "lucide-react";
import { resolvePublicProgram } from "@/lib/loyalty/service";
import { getServerLang } from "@/lib/i18n-server";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { EnrollForm } from "@/components/loyalty/EnrollForm";
import { PublicShell, PublicMessage } from "@/components/loyalty/PublicShell";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePublicProgram(slug);
  return { title: resolved ? `${resolved.program.name} · ${resolved.org.name}` : "Lealtad" };
}

// Página pública de inscripción: /lealtad/<negocio>[?suc=<sucursal>]. Sirve
// como destino de un QR impreso, la mesa, el ticket, redes, WhatsApp, NFC o
// una SmartCard. No requiere sesión (ver src/proxy.ts).
export default async function LoyaltyEnrollPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ suc?: string; program?: string }> }) {
  const [{ slug }, { suc, program: programId }, lang] = await Promise.all([params, searchParams, getServerLang()]);
  const L = pickDict(loyaltyStrings, lang);
  const resolved = await resolvePublicProgram(slug, programId);
  if (!resolved) return <PublicMessage text={L.programUnavailable} />;
  const { org, program } = resolved;
  const programs = await prisma.loyaltyProgram.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, select: { id: true, name: true } });

  return (
    <PublicShell businessName={org.name} logoUrl={org.logoUrl}>
      <nav className="flex flex-wrap gap-2 px-6 pt-4" aria-label={lang === "es" ? "Elegir programa" : "Choose program"}>
        {programs.map((p) => <Link key={p.id} className="rounded border px-3 py-2 text-sm" aria-current={p.id === program.id ? "page" : undefined} href={`/lealtad/${org.slug}?${new URLSearchParams({ program: p.id, ...(suc ? { suc } : {}) })}`}>{p.name}</Link>)}
      </nav>
      <div className="px-6 pb-2 pt-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{L.joinTitle(program.name)}</h1>
        <p className="mt-1 text-sm text-slate-500">{program.description || L.joinSubtitle}</p>
        <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700">
          <Gift className="h-4 w-4" aria-hidden="true" />
          {L.joinRule(program.rule.visitGoal, program.rule.rewardName)}
        </div>
        {program.rule.rewardHeadline && <p className="mt-2 text-sm italic text-slate-500">“{program.rule.rewardHeadline}”</p>}
      </div>
      <div className="px-6 pb-6 pt-4">
        {program.status === "ACTIVE" ? (
          <EnrollForm programId={program.id} orgSlug={org.slug} businessName={org.name} branch={suc && suc.length <= 40 ? suc : null} />
        ) : (
          <p className="rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-800">{L.programPausedPublic}</p>
        )}
      </div>
    </PublicShell>
  );
}
