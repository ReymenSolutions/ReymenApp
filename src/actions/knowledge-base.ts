"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAiManager } from "@/lib/guards";
import { knowledgeAccessEnabled, knowledgeWrite, revisionData } from "@/lib/ai/knowledge/service";
import { UserError } from "@/lib/user-error";

const articleSchema = z.object({
  title: z.string().trim().min(1).max(240),
  content: z.string().min(1).max(50000),
  category: z.string().max(120).optional(),
  tags: z.array(z.string().max(80)).max(30).optional(),
});

export async function createArticle(data: z.infer<typeof articleSchema>) {
  const session = await requireAiManager();

  const parsed = articleSchema.parse(data);

  await knowledgeWrite(session.user.organizationId, session.user.id, "knowledge.article.create", async tx => {
    const source = await tx.knowledgeBase.create({ data: { ...parsed, tags: parsed.tags ?? [], organizationId: session.user.organizationId, knowledgeVersion: 1 } });
    await tx.knowledgeRevision.create({ data: { organizationId: source.organizationId, articleId: source.id, version: 1, ...revisionData(source), createdById: session.user.id } });
    return { articleId: source.id, version: source.knowledgeVersion };
  });

  revalidatePath("/portal/knowledge-base");
  return { success: true };
}

export async function updateArticle(
  id: string,
  data: z.infer<typeof articleSchema> & { expectedVersion?: number }
) {
  const session = await requireAiManager();

  id = z.string().min(1).max(128).parse(id);
  const parsed = articleSchema.parse(data);

  await knowledgeWrite(session.user.organizationId, session.user.id, "knowledge.article.update", async tx => {
    const article = await tx.knowledgeBase.findFirst({ where: { id, organizationId: session.user.organizationId } });
    if (!article) throw new UserError("Artículo no encontrado");
    if (knowledgeAccessEnabled() && data.expectedVersion !== article.knowledgeVersion) throw new UserError("El artículo cambió; actualiza antes de guardar");
    const source = await tx.knowledgeBase.update({ where: { id }, data: { ...parsed, knowledgeVersion: { increment: 1 } } });
    await tx.knowledgeRevision.create({ data: { organizationId: source.organizationId, articleId: id, version: source.knowledgeVersion, ...revisionData(source), createdById: session.user.id } });
    return { articleId: source.id, version: source.knowledgeVersion };
  });

  revalidatePath("/portal/knowledge-base");
  return { success: true };
}

export async function deleteArticle(id: string) {
  const session = await requireAiManager();
  id = z.string().min(1).max(128).parse(id);

  await knowledgeWrite(session.user.organizationId, session.user.id, "knowledge.article.deactivate", async tx => {
    const article = await tx.knowledgeBase.findFirst({ where: { id, organizationId: session.user.organizationId } });
    if (!article) throw new UserError("Artículo no encontrado");
    await tx.knowledgeBase.update({ where: { id }, data: { isActive: false } });
    return { articleId: id, enabled: false };
  });

  revalidatePath("/portal/knowledge-base");
  return { success: true };
}

