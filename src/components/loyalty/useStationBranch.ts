"use client";

import { useEffect, useState } from "react";
import { MAIN_BRANCH_PARAM } from "@/lib/branch-param";

const KEY = "reymen-loyalty-station-branch";

/**
 * Sucursal de "esta caja": se recuerda en este navegador para no elegirla en
 * cada visita. Si la guardada ya no existe, vuelve a la principal.
 */
export function useStationBranch(branches: { id: string }[], fixed?: string | null) {
  const [branch, setBranch] = useState<string>(fixed ?? MAIN_BRANCH_PARAM);
  useEffect(() => {
    if (fixed) return;
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && (saved === MAIN_BRANCH_PARAM || branches.some((b) => b.id === saved))) setBranch(saved);
    } catch {
      /* sin almacenamiento: principal */
    }
  }, [branches, fixed]);
  function choose(value: string) {
    setBranch(value);
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
  }
  return { branch: fixed ?? branch, setBranch: choose };
}
