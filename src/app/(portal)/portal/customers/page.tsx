import { CrmTabs } from "@/components/portal/CrmTabs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasModule, requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getServerLang } from "@/lib/i18n-server";
import { phoneKey } from "@/lib/phone";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { CreateLeadFromCustomerButton } from "@/components/portal/CreateLeadFromCustomerButton";
import { CustomerBirthday } from "@/components/portal/CustomerBirthday";
import { formatDate, formatMoney } from "@/lib/utils";
import { Contact, DollarSign, Repeat, ShieldCheck } from "lucide-react";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 50;

/** Clientes del POS o Lealtad, enlazados al CRM por teléfono. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  const orgId = session.user.organizationId;
  await requireModule(orgId, "FOOD_OPS");

  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const query = q?.trim() ?? "";
  const es = (await getServerLang()) === "es";
  const crm = await hasModule(orgId, "CRM");
  const loyalty = await hasModule(orgId, "LOYALTY");
  const canEdit = can(session.user.role, "food:manage");
  const canCreateLead = crm && can(session.user.role, "leads:create");

  const digits = query.replace(/\D/g, "");
  const where: Prisma.CustomerWhereInput = {
    organizationId: orgId,
    ...(query
      ? { OR: [{ name: { contains: query, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phoneKey: { contains: phoneKey(digits) ?? digits } }] : [{ phone: { contains: query } }])] }
      : {}),
  };

  const [customers, total, totals, withConsent, repeat] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ lastVisitAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { lead: { select: { id: true, name: true, deletedAt: true } }, loyaltyMembers: {
        where: { organizationId: orgId, ...(loyalty ? {} : { id: { in: [] } }) },
        select: { id: true, totalVisits: true, totalSpent: true, visits: {
          where: { organizationId: orgId },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 5,
          select: { id: true, occurredAt: true, saleAmount: true, saleId: true, status: true },
        } },
      } },
    }),
    prisma.customer.count({ where }),
    prisma.customer.aggregate({ where: { organizationId: orgId }, _sum: { totalSpent: true }, _count: { _all: true } }),
    prisma.customer.count({ where: { organizationId: orgId, consentAccepted: true } }),
    prisma.customer.count({ where: { organizationId: orgId, visitCount: { gte: 2 } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/portal/customers?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;

  return (
    <div>
      <PageHeader
        title={es ? "Clientes del negocio" : "Business customers"}
        description={es ? "Clientes registrados desde el POS o Lealtad, enlazados al CRM por teléfono. El gasto del POS y los importes de Lealtad se muestran por separado." : "Customers registered through the POS or Loyalty, linked to CRM by phone. POS spending and Loyalty amounts are shown separately."}
      />
      <CrmTabs />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title={es ? "Clientes" : "Customers"} value={totals._count._all} icon={Contact} />
        <MetricCard title={es ? "Han vuelto al POS (2+ visitas)" : "Returning to POS (2+ visits)"} value={repeat} icon={Repeat} />
        <MetricCard title={es ? "Aceptaron contacto" : "Accepted contact"} value={withConsent} icon={ShieldCheck} />
        <MetricCard title={es ? "Gasto en POS" : "POS spending"} value={formatMoney(Number(totals._sum.totalSpent ?? 0))} icon={DollarSign} />
      </div>

      <form className="mb-4 flex max-w-md gap-2" action="/portal/customers">
        <input
          name="q"
          defaultValue={query}
          placeholder={es ? "Buscar por nombre o teléfono…" : "Search by name or phone…"}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </form>

      <Card>
        <CardContent className="p-0">
          {customers.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Contact}
                title={query ? (es ? "Ningún cliente coincide" : "No customer matches") : es ? "Aún no hay clientes" : "No customers yet"}
                description={es ? "Aparecen al registrar su teléfono en el POS o al inscribirse en Lealtad." : "They appear when registered by phone in the POS or enrolled in Loyalty."}
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {customers.map((c) => {
                const lead = c.lead && !c.lead.deletedAt ? c.lead : null;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-sm font-medium text-slate-900">{c.name ?? (es ? "Sin nombre" : "No name")}</p>
                      <p className="text-xs text-slate-500">{c.phone}</p>
                      <CustomerBirthday customerId={c.id} month={c.birthMonth} day={c.birthDay} consent={c.consentAccepted} canEdit={canEdit} />
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-xs text-slate-500">{es ? "Compras en POS" : "POS purchases"}</p>
                      <p className="font-semibold text-slate-900">{formatMoney(Number(c.totalSpent))}</p>
                      <p className="text-xs text-slate-500">
                        {c.visitCount} {c.visitCount === 1 ? (es ? "visita" : "visit") : es ? "visitas" : "visits"}
                        {c.lastVisitAt && ` · ${es ? "última" : "last"} ${formatDate(c.lastVisitAt, es ? "es" : "en")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.consentAccepted ? (
                        <Badge variant="success" className="text-[10px]">{es ? "Aceptó contacto" : "Accepted contact"}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">{es ? "Sin consentimiento" : "No consent"}</Badge>
                      )}
                    </div>
                    {loyalty && c.loyaltyMembers[0] && <Link href={`/portal/loyalty/members/${c.loyaltyMembers[0].id}`} className="text-sm font-medium text-brand-700 hover:underline">{es ? "Ver lealtad →" : "View loyalty →"}</Link>}
                    {loyalty && c.loyaltyMembers.map((member) => (
                      <details key={member.id} className="w-full rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
                        <summary className="cursor-pointer font-medium">
                          {es ? "Actividad de Lealtad" : "Loyalty activity"}: {member.totalVisits} {member.totalVisits === 1 ? (es ? "visita confirmada" : "confirmed visit") : (es ? "visitas confirmadas" : "confirmed visits")} · {formatMoney(Number(member.totalSpent))}
                        </summary>
                        <p className="mt-2 text-xs text-slate-500">
                          {es ? "Importes registrados en Lealtad; no se suman al gasto del POS. Las visitas vinculadas al POS pueden corresponder a compras ya incluidas arriba." : "Amounts recorded in Loyalty; not added to POS spending. POS-linked visits may correspond to purchases already included above."}
                        </p>
                        <p className="mt-3 font-medium">{es ? "Últimas 5 visitas" : "Latest 5 visits"}</p>
                        {member.visits.length === 0 ? <p>{es ? "Sin visitas registradas" : "No visits recorded"}</p> : (
                          <ul className="mt-2 space-y-2">
                            {member.visits.map((visit) => (
                              <li key={visit.id} className="flex flex-wrap gap-x-3 gap-y-1">
                                <span>{formatDate(visit.occurredAt, es ? "es" : "en")}</span>
                                <span>{visit.saleId ? (es ? "Vinculada al POS" : "POS-linked") : (es ? "Registro manual" : "Manual entry")}</span>
                                <span>{visit.saleAmount === null ? (es ? "Sin monto" : "No amount") : formatMoney(Number(visit.saleAmount))}</span>
                                <Badge variant={visit.status === "VOIDED" ? "secondary" : "success"}>
                                  {visit.status === "VOIDED" ? (es ? "Anulada" : "Voided") : (es ? "Confirmada" : "Confirmed")}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        )}
                        <Link href={`/portal/loyalty/members/${member.id}`} className="mt-3 inline-block font-medium text-brand-700 hover:underline">
                          {es ? "Ver perfil de Lealtad →" : "View Loyalty profile →"}
                        </Link>
                      </details>
                    ))}
                    {crm && (
                      <div className="w-full sm:w-auto">
                        {lead ? (
                          <Link href={`/portal/leads/${lead.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                            {es ? "Ver contacto →" : "View contact →"}
                          </Link>
                        ) : canCreateLead ? (
                          <CreateLeadFromCustomerButton customerId={c.id} />
                        ) : null}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>{es ? `Página ${page} de ${pages}` : `Page ${page} of ${pages}`}</span>
          <span className="flex gap-3">
            {page > 1 && <Link href={href(page - 1)} className="font-medium text-brand-700 hover:underline">{es ? "← Anterior" : "← Previous"}</Link>}
            {page < pages && <Link href={href(page + 1)} className="font-medium text-brand-700 hover:underline">{es ? "Siguiente →" : "Next →"}</Link>}
          </span>
        </div>
      )}
    </div>
  );
}
