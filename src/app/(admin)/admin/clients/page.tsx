import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { CreateClientDialog } from "@/components/admin/CreateClientDialog";
import { ClientRow } from "@/components/admin/ClientRow";
import Link from "next/link";
import { listCollections } from "@/actions/admin/billing";
import { getServerLang } from "@/lib/i18n-server";
import { formatDate } from "@/lib/utils";

async function getClients() {
  return prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { leads: true, automations: true, requests: true } },
    },
  });
}

export default async function AdminClientsPage() {
  const [t, clients, collections, lang] = await Promise.all([getServerT(), getClients(), listCollections(), getServerLang()]);
  const es = lang === "es";

  return (
    <div>
      <PageHeader
        title={t.adminClientsTitle}
        description={`${clients.length} ${t.adminOrgsRegistered}`}
        actions={<CreateClientDialog />}
      />

      {collections.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/60">
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold text-slate-900">{es ? "Cobranza" : "Collections"}: {collections.filter((c) => c.state === "OVERDUE").length} {es ? "vencidos" : "overdue"} · {collections.filter((c) => c.state === "DUE_SOON").length} {es ? "por vencer" : "due soon"}</p>
            <ul className="divide-y divide-amber-100 rounded-lg border border-amber-100 bg-white/70">
              {collections.map((c) => (
                <li key={c.orgId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <Link href={`/admin/clients/${c.orgId}#suscripcion`} className="min-w-0 truncate font-medium text-slate-900 hover:underline">{c.name}</Link>
                  <span className={`flex-shrink-0 text-xs ${c.state === "OVERDUE" ? "font-medium text-red-700" : "text-slate-600"}`}>
                    {c.state === "OVERDUE" ? (es ? `vencido hace ${c.daysOver} d` : `overdue ${c.daysOver} d`) : es ? `vence en ${c.daysLeft} d` : `due in ${c.daysLeft} d`} · {formatDate(c.dueAt, lang)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {clients.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600">{t.adminNoClients}</p>
            <p className="text-xs text-slate-400 mt-1">{t.adminCreateFirstClient}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.adminColCompany}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.plan}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.leads}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.adminColAutomations}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.colStatus}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">{t.createdOn}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((client) => (
                <ClientRow
                  key={client.id}
                  client={client}
                  viewDetailLabel={t.viewDetail}
                  statusActiveLabel={t.statusActive}
                  inactiveLabel={t.inactive}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
