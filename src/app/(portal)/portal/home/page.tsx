import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle, ArrowRight, BarChart3, Bot, Calendar, CreditCard, HelpCircle, ListChecks, MessageSquare, PackageOpen, Rocket, Settings, Truck, UtensilsCrossed, Users, Zap,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerLang } from "@/lib/i18n-server";
import { getEnabledModules } from "@/lib/modules";
import { getOnboardingStatus } from "@/lib/onboarding";
import { getFoodLowStockItems, getFoodSalesSummary } from "@/lib/food";
import { dayPartIn, firstNameOf, shortcutsFor, type HomeShortcut } from "@/lib/portal-home";
import { ShortcutGrid } from "@/components/shared/ShortcutGrid";
import { formatMoney } from "@/lib/utils";
import { cn } from "@/lib/utils";

const ICONS: Record<HomeShortcut["icon"], React.ElementType> = {
  utensils: UtensilsCrossed,
  inventory: PackageOpen,
  chat: MessageSquare,
  calendar: Calendar,
  users: Users,
  zap: Zap,
  card: CreditCard,
  chart: BarChart3,
  help: HelpCircle,
  settings: Settings,
  truck: Truck,
  list: ListChecks,
};

// Lenguaje de todos los días: nada de "leads", "pipeline" ni "módulos".
const COPY = {
  es: {
    morning: "Buenos días",
    afternoon: "Buenas tardes",
    evening: "Buenas noches",
    subtitle: "Esto es lo que necesitas saber hoy.",
    setup: (done: number, total: number) => `Termina de configurar tu cuenta: ${done} de ${total} pasos`,
    setupHint: "Te guiamos paso a paso.",
    todayTitle: "Hoy",
    attentionTitle: "Necesita tu atención",
    allGood: "Todo en orden por ahora. 🎉",
    sales: "Ventas de hoy",
    salesCount: (n: number) => (n === 1 ? "1 venta" : `${n} ventas`),
    appointments: "Citas de hoy",
    newClients: "Contactos nuevos hoy",
    waiting: (n: number) => (n === 1 ? "1 mensaje espera tu respuesta" : `${n} mensajes esperan tu respuesta`),
    lowStock: (n: number) => (n === 1 ? "1 producto de tu inventario se está acabando" : `${n} productos de tu inventario se están acabando`),
    errors: (n: number) => (n === 1 ? "1 automatización tiene un problema" : `${n} automatizaciones tienen un problema`),
    doTitle: "¿Qué quieres hacer?",
    full: "Ver todos los números",
    shortcuts: {
      sales: ["Ver mis ventas", "Qué se vendió y cuánto"],
      operations: ["Ver cómo va el día", "Mesas, cocina y cajas ahora"],
      inventory: ["Revisar mi inventario", "Qué hay y qué falta"],
      delivery: ["Pedidos a domicilio", "Uber Eats, Rappi y DiDi"],
      messages: ["Contestar mensajes", "Lo que escriben tus clientes"],
      appointments: ["Ver mis citas", "Agenda del día"],
      today: ["Qué hago hoy", "Lo que necesita a tu equipo"],
      clients: ["Mis contactos", "Quién te ha buscado"],
      card: ["Mi tarjeta digital", "Escaneos y enlaces"],
      automations: ["Mis automatizaciones", "Lo que Reymen hace por ti"],
      reports: ["Ver reportes", "Cómo va tu negocio"],
      help: ["Pedir ayuda", "Escríbenos y te apoyamos"],
      settings: ["Mi cuenta", "Tu negocio y tu equipo"],
    } as Record<string, [string, string]>,
  },
  en: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    subtitle: "Here's what you need to know today.",
    setup: (done: number, total: number) => `Finish setting up your account: ${done} of ${total} steps`,
    setupHint: "We'll guide you step by step.",
    todayTitle: "Today",
    attentionTitle: "Needs your attention",
    allGood: "All good for now. 🎉",
    sales: "Today's sales",
    salesCount: (n: number) => (n === 1 ? "1 sale" : `${n} sales`),
    appointments: "Today's appointments",
    newClients: "New contacts today",
    waiting: (n: number) => (n === 1 ? "1 message is waiting for your reply" : `${n} messages are waiting for your reply`),
    lowStock: (n: number) => (n === 1 ? "1 inventory item is running low" : `${n} inventory items are running low`),
    errors: (n: number) => (n === 1 ? "1 automation has a problem" : `${n} automations have a problem`),
    doTitle: "What do you want to do?",
    full: "See all the numbers",
    shortcuts: {
      sales: ["See my sales", "What sold and how much"],
      operations: ["See how the day is going", "Tables, kitchen and registers now"],
      inventory: ["Check my inventory", "What you have and what's missing"],
      delivery: ["Delivery orders", "Uber Eats, Rappi and DiDi"],
      messages: ["Answer messages", "What your customers write"],
      appointments: ["See my appointments", "Today's schedule"],
      today: ["What to do today", "What needs your team"],
      clients: ["My contacts", "Who has reached out"],
      card: ["My digital card", "Scans and links"],
      automations: ["My automations", "What Reymen does for you"],
      reports: ["See reports", "How your business is doing"],
      help: ["Ask for help", "Write to us and we'll help"],
      settings: ["My account", "Your business and team"],
    } as Record<string, [string, string]>,
  },
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Inicio: lo primero que ve el cliente. Pocas cosas, con palabras de todos los días. */
export default async function PortalHomePage() {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!session || !orgId) return redirect("/login");

  const [lang, modules, org, onboarding] = await Promise.all([
    getServerLang(),
    getEnabledModules(orgId),
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, timezone: true } }),
    getOnboardingStatus(orgId),
  ]);
  const t = COPY[lang === "en" ? "en" : "es"];
  const has = (m: (typeof modules)[number]) => modules.includes(m);
  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + 24 * 3600_000);

  const [waiting, errors, appointments, newClients, sales, lowStock] = await Promise.all([
    has("AI_WHATSAPP") ? prisma.conversation.count({ where: { organizationId: orgId, status: "ESCALATED" } }) : 0,
    has("AUTOMATIONS") ? prisma.automation.count({ where: { organizationId: orgId, status: "ERROR" } }) : 0,
    prisma.appointment.count({
      where: { organizationId: orgId, startTime: { gte: today, lt: tomorrow }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
    }),
    has("CRM") ? prisma.lead.count({ where: { organizationId: orgId, deletedAt: null, createdAt: { gte: today } } }) : 0,
    has("FOOD_OPS") ? getFoodSalesSummary(orgId) : null,
    has("FOOD_OPS") ? getFoodLowStockItems(orgId, 50) : [],
  ]);

  const attention: { text: string; href: string }[] = [];
  if (waiting > 0) attention.push({ text: t.waiting(waiting), href: "/portal/conversations" });
  if (lowStock.length > 0) attention.push({ text: t.lowStock(lowStock.length), href: "/portal/food/inventory" });
  if (errors > 0) attention.push({ text: t.errors(errors), href: "/portal/automations" });

  const numbers: { label: string; value: string; hint?: string; href: string }[] = [];
  if (sales) numbers.push({ label: t.sales, value: formatMoney(sales.today.gross), hint: t.salesCount(sales.today.count), href: "/portal/food/sales" });
  numbers.push({ label: t.appointments, value: String(appointments), href: "/portal/appointments" });
  if (has("CRM")) numbers.push({ label: t.newClients, value: String(newClients), href: "/portal/leads" });

  const name = firstNameOf(session.user.name);
  const greeting = `${t[dayPartIn(org?.timezone ?? "America/Mexico_City")]}${name ? `, ${name}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{greeting} 👋</h1>
        <p className="mt-1 text-slate-500">
          {org?.name ? `${org.name} · ` : ""}
          {t.subtitle}
        </p>
      </header>

      {!onboarding.allDone && !onboarding.onboardingCompletedAt && (
        <Link
          href="/portal/onboarding"
          className="info-box mb-6 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 transition-colors hover:bg-brand-100"
        >
          <Rocket className="info-box-icon h-6 w-6 flex-shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="info-box-title font-semibold text-brand-900">{t.setup(onboarding.completedCount, onboarding.totalCount)}</p>
            <p className="info-box-text text-sm text-brand-700">{t.setupHint}</p>
          </div>
          <ArrowRight className="h-5 w-5 flex-shrink-0 text-brand-600" />
        </Link>
      )}

      <section aria-labelledby="home-today" className="mb-8">
        <h2 id="home-today" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t.todayTitle}
        </h2>
        <div className={cn("grid gap-3", numbers.length >= 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
          {numbers.map((n) => (
            <Link key={n.label} href={n.href} className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-300">
              <p className="text-sm text-slate-500">{n.label}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{n.value}</p>
              {n.hint && <p className="text-sm text-slate-500">{n.hint}</p>}
            </Link>
          ))}
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            {attention.length > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
            {t.attentionTitle}
          </h3>
          {attention.length === 0 ? (
            <p className="text-sm text-slate-500">{t.allGood}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {attention.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="flex items-center justify-between gap-3 py-2.5 text-slate-800 hover:text-brand-700">
                    <span>{a.text}</span>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="home-do" className="mb-8">
        <h2 id="home-do" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t.doTitle}
        </h2>
        <ShortcutGrid
          items={shortcutsFor(modules).map((s) => {
            const [title, hint] = t.shortcuts[s.key] ?? [s.key, ""];
            return { key: s.key, href: s.href, icon: ICONS[s.icon] ?? Bot, title, hint };
          })}
        />
      </section>

      <p className="text-center">
        <Link href="/portal/dashboard" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
          {t.full} <ArrowRight className="h-4 w-4" />
        </Link>
      </p>
    </div>
  );
}
