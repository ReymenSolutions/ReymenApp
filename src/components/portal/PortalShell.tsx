"use client";

import { Suspense } from "react";
import { NavigationProgress } from "@/components/shared/NavigationProgress";
import { ScrollMemory } from "@/components/shared/ScrollMemory";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useDrawerSwipe } from "@/components/shared/useDrawerSwipe";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { EnabledModulesProvider } from "@/context/modules";
import type { PlatformModule } from "@prisma/client";

interface PortalShellProps {
  aiCenterEnabled?: boolean;
  orgName: string;
  orgLogoUrl: string | null;
  enabledModules: PlatformModule[];
  pendingConversations: number;
  children: React.ReactNode;
}

// Client wrapper so the off-canvas drawer's open/closed state can be shared
// between PortalSidebar and TopBar's hamburger button — both are rendered
// from (portal)/layout.tsx, a Server Component that can't hold useState
// itself. The layout still does all the data fetching; this only owns the
// one boolean neither sidebar nor topbar can own on its own.
export function PortalShell({ aiCenterEnabled = false, orgName, orgLogoUrl, enabledModules, pendingConversations, children }: PortalShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    const close = () => setMobileOpen(false);
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("popstate", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("popstate", close); window.removeEventListener("keydown", escape); };
  }, []);
  // El gesto de regreso del navegador conserva el borde izquierdo.
  const drawer = useDrawerSwipe({ open: mobileOpen, setOpen: setMobileOpen });

  return (
    <EnabledModulesProvider modules={enabledModules}>
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <PortalSidebar
        aiCenterEnabled={aiCenterEnabled}
        orgName={orgName}
        orgLogoUrl={orgLogoUrl}
        enabledModules={enabledModules}
        pendingConversations={pendingConversations}
        mobileOpen={mobileOpen}
        onMobileClose={drawer.close}
      />
      <div className="flex flex-1 flex-col min-h-0 min-w-0">
        <TopBar onMenuClick={drawer.open} />
        <main className={`flex-1 min-w-0 overflow-x-hidden ${mobileOpen ? "overflow-y-hidden lg:overflow-y-auto" : "overflow-y-auto"} overscroll-y-contain p-4 sm:p-6`}>
          <ScrollMemory />
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <PullToRefresh>{children}</PullToRefresh>
        </main>
      </div>
    </div>
    </EnabledModulesProvider>
  );
}
