"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown, Home, ListChecks, LayoutDashboard, Users, Zap, BarChart3, Settings, MessageSquare, Calendar, FileText, LogOut, Bot, Upload, GitBranch, Rocket, UtensilsCrossed, CreditCard, X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import type { PlatformModule } from "@prisma/client";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { LogoPickerDialog } from "@/components/shared/LogoPickerDialog";


interface NavItem {
  href: string;
  labelKey: keyof ReturnType<typeof useNavItems>;
  icon: React.ElementType;
}

function useNavItems() {
  const { t } = usePreferences();
  return {
    home: t.home,
    today: t.today,
    dashboard: t.dashboard,
    onboarding: t.onboarding,
    leads: t.leads,
    pipeline: t.pipeline,
    automations: t.automations,
    whatsapp: t.whatsapp,
    conversations: t.conversations,
    knowledgeBase: t.knowledgeBase,
    prompts: t.prompts,
    aiLab: t.aiLab,
    appointments: t.appointments,
    reports: t.reports,
    templates: t.templates,
    requests: t.requests,
    settings: t.settings,
    signOut: t.signOut,
    food: t.food,
    smartcard: t.smartcard,
  };
}

// `module: undefined` means the section isn't gated by any commercial module
// (always shown regardless of what the org has contracted). `alsoActiveFor`
// covers sibling routes folded into this item's own PortalSectionTabs (see
// src/lib/portal-nav-tabs.ts) — e.g. visiting /portal/prompts should still
// highlight the "WhatsApp AI" sidebar entry, not leave nothing active.
// Menú por secciones, en el orden en que un negocio piensa su día: lo suyo
// (negocio), sus clientes, cómo se comunica, cómo le va y su cuenta. Una
// sección sin entradas visibles (módulos no contratados) no se dibuja.
type NavSectionKey = "main" | "business" | "customers" | "communication" | "results" | "account";

const NAV_ITEMS: { href: string; key: keyof ReturnType<typeof useNavItems>; icon: React.ElementType; section: NavSectionKey; module?: PlatformModule; alsoActiveFor?: string[] }[] = [
  { href: "/portal/home", key: "home", icon: Home, section: "main" },

  { href: "/portal/food", key: "food", icon: UtensilsCrossed, section: "business", module: "FOOD_OPS" },
  { href: "/portal/smartcard", key: "smartcard", icon: CreditCard, section: "business", module: "NFC_QR" },

  { href: "/portal/today", key: "today", icon: ListChecks, section: "customers", module: "CRM" },
  { href: "/portal/leads", key: "leads", icon: Users, section: "customers", module: "CRM" },
  { href: "/portal/pipeline", key: "pipeline", icon: GitBranch, section: "customers", module: "CRM" },
  { href: "/portal/appointments", key: "appointments", icon: Calendar, section: "customers" },

  { href: "/portal/conversations", key: "conversations", icon: MessageSquare, section: "communication", module: "AI_WHATSAPP" },
  { href: "/portal/whatsapp", key: "whatsapp", icon: Bot, section: "communication", module: "AI_WHATSAPP", alsoActiveFor: ["/portal/knowledge-base", "/portal/prompts", "/portal/ai-lab"] },
  { href: "/portal/automations", key: "automations", icon: Zap, section: "communication", module: "AUTOMATIONS", alsoActiveFor: ["/portal/templates"] },

  { href: "/portal/dashboard", key: "dashboard", icon: LayoutDashboard, section: "results" },
  { href: "/portal/reports", key: "reports", icon: BarChart3, section: "results" },

  { href: "/portal/onboarding", key: "onboarding", icon: Rocket, section: "account" },
  { href: "/portal/requests", key: "requests", icon: FileText, section: "account" },
  { href: "/portal/settings", key: "settings", icon: Settings, section: "account" },
];

const SECTION_TITLES: Record<NavSectionKey, { es: string; en: string } | null> = {
  main: null,
  business: { es: "Mi negocio", en: "My business" },
  customers: { es: "Clientes", en: "Customers" },
  communication: { es: "Comunicación", en: "Communication" },
  results: { es: "Resultados", en: "Results" },
  account: { es: "Mi cuenta", en: "My account" },
};
const SECTION_ORDER: NavSectionKey[] = ["main", "business", "customers", "communication", "results", "account"];

interface PortalSidebarProps {
  orgName: string;
  orgLogoUrl?: string | null;
  enabledModules: PlatformModule[];
  pendingConversations?: number;
  /** Off-canvas drawer state below `lg:` — controlled by PortalShell.tsx, which
   * also renders the hamburger toggle in TopBar. No effect at `lg:` and up,
   * where the sidebar is always visible exactly as before. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function PortalSidebar({ orgName, orgLogoUrl: initialLogoUrl, enabledModules, pendingConversations = 0, mobileOpen, onMobileClose }: PortalSidebarProps) {
  const pathname = usePathname();
  const { t, lang } = usePreferences();
  const labels = useNavItems();
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.module || enabledModules.includes(item.module));

  // Secciones cerradas por el usuario; se recuerdan en este navegador. Al
  // entrar a una pantalla, su sección se abre sola.
  const [closedSections, setClosedSections] = useState<NavSectionKey[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("reymen-portal-menu-closed") ?? "[]");
      if (Array.isArray(saved)) setClosedSections(saved.filter((k): k is NavSectionKey => SECTION_ORDER.includes(k)));
    } catch {
      /* sin almacenamiento: todo abierto */
    }
  }, []);
  const activeSection = NAV_ITEMS.find(
    (item) => visibleNavItems.includes(item) && (pathname.startsWith(item.href) || (item.alsoActiveFor?.some((p) => pathname.startsWith(p)) ?? false))
  )?.section;
  useEffect(() => {
    if (activeSection) setClosedSections((closed) => (closed.includes(activeSection) ? closed.filter((k) => k !== activeSection) : closed));
  }, [pathname, activeSection]);
  function toggleSection(section: NavSectionKey) {
    setClosedSections((closed) => {
      const next = closed.includes(section) ? closed.filter((k) => k !== section) : [...closed, section];
      try {
        localStorage.setItem("reymen-portal-menu-closed", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [currentLogoUrl, setCurrentLogoUrl] = useState(initialLogoUrl);



  return (
    <>
      {/*
        Same Reymen-brand treatment as AdminSidebar.tsx — light theme uses
        the brand navy gradient via plain utility classes; dark theme uses
        the shared `.dark .sidebar*` ruleset in globals.css (custom
        properties scoped to that selector, not the global color remap),
        via the same `sidebar*` hook classNames so both sidebars stay in
        sync from one CSS block instead of two.
      */}
      {/* Off-canvas backdrop — below `lg:` only, closes the drawer on click */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "sidebar fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col border-r border-brand-950 bg-gradient-to-b from-brand-900 to-brand-950 transition-transform duration-200 ease-in-out",
          "lg:static lg:z-auto lg:translate-x-0 lg:transition-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo / Org — clickable to update logo */}
        <div className="sidebar-header flex h-16 items-center border-b border-white/10 px-6 hover:bg-white/5 transition-colors">
          <button
            onClick={() => { setLogoDialogOpen(true); }}
            className="flex min-w-0 flex-1 items-center gap-2 text-left group"
          >
            <div className="relative flex-shrink-0">
              {currentLogoUrl ? (
                <img src={currentLogoUrl} alt={orgName} className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <Image src="/icons/icon-192.png" alt="Reymen Solutions" width={32} height={32} className="h-8 w-8 flex-shrink-0 rounded-lg" />
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload className="h-3 w-3 text-white" />
              </div>
            </div>
            <div className="min-w-0">
              <p className="sidebar-name truncate text-sm font-bold text-white leading-none">{orgName}</p>
              <p className="sidebar-subtitle text-xs text-brand-200 leading-none mt-0.5">{t.brandName}</p>
            </div>
          </button>
          <button
            onClick={onMobileClose}
            className="ml-2 flex-shrink-0 rounded-md p-1.5 text-brand-100 hover:bg-white/10 hover:text-white transition-colors lg:hidden"
            aria-label={lang === "es" ? "Cerrar menú" : "Close menu"}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3">
          {SECTION_ORDER.map((section) => {
            const items = visibleNavItems.filter((item) => item.section === section);
            if (items.length === 0) return null;
            const title = SECTION_TITLES[section];
            const isItemActive = (item: (typeof items)[number]) =>
              pathname.startsWith(item.href) || (item.alsoActiveFor?.some((p) => pathname.startsWith(p)) ?? false);
            const open = !title || !closedSections.includes(section);
            return (
              <div key={section} className={cn("space-y-1", section !== "main" && "pt-3")}>
                {title && (
                  <button
                    type="button"
                    onClick={() => toggleSection(section)}
                    aria-expanded={open}
                    aria-controls={`menu-section-${section}`}
                    className="sidebar-subtitle flex w-full items-center justify-between rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-200/70 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    {lang === "en" ? title.en : title.es}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open ? "" : "-rotate-90")} />
                  </button>
                )}
                {open && <div id={`menu-section-${section}`} className="space-y-1">{items.map((item) => {
                  const Icon = item.icon;
                  const isActive = isItemActive(item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onMobileClose}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "sidebar-nav-active bg-white text-brand-700"
                          : "sidebar-nav-inactive text-brand-100 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1">{labels[item.key]}</span>
                      {item.key === "conversations" && pendingConversations > 0 && (
                        <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-semibold text-amber-950">
                          {pendingConversations > 99 ? "99+" : pendingConversations}
                        </span>
                      )}
                    </Link>
                  );
                })}</div>}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer border-t border-white/10 p-3">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="sidebar-nav-inactive flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-brand-100 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t.signOut}
          </button>
        </div>
      </aside>

      <LogoPickerDialog
        key={logoDialogOpen ? "open" : "closed"}
        open={logoDialogOpen}
        onOpenChange={setLogoDialogOpen}
        currentLogoUrl={currentLogoUrl ?? null}
        onSaved={setCurrentLogoUrl}
      />
    </>
  );
}
