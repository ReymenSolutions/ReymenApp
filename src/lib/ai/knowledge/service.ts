import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { fingerprint } from "@/lib/ai/agents/legacy";

export const knowledgeAccessEnabled = () => process.env.AI_KNOWLEDGE_ACCESS_ENABLED === "true";
export function assertKnowledgeAccessEnabled() {
  if (!knowledgeAccessEnabled()) throw new UserError("El acceso por fuentes aún no está habilitado");
}
export async function lockKnowledge(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('knowledge-access'), hashtext(${organizationId}))::text`;
}
export async function bumpKnowledge(tx: Prisma.TransactionClient, organizationId: string) {
  return tx.knowledgeAccessPolicy.upsert({ where: { organizationId }, create: { organizationId }, update: { version: { increment: 1 } } });
}
export type SourceContent = { title: string; content: string; category: string | null; tags: string[] };
export function revisionData(source: SourceContent) {
  const data = { title: source.title, content: source.content, category: source.category, tags: source.tags };
  return { ...data, sourceHash: fingerprint(data) };
}
export async function knowledgeWrite<T>(organizationId: string, actorId: string, action: string, write: (tx: Prisma.TransactionClient) => Promise<T>, invalidate = true) {
  return prisma.$transaction(async tx => {
    await lockKnowledge(tx, organizationId);
    const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { isActive: true } });
    if (!org?.isActive) throw new UserError("Organización no disponible");
    const result = await write(tx);
    if (invalidate) await bumpKnowledge(tx, organizationId);
    const metadata: Record<string, string | number | boolean> = {};
    if (result && typeof result === "object") for (const key of ["id", "articleId", "agentInstanceId", "version", "revisionVersion", "enabled"]) {
      const value = (result as Record<string, unknown>)[key];
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") metadata[key] = value;
    }
    await tx.auditLog.create({ data: { organizationId, userId: actorId, action, resource: "KnowledgeAccess", metadata } });
    return result;
  });
}
export async function prepareRevision(organizationId: string, actorId: string, articleId: string, expectedUpdatedAt: Date) {
  assertKnowledgeAccessEnabled();
  return knowledgeWrite(organizationId, actorId, "knowledge.review.prepare", async tx => {
    const source = await tx.knowledgeBase.findFirst({ where: { id: articleId, organizationId } });
    if (!source || source.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new UserError("El artículo cambió; actualiza y revisa de nuevo");
    if (source.knowledgeVersion > 0) return tx.knowledgeRevision.findUniqueOrThrow({ where: { organizationId_articleId_version: { organizationId, articleId, version: source.knowledgeVersion } } });
    const updated = await tx.knowledgeBase.update({ where: { id: articleId }, data: { knowledgeVersion: 1, updatedAt: source.updatedAt } });
    return tx.knowledgeRevision.create({ data: { organizationId, articleId, version: 1, ...revisionData(updated), createdById: actorId } });
  }, false);
}
export async function publishRevision(organizationId: string, actorId: string, articleId: string, version: number, expectedHash: string) {
  assertKnowledgeAccessEnabled();
  return knowledgeWrite(organizationId, actorId, "knowledge.revision.publish", async tx => {
    const source = await tx.knowledgeBase.findFirst({ where: { id: articleId, organizationId, knowledgeVersion: version } });
    const revision = await tx.knowledgeRevision.findUnique({ where: { organizationId_articleId_version: { organizationId, articleId, version } } });
    if (!source?.isActive || !revision || revision.sourceHash !== expectedHash || revisionData(source).sourceHash !== revision.sourceHash) throw new UserError("El artículo cambió; revisa su versión actual");
    if (revision.publishedAt) return revision;
    return tx.knowledgeRevision.update({ where: { organizationId_articleId_version: { organizationId, articleId, version } }, data: { publishedAt: new Date(), publishedById: actorId } });
  });
}
export async function assignRevision(organizationId: string, actorId: string, input: { articleId: string; agentInstanceId: string; revisionVersion: number; expectedVersion: number; enabled: boolean }) {
  assertKnowledgeAccessEnabled();
  return knowledgeWrite(organizationId, actorId, "knowledge.grant.configure", async tx => {
    const { articleId, agentInstanceId } = input;
    const instance = await tx.agentInstance.findFirst({ where: { id: agentInstanceId, organizationId } });
    const revision = await tx.knowledgeRevision.findUnique({ where: { organizationId_articleId_version: { organizationId, articleId, version: input.revisionVersion } }, include: { article: { select: { isActive: true } } } });
    if (!instance || !revision?.publishedAt || (input.enabled && !revision.article.isActive)) throw new UserError("Fuente o asistente no disponible");
    const where = { organizationId_articleId_agentInstanceId: { organizationId, articleId, agentInstanceId } };
    const grant = await tx.knowledgeGrant.findUnique({ where });
    if ((grant?.version ?? 0) !== input.expectedVersion) throw new UserError("La asignación cambió; actualiza antes de guardar");
    return tx.knowledgeGrant.upsert({ where, create: { organizationId, articleId, agentInstanceId, revisionVersion: input.revisionVersion, enabled: input.enabled }, update: { revisionVersion: input.revisionVersion, enabled: input.enabled, version: { increment: 1 } } });
  });
}
export async function setKnowledgePolicy(organizationId: string, actorId: string, enabled: boolean, expectedVersion: number) {
  assertKnowledgeAccessEnabled();
  return knowledgeWrite(organizationId, actorId, "knowledge.policy.configure", async tx => {
    const policy = await tx.knowledgeAccessPolicy.findUnique({ where: { organizationId } });
    if ((policy?.version ?? 0) !== expectedVersion) throw new UserError("La configuración cambió; actualiza antes de guardar");
    if (enabled && !await tx.agentInstance.findFirst({ where: { organizationId, definitionKey: "legacy-assistant", definitionVersion: 1, status: "LEGACY" } })) throw new UserError("Prepara primero el asistente existente");
    return tx.knowledgeAccessPolicy.upsert({ where: { organizationId }, create: { organizationId, enabled }, update: { enabled } });
  });
}

export async function reactivateSource(organizationId: string, actorId: string, articleId: string, expectedVersion: number) {
  assertKnowledgeAccessEnabled();
  return knowledgeWrite(organizationId, actorId, "knowledge.article.reactivate", async tx => {
    const source = await tx.knowledgeBase.findFirst({ where: { id: articleId, organizationId, knowledgeVersion: expectedVersion } });
    if (!source) throw new UserError("El artículo cambió; actualiza antes de guardar");
    return tx.knowledgeBase.update({ where: { id: articleId }, data: { isActive: true } });
  });
}
