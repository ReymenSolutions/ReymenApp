import Link from "next/link";
import { centerContext } from "@/lib/ai/agents/center-context";
import { aiCenterCopy } from "@/lib/ai/agents/center-copy";
import { getCenterArticles } from "@/lib/ai/agents/center-data";
import { can } from "@/lib/permissions";
import { getRulebook } from "@/lib/rulebook";
import { isDraftProviderConfigured } from "@/lib/ai-draft";
import { formatDate } from "@/lib/utils";
import { AiCenterFrame } from "./Frame";
import { CenterPagination } from "./Pagination";
import { RulebookEditor } from "@/components/portal/RulebookEditor";
import { DeleteArticleButton } from "@/components/portal/DeleteArticleButton";
import { ArticleDialog } from "@/components/portal/ArticleDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
export async function CenterKnowledge({ query }: { query: { q?: string; category?: string; page?: string } }) {
  const { session, organizationId, lang } = await centerContext(); const c = aiCenterCopy(lang), canEdit = can(session.user.role, "knowledge_base:manage");
  const [articles, rulebook] = await Promise.all([getCenterArticles(organizationId, query), getRulebook(organizationId)]);
  const href = (page: number) => `/portal/knowledge-base?${new URLSearchParams({ q: articles.q, category: articles.category, page: String(page) })}`;
  return <AiCenterFrame lang={lang} role={session.user.role} title={c.knowledge} description={`${articles.total} ${lang === "es" ? "resultados" : "results"} · ${articles.active} ${lang === "es" ? "artículos activos en total" : "active articles in total"}`} actions={canEdit ? <ArticleDialog mode="create" /> : undefined}>
    <details className="rounded-card border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer font-semibold text-slate-900">{lang === "es" ? "Reglas del negocio" : "Business rules"}</summary><div className="pt-4"><RulebookEditor initial={rulebook} canEdit={canEdit} aiConfigured={isDraftProviderConfigured()} plainLanguage /></div></details>
    <p className="rounded-card border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900">{c.articlesHint}</p>
    <form action="/portal/knowledge-base" className="flex min-w-0 flex-wrap items-end gap-3" role="search"><div className="min-w-0 flex-1 basis-48 space-y-2"><Label htmlFor="knowledge-search">{c.search}</Label><Input id="knowledge-search" type="search" name="q" defaultValue={articles.q} maxLength={120} className="min-h-11 text-base" /></div><div className="min-w-0 flex-1 basis-40 space-y-2"><Label htmlFor="knowledge-category">{c.category}</Label><select id="knowledge-category" name="category" defaultValue={articles.category} className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-base text-slate-900"><option value="">{c.all}</option>{articles.categories.map(category => <option key={category} value={category}>{category}</option>)}</select></div><Button type="submit" className="min-h-11">{c.searchButton}</Button>{(articles.q || articles.category) && <Link className={buttonVariants({ variant: "outline", className: "min-h-11" })} href="/portal/knowledge-base">{c.clear}</Link>}</form>
    {articles.rows.length === 0 ? <Card><CardContent className="py-6"><p className="text-sm text-slate-600">{c.noArticles}</p>{canEdit && <div className="mt-3"><ArticleDialog mode="create" /></div>}</CardContent></Card> : <ul className="space-y-2">{articles.rows.map(article => <li key={article.id}><Card><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-slate-900">{article.title}</h2><p className="mt-1 text-xs text-slate-500">{article.category ?? (lang === "es" ? "Sin categoría" : "No category")} · {c.updated} {formatDate(article.updatedAt, lang)}</p></div><Badge variant="secondary">{article.isActive ? c.active : c.inactive}</Badge>{canEdit && <div className="flex gap-1"><ArticleDialog mode="edit" article={article} /><DeleteArticleButton id={article.id} /></div>}</div><details><summary className="flex min-h-11 cursor-pointer items-center text-sm text-brand-700">{c.content}</summary><p className="whitespace-pre-wrap text-sm text-slate-600">{article.content}</p></details></CardContent></Card></li>)}</ul>}
    <CenterPagination lang={lang} page={articles.page} pages={articles.pages} href={href} />
  </AiCenterFrame>;
}
