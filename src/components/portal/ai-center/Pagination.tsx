import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { aiCenterCopy } from "@/lib/ai/agents/center-copy";
import { buttonVariants } from "@/components/ui/button";
export function CenterPagination({ page, pages, href, lang }: { page: number; pages: number; href: (page: number) => string; lang: Lang }) {
  if (pages <= 1) return null;
  const c = aiCenterCopy(lang);
  return <nav aria-label={lang === "es" ? "Paginación" : "Pagination"} className="flex flex-wrap items-center justify-between gap-3">
    {page > 1 ? <Link className={buttonVariants({ variant: "outline", className: "min-h-11" })} href={href(page - 1)}>{c.previous}</Link> : <span />}
    <span className="text-sm tabular-nums text-slate-600">{page} / {pages}</span>
    {page < pages ? <Link className={buttonVariants({ variant: "outline", className: "min-h-11" })} href={href(page + 1)}>{c.next}</Link> : <span />}
  </nav>;
}
