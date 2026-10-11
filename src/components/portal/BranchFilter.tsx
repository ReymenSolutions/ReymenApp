import Link from "next/link";
import { MAIN_BRANCH_PARAM, type BranchFilter as Filter } from "@/lib/branches";

/** Chips "Todas / Principal / sucursales" para filtrar un reporte; el filtro vive en `?branch=`. */
export function BranchFilter({ branches, current, es, basePath, showAll = true }: { branches: { id: string; name: string }[]; current: Filter; es: boolean; basePath: string; /** false: sin "Todas" (p. ej. existencias, que no se suman entre sucursales). */ showAll?: boolean }) {
  if (branches.length === 0) return null;
  const options: { key: string; label: string; href: string; active: boolean }[] = [
    ...(showAll ? [{ key: "all", label: es ? "Todas las sucursales" : "All branches", href: basePath, active: current === undefined }] : []),
    { key: "main", label: es ? "Principal" : "Main", href: `${basePath}?branch=${MAIN_BRANCH_PARAM}`, active: current === null || (!showAll && current === undefined) },
    ...branches.map((b) => ({ key: b.id, label: b.name, href: `${basePath}?branch=${b.id}`, active: current === b.id })),
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={es ? "Sucursal" : "Branch"}>
      {options.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          aria-current={o.active ? "true" : undefined}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${o.active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
