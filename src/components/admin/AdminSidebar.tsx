"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, LayoutDashboard, Users, Zap, BarChart3, Settings, MessageSquare, LogOut, AlertTriangle, Layers, Shield, Code, Upload, Webhook, Package, UserCog, X, CreditCard, ShieldCheck, ChevronDown, Cpu, Layers3,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { LogoPickerDialog } from "@/components/shared/LogoPickerDialog";


interface AdminSidebarProps {
  adminName: string;
  /** Organization logo — stored in organization.logoUrl, separate from user.image */
  orgLogoUrl?: string | null;
  /** Personal avatar (user.image) — used as the sidebar identity image for admins without an org */
  personalImageUrl?: string | null;
  /** False for super-admins that have no organization; they manage their personal avatar here instead */
  hasOrganization?: boolean;
  /** Off-canvas drawer state below `lg:` — controlled by AdminShell.tsx, which
   * also renders the hamburger toggle in TopBar. No effect at `lg:` and up,
   * where the sidebar is always visible exactly as before. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AdminSidebar({
  adminName,
  orgLogoUrl: initialOrgLogoUrl,
  personalImageUrl: initialPersonalImageUrl,
  hasOrganization = false,
  mobileOpen,
  onMobileClose,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const { t, lang } = usePreferences();

  const initialImageUrl = hasOrganization ? initialOrgLogoUrl : initialPersonalImageUrl;

  const [logoDialogOpen, setLogoDialogOpen] = useState(false);
  const [currentLogoUrl, setCurrentLogoUrl] = useState(initialImageUrl);

  // Lo general (Dashboard, Configuración) va suelto; todo lo que es solo de
  // administración de la plataforma cuelga de la rama "Admin".
  const homeItem = { href: "/admin/home", label: t.home, icon: Home };
  const dashboardItem = { href: "/admin/dashboard", label: t.dashboard, icon: LayoutDashboard };
  const settingsItem = { href: "/admin/settings", label: t.settings, icon: Settings };
  const adminItems = [
    { href: "/admin/clients", label: t.adminNavClients, icon: Users },
    { href: "/admin/users", label: t.adminNavUsers, icon: UserCog },
    { href: "/admin/automations", label: t.automations, icon: Zap },
    { href: "/admin/escalations", label: t.adminNavEscalations, icon: AlertTriangle },
    { href: "/admin/requests", label: t.requests, icon: MessageSquare },
    { href: "/admin/templates", label: t.templates, icon: Layers },
    { href: "/admin/template-packages", label: t.adminNavPackages, icon: Package },
    { href: "/admin/smartcard", label: "SmartCard", icon: CreditCard },
    { href: "/admin/plans", label: t.adminNavPlans, icon: Layers3 },
    { href: "/admin/ai", label: t.adminNavAi, icon: Cpu },
    { href: "/admin/metrics", label: t.adminNavMetrics, icon: BarChart3 },
    { href: "/admin/audit", label: t.adminNavAudit, icon: Shield },
    { href: "/admin/webhooks", label: t.adminNavWebhooks, icon: Webhook },
    { href: "/admin/api-docs", label: "API Docs", icon: Code },
  ];
  const adminActive = adminItems.some((item) => pathname.startsWith(item.href));

  // Abierta por defecto; si el usuario la cierra se recuerda en este navegador.
  const [adminOpen, setAdminOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("reymen-admin-menu") === "closed") setAdminOpen(false);
    } catch {
      /* sin almacenamiento: queda abierta */
    }
  }, []);
  function toggleAdmin() {
    setAdminOpen((open) => {
      try {
        localStorage.setItem("reymen-admin-menu", open ? "closed" : "open");
      } catch {
        /* ignore */
      }
      return !open;
    });
  }
  const itemClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      active ? "sidebar-nav-active bg-white text-brand-700" : "sidebar-nav-inactive text-brand-100 hover:bg-white/10 hover:text-white"
    );




  return (
    <>
      {/*
        Light theme: Reymen brand navy (matches the physical NFC card /
        marketing identity) — a deliberate visual choice, not a bug fix.
        Dark mode must stay exactly as it is today. This app's dark mode
        works by remapping Tailwind's color CSS variables under a plain
        `.dark` class selector (globals.css) — NOT via Tailwind's `dark:`
        utility variant, which in this project's Tailwind v4 setup compiles
        to `@media (prefers-color-scheme: dark)` (no `@custom-variant dark`
        override), completely disconnected from the `.dark` class
        preferences.tsx actually toggles. So the classes below use plain
        hook classNames (sidebar*) + matching `.dark .sidebar*`
        overrides in globals.css, the same pattern already used there,
        instead of `dark:` utilities that would silently never apply.
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
          "sidebar fixed inset-y-0 left-0 z-40 flex h-dvh w-64 flex-col border-r border-brand-950 bg-gradient-to-b from-brand-900 to-brand-950 transition-transform duration-200 ease-in-out motion-reduce:transition-none",
          "lg:static lg:z-auto lg:translate-x-0 lg:transition-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo — clickable to change the org logo when the admin has an org;
            avatar changes for admins without an org live only in the profile
            menu (TopBar, top right) now, not duplicated here. */}
        <div className="sidebar-header flex h-16 items-center border-b border-white/10 px-6 transition-colors hover:bg-white/5">
          {hasOrganization ? (
            <button
              onClick={() => {
                setLogoDialogOpen(true);
              }}
              className="group flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
            >
              <div className="relative flex-shrink-0">
                {currentLogoUrl ? (
                  <img src={currentLogoUrl} alt={adminName} className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <Image src="/icons/icon-192.png" alt="Reymen Solutions" width={32} height={32} className="h-8 w-8 flex-shrink-0 rounded-lg" />
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Upload className="h-3 w-3 text-white" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="sidebar-name truncate text-sm font-bold text-white leading-none">{adminName}</p>
                <p className="sidebar-subtitle text-xs text-brand-200 leading-none mt-0.5">Admin</p>
              </div>
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {currentLogoUrl ? (
                <img src={currentLogoUrl} alt={adminName} className="h-8 w-8 flex-shrink-0 rounded-lg object-cover" />
              ) : (
                <Image src="/icons/icon-192.png" alt="Reymen Solutions" width={32} height={32} className="h-8 w-8 flex-shrink-0 rounded-lg" />
              )}
              <div className="min-w-0">
                <p className="sidebar-name truncate text-sm font-bold text-white leading-none">{adminName}</p>
                <p className="sidebar-subtitle text-xs text-brand-200 leading-none mt-0.5">Admin</p>
              </div>
            </div>
          )}
          <button
            onClick={onMobileClose}
            className="ml-2 flex-shrink-0 rounded-md p-1.5 text-brand-100 hover:bg-white/10 hover:text-white transition-colors lg:hidden"
            aria-label={lang === "es" ? "Cerrar menú" : "Close menu"}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {[homeItem, dashboardItem].map((item) => (
            <Link key={item.href} href={item.href} onClick={onMobileClose} className={itemClass(pathname.startsWith(item.href))}>
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          ))}

          {/* Rama madre "Admin" */}
          <div>
            <button
              type="button"
              onClick={toggleAdmin}
              aria-expanded={adminOpen}
              aria-controls="admin-menu-group"
              className={cn(
                "sidebar-nav-inactive flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/10 hover:text-white",
                adminActive ? "text-white" : "text-brand-100"
              )}
            >
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">Admin</span>
              <ChevronDown className={cn("h-4 w-4 flex-shrink-0 transition-transform", adminOpen ? "" : "-rotate-90")} />
            </button>
            {adminOpen && (
              <div id="admin-menu-group" className="ml-5 mt-1 space-y-1 border-l border-white/15 pl-2">
                {adminItems.map((item) => (
                  <Link key={item.href} href={item.href} onClick={onMobileClose} className={itemClass(pathname.startsWith(item.href))}>
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link href={settingsItem.href} onClick={onMobileClose} className={itemClass(pathname.startsWith(settingsItem.href))}>
            <settingsItem.icon className="h-4 w-4 flex-shrink-0" />
            {settingsItem.label}
          </Link>
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
