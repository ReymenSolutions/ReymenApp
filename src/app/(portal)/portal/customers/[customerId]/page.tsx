import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule, hasModule } from "@/lib/modules";
import { getServerLang } from "@/lib/i18n-server";
import { formatDate, formatMoney } from "@/lib/utils";
import { CrmTabs } from "@/components/portal/CrmTabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const HISTORY_PAGE_SIZE = 5;

export default async function CustomerPage({ params, searchParams }: {
  params: Promise<{ customerId: string }>; searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user.organizationId) redirect("/login");
  const orgId = session.user.organizationId;
  await requireModule(orgId, "FOOD_OPS");
  const { customerId } = await params;
  const requestedPage = Number((await searchParams).page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
  const es = (await getServerLang()) === "es";
  const loyalty = await hasModule(orgId, "LOYALTY");
  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId: orgId }, include: {
    loyaltyMembers: { where: { organizationId: orgId, ...(loyalty ? {} : { id: { in: [] } }) }, orderBy: [{ isSelected: "desc" }, { createdAt: "asc" }], include: {
      program: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
      visits: { where: { organizationId: orgId }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 5, select: { id: true, occurredAt: true, saleAmount: true, saleId: true, status: true } },
      rewards: { where: { status: "AVAILABLE", missingVisits: 0, posRedemptions: { none: { status: { in: ["RESERVED", "COMMITTED"] } } } }, select: { id: true, rewardName: true } },
    } },
  } });
  if (!customer) notFound();
  const where = { organizationId: orgId, customerId };
  const [sales, count] = await Promise.all([
    prisma.foodSale.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: HISTORY_PAGE_SIZE, skip: (page - 1) * HISTORY_PAGE_SIZE,
      include: { branch: { select: { name: true } } } }),
    prisma.foodSale.count({ where }),
  ]);
  return <div className="space-y-5">
    <Link href="/portal/customers" className="inline-block text-sm font-medium text-brand-700">{es ? "← Volver a clientes" : "← Back to customers"}</Link>
    <PageHeader title={customer.name || (es ? "Cliente sin nombre" : "Unnamed customer")} description={`${customer.phone}${customer.postalCode ? ` · CP ${customer.postalCode}` : ""}`} />
    <CrmTabs />
    <nav aria-label={es ? "Ficha del cliente" : "Customer details"} className="flex flex-wrap gap-3">
      <a href="#purchases" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white">{es ? "Ver compras" : "View purchases"}</a>
      {loyalty && <a href="#rewards" className="rounded-lg border border-slate-300 px-4 py-2 font-medium">{es ? "Ver sellos y recompensas" : "View stamps and rewards"}</a>}
    </nav>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="p-4"><p className="text-sm text-slate-500">{es ? "Compras acumuladas" : "Lifetime purchases"}</p><p className="mt-1 text-2xl font-semibold">{formatMoney(Number(customer.totalSpent))}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-sm text-slate-500">{es ? "Visitas registradas en caja" : "Checkout visits"}</p><p className="mt-1 text-2xl font-semibold">{customer.visitCount}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-sm text-slate-500">{es ? "Permiso de contacto" : "Contact permission"}</p><p className="mt-1 font-semibold">{customer.consentAccepted ? (es ? "Aceptado" : "Accepted") : (es ? "Sin autorización para mensajes" : "No permission to send messages")}</p></CardContent></Card>
    </div>
    <section id="purchases" className="scroll-mt-4">
      <Card><CardHeader><CardTitle>{es ? "Historial de compras" : "Purchase history"}</CardTitle><p className="text-sm text-slate-500">{es ? "Todo el historial se conserva. Mostramos cinco movimientos por página para facilitar la consulta." : "The full history is kept. We show five entries per page to make it easier to browse."}</p></CardHeader>
        <CardContent>{sales.length === 0 ? <p className="rounded-lg bg-slate-50 p-5 text-sm dark:bg-slate-900">{es ? "No hay compras para mostrar. Para asociar una venta, captura el teléfono de este cliente al cobrar en caja." : "No purchases to display. Enter this customer’s phone at checkout to link a sale."}</p> : <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {sales.map(sale => <li key={sale.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
            <div className="min-w-0"><p className="font-medium">{formatDate(sale.occurredAt, es ? "es" : "en")}</p><p className="text-sm text-slate-500">{sale.branch?.name || (es ? "Sucursal principal" : "Main branch")}</p>{sale.externalOrderId && <p className="text-xs text-slate-500">{es ? "Referencia" : "Reference"}: {sale.externalOrderId.slice(-8)}</p>}</div>
            <div className="text-right"><p className="text-lg font-semibold">{formatMoney(Number(sale.grossAmount))}</p><Badge variant={sale.isCancellation || Number(sale.grossAmount) < 0 ? "secondary" : "success"}>{sale.isCancellation || Number(sale.grossAmount) < 0 ? (es ? "Devolución / cancelación" : "Refund / cancellation") : (es ? "Compra" : "Purchase")}</Badge>{Number(sale.discountAmount) > 0 && <p className="mt-1 text-xs text-slate-500">{es ? "Descuento incluido" : "Discount included"}: {formatMoney(Number(sale.discountAmount))}</p>}</div>
          </li>)}
        </ul>}
        <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm"><span>{es ? `Página ${page} · ${count} movimientos en total` : `Page ${page} · ${count} total entries`}</span><span className="flex gap-4">{page > 1 && <Link href={`?page=${page - 1}#purchases`}>{es ? "← Anteriores" : "← Previous"}</Link>}{page * HISTORY_PAGE_SIZE < count && <Link href={`?page=${page + 1}#purchases`}>{es ? "Siguientes →" : "Next →"}</Link>}</span></div>
        </CardContent>
      </Card>
    </section>
    {loyalty && <section id="rewards" className="scroll-mt-4"><Card><CardHeader><CardTitle>{es ? "Sellos y recompensas" : "Stamps and rewards"}</CardTitle><p className="text-sm text-slate-500">{es ? "Los sellos reconocen las visitas. No son compras adicionales ni se suman otra vez al total comprado." : "Stamps recognize visits. They are not extra purchases and do not increase purchase totals."}</p></CardHeader><CardContent className="space-y-4">
      {!customer.loyaltyMembers.length && <p>{es ? "Este cliente todavía no tiene una tarjeta. Invítalo a inscribirse en Lealtad y aceptar los términos." : "This customer does not have a card yet. Invite them to enroll in Loyalty and accept its terms."}</p>}
      {customer.loyaltyMembers.map(member => <div key={member.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{member.program.name}</h3><Badge variant={member.isSelected ? "success" : "secondary"}>{member.isSelected ? (es ? "Programa elegido" : "Selected program") : (es ? "Programa anterior" : "Previous program")}</Badge></div><p className="mt-2 text-sm">{member.cycleVisits} / {member.program.versions[0]?.visitGoal ?? "—"} {es ? "sellos para la siguiente recompensa" : "stamps toward the next reward"}</p><p className="mt-1 text-sm">{member.rewards.length ? (es ? "Recompensas disponibles: " : "Available rewards: ") + member.rewards.map(r => r.rewardName).join(", ") : (es ? "Todavía no hay recompensas disponibles." : "No rewards available yet.")}</p><details className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900"><summary className="cursor-pointer font-medium">{es ? "Actividad de Lealtad" : "Loyalty activity"}: {member.totalVisits} {member.totalVisits === 1 ? (es ? "visita confirmada" : "confirmed visit") : (es ? "visitas confirmadas" : "confirmed visits")} · {formatMoney(Number(member.totalSpent))}</summary><p className="mt-2 text-xs text-slate-500">{es ? "Últimas cinco visitas. Estos importes no se suman otra vez a las compras." : "Latest five visits. These amounts are not added to purchases again."}</p>{!member.visits.length ? <p className="mt-2">{es ? "Sin visitas registradas" : "No visits recorded"}</p> : <ul className="mt-2 space-y-2">{member.visits.map(visit => <li key={visit.id} className="flex flex-wrap gap-2 border-t border-slate-200 py-2 dark:border-slate-700"><span>{formatDate(visit.occurredAt, es ? "es" : "en")}</span><span>{visit.saleId ? (es ? "Compra en caja" : "Checkout purchase") : (es ? "Registro manual" : "Manual entry")}</span><span>{visit.saleAmount === null ? (es ? "Sin monto" : "No amount") : formatMoney(Number(visit.saleAmount))}</span><Badge variant={visit.status === "VOIDED" ? "secondary" : "success"}>{visit.status === "VOIDED" ? (es ? "Anulada" : "Voided") : (es ? "Confirmada" : "Confirmed")}</Badge></li>)}</ul>}</details><Link href={`/portal/loyalty/members/${member.id}`} className="mt-3 inline-block text-sm font-medium text-brand-700">{es ? "Abrir tarjeta y visitas →" : "Open card and visits →"}</Link></div>)}
    </CardContent></Card></section>}
  </div>;
}
