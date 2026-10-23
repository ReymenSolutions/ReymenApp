import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProgram } from "@/lib/loyalty/service";
import { PrimaryProgramButton, ViewProgramButton } from "@/components/loyalty/PrimaryProgramButton";
import { LoyaltyMaintenance } from "@/components/loyalty/LoyaltyMaintenance";
import QRCode from "qrcode";
import { getLoyaltyContext } from "@/lib/loyalty/context";
import { enrollmentPath } from "@/lib/loyalty/token";
import { getAppUrl } from "@/lib/app-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgramForm, type ProgramFormValues } from "@/components/loyalty/ProgramForm";
import { PublicLinks, type PublicLink } from "@/components/loyalty/PublicLinks";
import { LocationsEditor } from "@/components/loyalty/LocationsEditor";

export default async function LoyaltyProgramPage({ searchParams }: { searchParams: Promise<{ program?: string; new?: string }> }) {
  const ctx = await getLoyaltyContext();
  const { L } = ctx;
  const params = await searchParams;
  const program = params.new === "1" ? null : params.program ? await getActiveProgram(ctx.orgId, params.program) : ctx.program;
  const programs = await prisma.loyaltyProgram.findMany({ where: { organizationId: ctx.orgId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, isPrimary: true, status: true } });

  const initial: ProgramFormValues = program
    ? {
        programId: program.id,
        rewardValue: program.rule.rewardValue === null ? null : Number(program.rule.rewardValue),
        name: program.name,
        description: program.description ?? "",
        status: program.status,
        visitGoal: program.rule.visitGoal,
        rewardType: program.rule.rewardType,
        rewardName: program.rule.rewardName,
        rewardDescription: program.rule.rewardDescription ?? "",
        rewardHeadline: program.rule.rewardHeadline ?? "",
        scope: program.scope,
        branchId: program.branchId ?? "",
        cardColor: program.cardColor ?? "",
        cardAccent: program.cardAccent ?? "",
        cardIcon: program.cardIcon ?? "",
      }
    : {
        createNew: true,
        name: `Club ${ctx.org.name}`.slice(0, 80),
        description: "",
        status: "ACTIVE",
        visitGoal: 10,
        rewardType: "FREE_ITEM",
        rewardName: "",
        rewardDescription: "",
        rewardHeadline: "",
        scope: "ORGANIZATION",
        branchId: "",
        cardColor: "",
        cardAccent: "",
        cardIcon: "",
      };

  let links: { main: PublicLink; branches: PublicLink[] } | null = null;
  if (program) {
    const base = getAppUrl();
    const make = async (key: string, label: string, branchId: string | null): Promise<PublicLink> => {
      const url = `${base}${enrollmentPath(ctx.org.slug, branchId)}`;
      return { key, label, url, qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 360 }), fileName: `lealtad-${ctx.org.slug}${branchId ? `-${key}` : ""}.png` };
    };
    const branchList = program.scope === "BRANCH" ? [] : ctx.branches;
    links = {
      main: await make("main", program.scope === "BRANCH" && program.branch ? program.branch.name : ctx.org.name, program.scope === "BRANCH" ? program.branchId : null),
      branches: await Promise.all(branchList.map((b) => make(b.id, b.name, b.id))),
    };
  }

  return (
    <div className="space-y-6">
      <Card><CardContent className="space-y-3 p-4">
        <p className="font-semibold">{ctx.lang === "es" ? "Programas del negocio" : "Business programs"}</p>
        <p className="text-sm text-slate-500">{ctx.lang === "es" ? "Cada miembro elige su programa desde su tarjeta. El predeterminado se muestra primero al inscribirse. Se conserva el historial de cada programa." : "Each member chooses a program from their card. The default is shown first at enrollment. Each program retains its history."}</p>
        {programs.map((p) => <div key={p.id} className="flex flex-wrap items-center gap-3">
          <Link className="text-brand-600 underline" href={`/portal/loyalty/program?program=${p.id}`}>{p.name}</Link>
          {ctx.canOperate && <ViewProgramButton id={p.id} lang={ctx.lang} />}
          {p.isPrimary ? <span>{ctx.lang === "es" ? "Predeterminado" : "Default"}</span> : ctx.canManage && p.status === "ACTIVE" ? <PrimaryProgramButton id={p.id} lang={ctx.lang} /> : null}
        </div>)}
        {ctx.canManage && <Link className="inline-block text-brand-600 underline" href="/portal/loyalty/program?new=1">{ctx.lang === "es" ? "Crear otro programa" : "Create another program"}</Link>}
      </CardContent></Card>
      {ctx.canManage && <LoyaltyMaintenance lang={ctx.lang} />}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{L.programTitle}</CardTitle>
          <p className="text-sm text-slate-500">{L.programSubtitle}</p>
          {!ctx.canManage && <p className="text-xs text-amber-700">{L.canManageOnly}</p>}
        </CardHeader>
        <CardContent>
          <ProgramForm key={program?.id ?? "new"} initial={initial} branches={ctx.branches} businessName={ctx.org.name} isNew={!program} readOnly={!ctx.canManage} />
          {program && <p className="mt-4 text-xs text-slate-400">{L.versionNote(program.currentVersion)}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{L.locationsTitle}</CardTitle>
          <p className="text-sm text-slate-500">{L.locationsHint}</p>
        </CardHeader>
        <CardContent>
          <LocationsEditor locations={ctx.locations} readOnly={!ctx.canManage} />
        </CardContent>
      </Card>

      {links && (
        <Card>
          <CardHeader>
            <CardTitle>{L.publicLinkTitle}</CardTitle>
            <p className="text-sm text-slate-500">{L.publicLinkHint}</p>
          </CardHeader>
          <CardContent>
            <PublicLinks main={links.main} branches={links.branches} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
