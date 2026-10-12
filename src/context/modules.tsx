"use client";

import { createContext, useContext } from "react";
import type { PlatformModule } from "@prisma/client";

const EnabledModulesContext = createContext<PlatformModule[]>([]);

/** Módulos activos de la organización, para componentes de cliente (las pestañas del CRM, por ejemplo). */
export function EnabledModulesProvider({ modules, children }: { modules: PlatformModule[]; children: React.ReactNode }) {
  return <EnabledModulesContext.Provider value={modules}>{children}</EnabledModulesContext.Provider>;
}

export function useEnabledModules(): PlatformModule[] {
  return useContext(EnabledModulesContext);
}
