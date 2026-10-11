import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { getServerLang } from "@/lib/i18n-server";
import { findDuplicateGroups } from "@/lib/duplicate-detection";
import { PageHeader } from "@/components/shared/PageHeader";
import { DuplicateGroupCard } from "@/components/portal/DuplicateGroupCard";

const COPY = {
  es: {
    back: "Leads",
    title: "Contactos duplicados",
    desc: "Contactos que comparten teléfono o correo. Revisa cada grupo: al fusionar se conserva el más antiguo y se le pasa todo el historial del resto.",
    none: "No hay contactos duplicados. 🎉",
  },
  en: {
    back: "Leads",
    title: "Duplicate contacts",
    desc: "Contacts that share a phone or email. Review each group: merging keeps the oldest and moves everyone else's history onto it.",
    none: "No duplicate contacts. 🎉",
  },
};

export default async function DuplicateLeadsPage() {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!session || !orgId) return redirect("/login");
  await requireModule(orgId, "CRM");

  const lang = (await getServerLang()) === "en" ? "en" : "es";
  const t = COPY[lang];
  const groups = await findDuplicateGroups(orgId);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/portal/leads" className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" />
        {t.back}
      </Link>
      <PageHeader title={t.title} description={t.desc} />
      {groups.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <CheckCircle2 className="h-6 w-6 flex-shrink-0" />
          <p className="font-medium">{t.none}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <DuplicateGroupCard
              key={`${g.reason}:${g.value}`}
              reason={g.reason}
              value={g.value}
              lang={lang}
              leads={g.leads.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
