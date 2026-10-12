import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AutomationsManager } from "@/components/admin/AutomationsManager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getModuleLabel } from "@/lib/modules";
import { listBlueprints } from "@/lib/automation/blueprints";
import { getServerLang } from "@/lib/i18n-server";

async function getData() {
  const [automations, orgs, blueprintInstances] = await Promise.all([
    prisma.automation.findMany({
      where: { blueprintKey: null },
      orderBy: { createdAt: "desc" },
      include: {
        organization: { select: { name: true, slug: true } },
        _count: { select: { events: true } },
      },
    }),
    prisma.organization.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.automation.findMany({
      where: { blueprintKey: { not: null } },
      select: { blueprintKey: true, status: true, dryRun: true, organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { automations, orgs, blueprintInstances };
}

export default async function AdminAutomationsPage() {
  const [{ automations, orgs, blueprintInstances }, lang] = await Promise.all([getData(), getServerLang()]);
  const es = lang === "es";
  const moduleLabel = getModuleLabel(lang);

  return (
    <div className="space-y-6">
      {/* Los blueprints (automatizaciones del catálogo) se habilitan por cliente; aquí se ve cuáles hay y dónde están encendidos. */}
      <Card>
        <CardHeader className="pb-3">
          <p className="font-semibold text-slate-900">{es ? "Catálogo de automatizaciones (blueprints)" : "Automation catalog (blueprints)"}</p>
          <p className="text-xs text-slate-500">
            {es
              ? "Se habilitan por cliente: abre el cliente en Clientes y busca el panel \"Automatizaciones (blueprints)\". Nacen en simulación (dry-run)."
              : "They are enabled per client: open the client under Clients and look for the \"Automations (blueprints)\" panel. They start in simulation (dry-run)."}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {listBlueprints().map((b) => {
            const instances = blueprintInstances.filter((i) => i.blueprintKey === b.key);
            return (
              <div key={b.key} className="rounded-card border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{b.name}</p>
                    <p className="text-xs text-slate-500">{b.description}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {es ? "Requiere" : "Requires"}: {b.requiredModules.map((m) => moduleLabel[m]).join(", ")} · {b.audience === "internal" ? (es ? "Aviso interno" : "Internal alert") : es ? "Mensaje a clientes" : "Customer message"}
                    </p>
                  </div>
                  <Badge variant="secondary">{instances.length} {es ? (instances.length === 1 ? "cliente" : "clientes") : instances.length === 1 ? "client" : "clients"}</Badge>
                </div>
                {instances.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {instances.map((i) => (
                      <Link key={i.organization.id} href={`/admin/clients/${i.organization.id}`} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-200">
                        {i.organization.name} · {i.status !== "ACTIVE" ? (es ? "pausada" : "paused") : i.dryRun ? (es ? "simulación" : "dry-run") : es ? "envío real" : "live"}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AutomationsManager automations={automations} orgs={orgs} />
    </div>
  );
}
