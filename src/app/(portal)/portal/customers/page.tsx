import { MetricGrid } from "@/components/shared/MetricGrid";
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
        orderBy: [{ isSelected: "desc" }, { createdAt: "asc" }],
        select: { id: true },
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
        title={es ? "Clientes" : "Customers"}
        description={es ? "Aquí encuentras a las personas registradas en tu caja o en Lealtad. Abre su historial para consultar sus compras y recompensas." : "Find people registered at checkout or in Loyalty. Open their history to see purchases and rewards."}
      />
      <CrmTabs />
      <div className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <p><strong>{es ? "Clientes" : "Customers"}</strong><br />{es ? "Personas que compran contigo o ya tienen una tarjeta de Lealtad. Aquí consultas sus compras." : "People who buy from you or have a Loyalty card. See their purchases here."}</p>
        <p><strong>{es ? "Contactos" : "Contacts"}</strong><br />{es ? "Personas con las que conversas o a quienes das seguimiento, aunque todavía no hayan comprado. Un cliente también puede tener un contacto." : "People you talk to or follow up with, even before they buy. A customer can also have a contact record."}</p>
      </div>

      <MetricGrid columns={4} className="mb-6">
        <MetricCard title={es ? "Clientes" : "Customers"} value={totals._count._all} icon={Contact} />
        <MetricCard title={es ? "Clientes que regresaron" : "Returning customers"} value={repeat} icon={Repeat} />
        <MetricCard title={es ? "Aceptaron contacto" : "Accepted contact"} value={withConsent} icon={ShieldCheck} />
        <MetricCard title={es ? "Compras acumuladas" : "Lifetime purchases"} value={formatMoney(Number(totals._sum.totalSpent ?? 0))} icon={DollarSign} />
      </MetricGrid>

      <form className="mb-4 flex max-w-md gap-2" action="/portal/customers">
        <input
          name="q"
          defaultValue={query}
          placeholder={es ? "Buscar por nombre o teléfono…" : "Search by name or phone…"}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white">{es ? "Buscar" : "Search"}</button>
      </form>

      {customers.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Contact}
              title={query ? (es ? "Ningún cliente coincide" : "No customer matches") : es ? "Aún no hay clientes" : "No customers yet"}
              description={es ? "Aparecen al registrar su teléfono en el POS o al inscribirse en Lealtad." : "They appear when registered by phone in the POS or enrolled in Loyalty."}
            />
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {customers.map((c) => {
            const lead = c.lead && !c.lead.deletedAt ? c.lead : null;
            const name = c.name ?? (es ? "Sin nombre" : "No name");
            const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
            return (
              <li key={c.id} className="flex flex-col rounded-card border border-slate-200 bg-white p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{initials}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/portal/customers/${c.id}`} className="block truncate text-base font-semibold text-slate-900 hover:text-brand-700 hover:underline">{name}</Link>
                    <p className="text-xs text-slate-500">{c.phone}</p>
                  </div>
                  {c.consentAccepted ? (
                    <Badge variant="success" className="shrink-0 text-[10px]">{es ? "Aceptó contacto" : "Accepted contact"}</Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{es ? "Sin consentimiento" : "No consent"}</Badge>
                  )}
                </div>
                <CustomerBirthday customerId={c.id} month={c.birthMonth} day={c.birthDay} consent={c.consentAccepted} canEdit={canEdit} />

                <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">{es ? "Compras en POS" : "POS purchases"}</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{formatMoney(Number(c.totalSpent))}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">{es ? "Visitas" : "Visits"}</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{c.visitCount}</dd>
                  </div>
                  <div className="col-span-2 text-xs text-slate-500">
                    {c.lastVisitAt ? `${es ? "Última visita" : "Last visit"}: ${formatDate(c.lastVisitAt, es ? "es" : "en")}` : es ? "Sin visitas todavía" : "No visits yet"}
                  </div>
                </dl>

                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
                  <Link href={`/portal/customers/${c.id}`} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">{es ? "Ver compras y recompensas" : "View purchases and rewards"}</Link>
                  {loyalty && c.loyaltyMembers[0] && <Link href={`/portal/loyalty/members/${c.loyaltyMembers[0].id}`} className="text-sm font-medium text-brand-700 hover:underline">{es ? "Ver lealtad →" : "View loyalty →"}</Link>}
                  {crm &&
                    (lead ? (
                      <Link href={`/portal/leads/${lead.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        {es ? "Ver contacto →" : "View contact →"}
                      </Link>
                    ) : canCreateLead ? (
                      <CreateLeadFromCustomerButton customerId={c.id} />
                    ) : null)}
                </div>
              </li>
            );
          })}
        </ul>
      )}

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
