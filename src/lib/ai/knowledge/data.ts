import { prisma } from "@/lib/prisma";
/** Server-only; page has already derived organization and role from its session. */
export async function knowledgeGovernance(organizationId: string, articleIds: string[]) {
  const [policy, instances, revisions, grants] = await Promise.all([
    prisma.knowledgeAccessPolicy.findUnique({ where: { organizationId } }),
    prisma.agentInstance.findMany({ where: { organizationId }, orderBy: { publicName: "asc" }, select: { id: true, publicName: true } }),
    prisma.knowledgeRevision.findMany({ where: { organizationId, articleId: { in: articleIds }, publishedAt: { not: null } }, orderBy: [{ articleId: "asc" }, { version: "desc" }], select: { articleId: true, version: true } }),
    prisma.knowledgeGrant.findMany({ where: { organizationId, articleId: { in: articleIds } } }),
  ]);
  return { policy: { enabled: policy?.enabled ?? false, version: policy?.version ?? 0 }, instances, revisions, grants };
}
