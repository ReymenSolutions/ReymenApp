"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAiManager } from "@/lib/guards";
import { UserError } from "@/lib/user-error";

const articleSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function createArticle(data: z.infer<typeof articleSchema>) {
  const session = await requireAiManager();

  const parsed = articleSchema.parse(data);

  await prisma.knowledgeBase.create({
    data: {
      ...parsed,
      tags: parsed.tags ?? [],
      organizationId: session.user.organizationId,
    },
  });

  revalidatePath("/portal/knowledge-base");
  return { success: true };
}

export async function updateArticle(
  id: string,
  data: z.infer<typeof articleSchema>
) {
  const session = await requireAiManager();

  const parsed = articleSchema.parse(data);

  const article = await prisma.knowledgeBase.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });
  if (!article) throw new UserError("Artículo no encontrado");

  await prisma.knowledgeBase.update({
    where: { id },
    data: parsed,
  });

  revalidatePath("/portal/knowledge-base");
  return { success: true };
}

export async function deleteArticle(id: string) {
  const session = await requireAiManager();

  const article = await prisma.knowledgeBase.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });
  if (!article) throw new UserError("Artículo no encontrado");

  await prisma.knowledgeBase.delete({ where: { id } });

  revalidatePath("/portal/knowledge-base");
  return { success: true };
}

