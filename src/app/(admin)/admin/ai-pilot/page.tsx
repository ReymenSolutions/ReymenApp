import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guards";
import { getServerLang } from "@/lib/i18n-server";
import { getPrivatePilotAdmin, pilotAdminEnabled } from "@/lib/ai/pilot/admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { PrivateMarkAdmin } from "@/components/admin/PrivateMarkAdmin";

export default async function PrivatePilotAdminPage({ searchParams }: { searchParams: Promise<{ organization?: string; page?: string }> }) {
  if (!pilotAdminEnabled()) notFound();
  const session = await requireAdmin();
  const query = await searchParams, lang = await getServerLang();
  const page = /^\d{1,5}$/.test(query.page ?? "") ? Math.min(10000, Number(query.page)) : 0;
  const view = await getPrivatePilotAdmin(session.user.id, query.organization, page);
  return <div className="min-w-0 space-y-5">
    <PageHeader title={lang === "es" ? "Piloto privado de Mark" : "Private Mark pilot"} description={lang === "es" ? "Preparación y revisión de consumo en el entorno de pruebas." : "Preparation and usage review in the staging environment."} />
    <PrivateMarkAdmin view={view} lang={lang} page={page} />
  </div>;
}
