import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ArticleDialog } from "@/components/portal/ArticleDialog";
import { DeleteArticleButton } from "@/components/portal/DeleteArticleButton";
import { PortalSectionTabs } from "@/components/portal/PortalSectionTabs";
import { getAiWhatsappTabs } from "@/lib/portal-nav-tabs";
import { RulebookEditor } from "@/components/portal/RulebookEditor";
import { getRulebook } from "@/lib/rulebook";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import type { UserRole } from "@prisma/client";

async function getArticles(orgId: string) {
  return prisma.knowledgeBase.findMany({
    where: { organizationId: orgId },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });
}

export default async function KnowledgeBasePage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AI_WHATSAPP");

  const [articles, lang, t, rulebook] = await Promise.all([getArticles(session.user.organizationId), getServerLang(), getServerT(), getRulebook(session.user.organizationId)]);
  const canEditRulebook = can(session.user.role as UserRole, "knowledge_base:manage");
  const activeCount = articles.filter((a) => a.isActive).length;

  // Group by category
  const grouped = articles.reduce<Record<string, typeof articles>>((acc, art) => {
    const key = art.category ?? (lang === "es" ? "Sin categoría" : "No category");
    if (!acc[key]) acc[key] = [];
    acc[key].push(art);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title={lang === "es" ? "Base de Conocimiento y Rulebook" : "Knowledge Base & Rulebook"}
        description={lang === "es" ? `${articles.length} artículos · ${activeCount} activos` : `${articles.length} articles · ${activeCount} active`}
        actions={<ArticleDialog mode="create" />}
      />

      <PortalSectionTabs tabs={getAiWhatsappTabs(t, session.user.role as UserRole)} />

      <RulebookEditor initial={rulebook} canEdit={canEditRulebook} />

      <h2 className="mb-3 text-base font-semibold text-slate-900">{lang === "es" ? "Conocimiento adicional" : "Additional knowledge"}</h2>
      <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 p-3">
        <p className="text-sm text-blue-700">
          {lang === "es" ? (
            <><strong>¿Cómo funciona?</strong> El asistente AI consulta estos artículos automáticamente para responder preguntas de tus clientes. Mantén el contenido actualizado y preciso.</>
          ) : (
            <><strong>How does it work?</strong> The AI assistant automatically consults these articles to answer your customers&apos; questions. Keep the content up to date and accurate.</>
          )}
        </p>
      </div>

      {articles.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={BookOpen}
              title={lang === "es" ? "Base de conocimiento vacía" : "Empty knowledge base"}
              description={lang === "es" ? "Agrega artículos con información sobre tus servicios, precios, horarios y preguntas frecuentes." : "Add articles with information about your services, pricing, hours and frequently asked questions."}
              action={<ArticleDialog mode="create" />}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, categoryArticles]) => (
            <div key={category}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 uppercase tracking-wide">
                <BookOpen className="h-4 w-4" />
                {category}
                <Badge variant="secondary">{categoryArticles.length}</Badge>
              </h2>

              <div className="space-y-2">
                {categoryArticles.map((article) => (
                  <Card key={article.id} className={!article.isActive ? "opacity-60" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-slate-900">{article.title}</p>
                            {!article.isActive && (
                              <Badge variant="secondary">{lang === "es" ? "Inactivo" : "Inactive"}</Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 line-clamp-2">{article.content}</p>
                          <div className="mt-2 flex items-center gap-3">
                            {article.tags.length > 0 && article.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                            <span className="text-xs text-slate-400">
                              {lang === "es" ? "Actualizado" : "Updated"} {formatDate(article.updatedAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <ArticleDialog article={article} mode="edit" />
                          <DeleteArticleButton id={article.id} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
