"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAiManager } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { agentModelEnabled, backfillLegacyAgent, configureLegacyAgent, getLegacyAgentModel, setAgentModelShadow } from "@/lib/ai/agents/model";

async function manager() {
  const session = await requireAiManager();
  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId }, select: { isActive: true } });
  if (!org?.isActive) throw new UserError("Organización inactiva");
  return session;
}
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export async function listAgentInstances() {
  const session = await manager();
  return getLegacyAgentModel(session.user.organizationId);
}

export async function prepareLegacyAgent(input: { apply?: boolean; expectedHash?: string } = {}) {
  const session = await manager();
  const parsed = z.object({ apply: z.boolean().default(false), expectedHash: hash.optional() }).strict().parse(input);
  return backfillLegacyAgent(session.user.organizationId, { ...parsed, actorId: session.user.id });
}

/** Activate/pause observation only. Not an entitlement, channel toggle, specialist, tool or dispatch activation. */
export async function setAgentObservation(input: { enabled: boolean; expectedHash: string }) {
  const session = await manager();
  const parsed = z.object({ enabled: z.boolean(), expectedHash: hash }).strict().parse(input);
  await setAgentModelShadow(session.user.organizationId, parsed.enabled, parsed.expectedHash, session.user.id);
  return { success: true, adapter: "legacy" as const, shadowEnabled: parsed.enabled };
}

export async function updateLegacyAgent(input: { id: string; expectedVersion: number; expectedHash: string; publicName: string; rulebook?: { voice: string; greeting: string; rules: string; pricing: string } }) {
  const session = await manager();
  const text = z.string().max(4000);
  const parsed = z.object({ id: z.string().min(1), expectedVersion: z.number().int().positive(), expectedHash: hash, publicName: z.string().trim().min(1).max(120), rulebook: z.object({ voice: text, greeting: text, rules: text, pricing: text }).strict().optional() }).strict().parse(input);
  const result = await configureLegacyAgent(session.user.organizationId, parsed, session.user.id);
  revalidatePath("/portal/whatsapp");
  revalidatePath("/portal/knowledge-base");
  return result;
}

/** Tenant-scoped metadata only. Private configuration, prompts, messages and connector credentials are excluded. */
export async function getAgentExecutionTrace(id: string) {
  const session = await manager();
  if (!agentModelEnabled()) throw new UserError("El modelo de agentes aún no está habilitado en este entorno");
  const row = await prisma.agentExecution.findFirst({ where: { id: z.string().min(1).max(100).parse(id), organizationId: session.user.organizationId }, select: { id: true, agentInstanceId: true, configVersion: true, operation: true, status: true, attempts: true, claimedAt: true, leaseExpiresAt: true, nextAttemptAt: true, lastErrorCode: true, createdAt: true, completedAt: true, steps: { orderBy: { stepKey: "asc" }, select: { stepKey: true, status: true, attempts: true, lastErrorCode: true } } } });
  if (!row) throw new UserError("Ejecución no encontrada");
  return row;
}
