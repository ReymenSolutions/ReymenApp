import { MetricGrid } from "@/components/shared/MetricGrid";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3, Building2, CreditCard, IdCard, Plus, Users } from "lucide-react";
import { requireAdmin } from "@/lib/guards";
import { getServerLang } from "@/lib/i18n-server";
import { getSmartcardOverview } from "@/lib/smartcard-overview";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COPY = {
  es: {
    title: "SmartCard",
    desc: "Tarjetas NFC/QR de tus clientes: quién las tiene, cómo están ligadas a Reymen y cuánto se usan.",
    companies: "Empresas",
    clients: "Titulares",
    cards: "Tarjetas",
    profiles: "Perfiles",
    events: "Eventos (30 días)",
    attention: "Requiere atención",
    allGood: "Todo en orden: cada empresa está ligada a un cliente de Reymen.",
    unlinked: "Sin cliente de Reymen",
    unlinkedHint: "No se pueden usar desde el portal del cliente hasta vincularlas en Admin → Clientes.",
    stale: "Vínculo roto",
    staleHint: "Apuntan a un cliente que ya no existe en Reymen. Vincúlalas desde el detalle del cliente correcto.",
    quick: "Atajos",
    newCard: "Nueva tarjeta",
    newClient: "Nuevo titular",
    newProfile: "Nuevo perfil",
    seeAll: "Ver todas",
    holder: "Titular: el negocio o la persona a nombre de quien están las tarjetas y perfiles.",
  },
  en: {
    title: "SmartCard",
    desc: "Your clients' NFC/QR cards: who has them, how they're linked to Reymen and how much they're used.",
    companies: "Companies",
    clients: "Holders",
    cards: "Cards",
    profiles: "Profiles",
    events: "Events (30 days)",
    attention: "Needs attention",
    allGood: "All good: every company is linked to a Reymen client.",
    unlinked: "No Reymen client",
    unlinkedHint: "They can't be used from the client portal until linked in Admin → Clients.",
    stale: "Broken link",
    staleHint: "They point to a client that no longer exists in Reymen. Link them from the right client's detail page.",
    quick: "Shortcuts",
    newCard: "New card",
    newClient: "New holder",
    newProfile: "New profile",
    seeAll: "See all",
    holder: "Holder: the business or person the cards and profiles belong to.",
  },
};

export default async function AdminSmartcardPage() {
  await requireAdmin();
  const [lang, overview] = await Promise.all([getServerLang(), getSmartcardOverview()]);
  const t = COPY[lang === "en" ? "en" : "es"];
  // Sin configuración el layout ya mostró el aviso.
  if (!overview) return null;

  const tiles = [
    { href: "/admin/smartcard/companies", label: t.companies, value: overview.companies, icon: Building2 },
    { href: "/admin/smartcard/clients", label: t.clients, value: overview.clients, icon: Users },
    { href: "/admin/smartcard/cards", label: t.cards, value: overview.cards, icon: CreditCard },
    { href: "/admin/smartcard/profiles", label: t.profiles, value: overview.profiles, icon: IdCard },
    { href: "/admin/smartcard/analytics", label: t.events, value: overview.events30d, icon: BarChart3 },
  ];
  const needsAttention = overview.unlinked.length + overview.stale.length > 0;

  return (
    <div>
      <PageHeader
        title={t.title}
        description={t.desc}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/admin/smartcard/cards/new">
                <Plus className="h-4 w-4" />
                {t.newCard}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/smartcard/clients/new">{t.newClient}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/smartcard/profiles/new">{t.newProfile}</Link>
            </Button>
          </div>
        }
      />

      <MetricGrid columns={5} className="mb-6">
        {tiles.map(({ href, label, value, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-300">
            <div className="flex items-center justify-between text-slate-400 group-hover:text-brand-600">
              <Icon className="h-4 w-4" />
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{value.toLocaleString(lang === "en" ? "en-US" : "es-MX")}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </Link>
        ))}
      </MetricGrid>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t.attention}</CardTitle>
          {needsAttention && <AlertTriangle className="h-4 w-4 text-amber-500" />}
        </CardHeader>
        <CardContent className="space-y-5">
          {!needsAttention && <p className="text-sm text-slate-500">{t.allGood}</p>}
          {[
            { rows: overview.stale, label: t.stale, hint: t.staleHint },
            { rows: overview.unlinked, label: t.unlinked, hint: t.unlinkedHint },
          ]
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <div key={g.label}>
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline" className="border-amber-300 text-amber-700">
                    {g.label} · {g.rows.length}
                  </Badge>
                </div>
                <p className="mb-2 text-xs text-slate-500">{g.hint}</p>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {g.rows.map((c) => (
                    <li key={c.id}>
                      <Link href={`/admin/smartcard/companies/${c.id}`} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50">
                        <span className="font-medium text-slate-900">{c.name}</span>
                        <span className="text-xs text-slate-400">{c.slug}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">{t.holder}</p>
        </CardContent>
      </Card>
    </div>
  );
}
