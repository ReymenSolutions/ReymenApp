import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import {
  resolveSmartcardMembership,
  getCompanyRoster,
  getCompanyCardStats,
  getActiveDestinationTypes,
  smartcardPublicBaseUrl,
  supportsCardAssignment,
} from "@/lib/smartcard-company";
import { getRosterPeople } from "@/lib/smartcard-roster";
import { SmartcardPanel } from "@/components/portal/SmartcardPanel";
import { getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { syncSmartcardMemberLimitForPlan } from "@/lib/smartcard-link";

const FAILURE_MESSAGES: Record<"es" | "en", Record<string, string>> = {
  es: {
    not_configured: "SmartCard aún no está configurado en este entorno. Contacta a soporte.",
    no_company: "Tu empresa todavía no está vinculada con SmartCard. Contacta a soporte de Reymen.",
    no_membership:
      "Tu cuenta todavía no es miembro activo de la empresa vinculada en SmartCard. Contacta a soporte de Reymen.",
    query_failed: "No se pudo cargar SmartCard en este momento. Intenta de nuevo en unos minutos.",
  },
  en: {
    not_configured: "SmartCard isn't configured in this environment yet. Please contact support.",
    no_company: "Your company isn't linked to SmartCard yet. Please contact Reymen support.",
    no_membership:
      "Your account isn't an active member of the company linked in SmartCard yet. Please contact Reymen support.",
    query_failed: "SmartCard couldn't be loaded right now. Please try again in a few minutes.",
  },
};

/**
 * Was a redirect to reymen-smartcard's own ops.reymen.mx via a signed SSO
 * hand-off token (see git history / smartcard-sso.ts) — that bridge still
 * exists and still works (createSmartcardSsoToken is unused now but kept,
 * not deleted, in case a future need for the standalone ops.reymen.mx login
 * comes back), but bouncing between two separate domains with two separate
 * page shells for what is, today, just "which modules does this company
 * have" and "who's on the team" wasn't worth the round trip. This page
 * renders that same data natively, reading reymen-smartcard's own Supabase
 * project directly (smartcard-company.ts) instead of redirecting to it.
 */
export default async function SmartcardPage() {
  const session = await auth();
  if (!session?.user.organizationId || !session.user.email) redirect("/login");

  // requireModule() redirects to /portal/dashboard by itself when NFC_QR
  // isn't enabled for this org — same guard the page always had.
  await requireModule(session.user.organizationId, "NFC_QR");

  // El límite de integrantes de SmartCard debe seguir al plan de Reymen. Se
  // iguala al cambiar el plan (admin o Stripe); esto corrige además lo que
  // haya quedado desfasado antes (solo escribe si no coincide).
  const org = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { plan: true, timezone: true },
  });
  if (org) await syncSmartcardMemberLimitForPlan(session.user.organizationId, org.plan);

  const result = await resolveSmartcardMembership(session.user.organizationId, session.user.email);

  if (!result.ok) {
    if (result.reason === "query_failed") throw new Error("Unable to load SmartCard membership");
    const lang = await getServerLang();
    return (
      <section className="mx-auto w-full max-w-6xl">
        <h1 className="text-2xl font-semibold">SmartCard</h1>
        <p className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {FAILURE_MESSAGES[lang][result.reason]}
        </p>
      </section>
    );
  }

  // Dueño, administrador y gerente ven todas las tarjetas y al equipo con
  // nombre; un asesor o personal solo ve la tarjeta que tiene asignada.
  const isManager = ["owner", "admin", "manager"].includes(result.membership.roleCode);
  const assignmentReady = await supportsCardAssignment();
  const [roster, cardStats, destinationTypes] = await Promise.all([
    getCompanyRoster(result.membership.companyId, result.membership.userId),
    getCompanyCardStats(result.membership.companyId, {
      throwOnError: true,
      withAssignment: assignmentReady,
      assignedTo: isManager ? undefined : result.membership.userId,
    }),
    getActiveDestinationTypes({ throwOnError: true }),
  ]);
  const people = isManager
    ? await getRosterPeople(
        session.user.organizationId,
        roster.filter((m) => m.status === "active").map((m) => m.userId)
      )
    : {};

  return (
    <SmartcardPanel
      membership={result.membership}
      roster={roster}
      cardStats={cardStats}
      people={people}
      assignmentReady={assignmentReady}
      destinationTypes={destinationTypes}
      publicBaseUrl={smartcardPublicBaseUrl()}
      timeZone={org?.timezone ?? "America/Mexico_City"}
    />
  );
}
