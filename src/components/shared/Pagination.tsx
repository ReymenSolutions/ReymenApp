"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { usePreferences } from "@/context/preferences";
import { PAGE_SIZES, pageWindow, rangeOf, totalPagesOf } from "@/lib/paging";
import { cn } from "@/lib/utils";

const COPY = {
  es: { showing: (a: number, b: number, t: number) => `Mostrando ${a}–${b} de ${t}`, perPage: "Por página", prev: "Anterior", next: "Siguiente", first: "Primera página", last: "Última página", page: (n: number) => `Página ${n}`, nav: "Paginación" },
  en: { showing: (a: number, b: number, t: number) => `Showing ${a}–${b} of ${t}`, perPage: "Per page", prev: "Previous", next: "Next", first: "First page", last: "Last page", page: (n: number) => `Page ${n}`, nav: "Pagination" },
};

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Si se pasa, aparece el selector «Por página». */
  onPageSizeChange?: (size: number) => void;
  /** Tamaños que ofrece el selector (por omisión 10, 25, 50, 100). */
  pageSizes?: readonly number[];
  className?: string;
}

const BTN = "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Paginación de listas: cuántos se ven, números de página (con la primera, la última y las vecinas), anterior/siguiente y,
 * si la lista lo permite, cuántos por página. Se oculta solo cuando todo cabe en la página más chica.
 */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizes = PAGE_SIZES, className }: PaginationProps) {
  const { lang } = usePreferences();
  const c = COPY[lang === "en" ? "en" : "es"];
  const pages = totalPagesOf(total, pageSize);
  if (total <= Math.min(...pageSizes)) return null;
  const { from, to } = rangeOf(page, pageSize, total);

  return (
    <nav aria-label={c.nav} className={cn("flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", className)}>
      <p className="text-xs text-slate-500" aria-live="polite">{c.showing(from, to, total)}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} aria-label={c.first} title={c.first} className={cn(BTN, "border-slate-200 text-slate-600 hover:bg-slate-50")}>
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label={c.prev} title={c.prev} className={cn(BTN, "border-slate-200 text-slate-600 hover:bg-slate-50")}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pageWindow(page, pages).map((n, i) =>
          n === "gap" ? (
            <span key={`g${i}`} aria-hidden="true" className="px-1 text-slate-400">…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPageChange(n)}
              aria-label={c.page(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(BTN, n === page ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label={c.next} title={c.next} className={cn(BTN, "border-slate-200 text-slate-600 hover:bg-slate-50")}>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onPageChange(pages)} disabled={page >= pages} aria-label={c.last} title={c.last} className={cn(BTN, "border-slate-200 text-slate-600 hover:bg-slate-50")}>
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {onPageSizeChange && (
        <label className="flex items-center gap-2 text-xs text-slate-500">
          {c.perPage}
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700">
            {pageSizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}

/**
 * Paginación guiada por la dirección: cambia `page` y `ps` en la URL y conserva los demás filtros. Sirve en páginas de
 * servidor (clientes, prospectos, propiedades, conversaciones) donde la lista se vuelve a pedir al cambiar de página.
 */
export function UrlPagination({ page, pageSize, total, defaultPageSize = 25, className }: { page: number; pageSize: number; total: number; defaultPageSize?: number; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(next: { page?: number; ps?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.ps !== undefined) {
      if (next.ps === defaultPageSize) params.delete("ps");
      else params.set("ps", String(next.ps));
      params.delete("page");
    }
    if (next.page !== undefined) {
      if (next.page > 1) params.set("page", String(next.page));
      else params.delete("page");
    }
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return <Pagination page={page} pageSize={pageSize} total={total} onPageChange={(p) => go({ page: p })} onPageSizeChange={(s) => go({ ps: s })} className={className} />;
}
