"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAiManager } from "@/lib/guards";
import { assertKnowledgeAccessEnabled, prepareRevision, publishRevision, assignRevision, setKnowledgePolicy, reactivateSource } from "@/lib/ai/knowledge/service";
import { readKnowledge } from "@/lib/ai/knowledge/retrieval";
const id = z.string().min(1).max(128), version = z.number().int().min(1).max(2147483646);
export async function reviewKnowledgeSource(input: { articleId: string; expectedUpdatedAt: string }) {
  const s = await requireAiManager();
  const data = z.object({ articleId: id, expectedUpdatedAt: z.string().datetime() }).strict().parse(input);
  const result = await prepareRevision(s.user.organizationId, s.user.id, data.articleId, new Date(data.expectedUpdatedAt));
  revalidatePath("/portal/knowledge-base");
  return result;
}
export async function publishKnowledgeSource(input: { articleId: string; version: number; expectedHash: string }) {
  const s = await requireAiManager();
  const data = z.object({ articleId: id, version, expectedHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(input);
  await publishRevision(s.user.organizationId, s.user.id, data.articleId, data.version, data.expectedHash);
  revalidatePath("/portal/knowledge-base");
}
export async function configureKnowledgeGrant(input: { articleId: string; agentInstanceId: string; revisionVersion: number; expectedVersion: number; enabled: boolean }) {
  const s = await requireAiManager();
  const data = z.object({ articleId: id, agentInstanceId: id, revisionVersion: version, expectedVersion: z.number().int().min(0).max(2147483646), enabled: z.boolean() }).strict().parse(input);
  await assignRevision(s.user.organizationId, s.user.id, data);
  revalidatePath("/portal/knowledge-base");
}
export async function configureKnowledgePolicy(input: { enabled: boolean; expectedVersion: number }) {
  const s = await requireAiManager();
  const data = z.object({ enabled: z.boolean(), expectedVersion: z.number().int().min(0).max(2147483646) }).strict().parse(input);
  await setKnowledgePolicy(s.user.organizationId, s.user.id, data.enabled, data.expectedVersion);
  revalidatePath("/portal/knowledge-base");
}
export async function previewKnowledge(query: string) {
  const s = await requireAiManager();
  assertKnowledgeAccessEnabled();
  return readKnowledge(s.user.organizationId, z.string().trim().max(500).parse(query), undefined, true);
}

export async function reactivateKnowledgeSource(input: { articleId: string; expectedVersion: number }) {
  const s = await requireAiManager();
  const data = z.object({ articleId: id, expectedVersion: z.number().int().min(0).max(2147483646) }).strict().parse(input);
  await reactivateSource(s.user.organizationId, s.user.id, data.articleId, data.expectedVersion);
  revalidatePath("/portal/knowledge-base");
}
