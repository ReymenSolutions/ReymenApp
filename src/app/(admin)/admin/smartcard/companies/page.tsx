import Link from "next/link";
import { Building2 } from "lucide-react";
import { requireAdmin } from "@/lib/guards";
import { listSmartcardCompaniesAdmin } from "@/lib/smartcard-admin";
import { listSmartcardCompanies } from "@/lib/smartcard-link";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_LABELS: Record<string, string> = {
  trial: "Prueba",
  active: "Activa",
  past_due: "Pago vencido",
  suspended: "Suspendida",
  cancelled: "Cancelada",
};

export default async function SmartcardCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  // Un solo listado: plan y estado (smartcard-admin) más vínculo con Reymen,
  // accesos y tarjetas (smartcard-link), unidos por id.
  const [companies, extra] = await Promise.all([
    listSmartcardCompaniesAdmin(q),
    listSmartcardCompanies(),
  ]);
  const extraById = new Map((extra ?? []).map((c) => [c.id, c]));

  return (
    <div>
      <PageHeader
        title="Empresas"
        description="La cuenta contratante de SmartCard y el cliente de Reymen al que está ligada. Para dar de alta una empresa, entra al cliente en Admin → Clientes → (cliente) → SmartCard y usa «Crear empresa»: queda vinculada, con el módulo SmartCard y el acceso de sus usuarios."
        actions={
          <Button asChild>
            <Link href="/admin/clients">Nueva empresa desde un cliente</Link>
          </Button>
        }
      />

      <form method="get" className="mb-6 flex gap-2">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre o slug..."
          className="max-w-sm"
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href="/admin/smartcard/companies">Limpiar</Link>
          </Button>
        )}
      </form>

      {companies === null ? (
        <EmptyState
          icon={Building2}
          title="SmartCard no está configurado en este servidor"
          description="Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env."
        />
      ) : companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={
            q
              ? `Sin resultados para "${q}"`
              : "Todavía no hay empresas dadas de alta"
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Industria</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Cliente en Reymen</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Con acceso
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Tarjetas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((c) => {
                  const link = extraById.get(c.id)?.link;
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/smartcard/companies/${c.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {c.name}
                        </Link>
                        <p className="text-xs text-slate-400">{c.slug}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.industry ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.planName ?? "Sin plan"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            c.status === "active" ? "default" : "outline"
                          }
                        >
                          {STATUS_LABELS[c.status] ?? c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {link?.kind === "stale" ? (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-amber-700"
                          >
                            Vínculo roto
                          </Badge>
                        ) : c.linkedOrgId ? (
                          <Link
                            href={`/admin/clients/${c.linkedOrgId}`}
                            className="text-brand-600 hover:underline"
                          >
                            {c.linkedOrgName ?? "Vinculada"}
                          </Link>
                        ) : (
                          <span className="text-slate-400">Sin vincular</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {extraById.get(c.id)?.activeMembers ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {extraById.get(c.id)?.cards ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
