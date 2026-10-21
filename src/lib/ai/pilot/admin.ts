import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBudgetState } from "../budget";
import { lockPilotBudget } from "./budget";
import { PRIVATE_MARK_CONFIG, PRIVATE_MARK_DEFINITION, pilotConfigHash } from "./definition";

const targetId = z.string().min(1).max(128);
export const pilotAdminEnabled = () => process.env.REYMEN_STAGING === "true";
export function assertPilotAdminStaging() {
  if (!pilotAdminEnabled()) throw new Error("pilot_admin_requires_staging");
}
async function freshAdmin(tx: Prisma.TransactionClient, actorId: string) {
  if (!await tx.user.findFirst({ where: { id: actorId, isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } })) throw new Error("pilot_admin_forbidden");
}

/** Idempotent preparation only. Never enables a policy, tool, route or provider. */
export async function preparePrivateMark(organizationId: string, actorId: string) {
  assertPilotAdminStaging(); targetId.parse(organizationId);
  return prisma.$transaction(async tx => {
    await freshAdmin(tx, actorId);
    // Definition is shared, configuration and budget are scoped to one tenant.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('private-mark-definition-v1'))`;
    await lockPilotBudget(tx, organizationId);
    const org = await tx.organization.findFirst({ where: { id: organizationId, isActive: true, modules: { some: { module: "AI_WHATSAPP", status: "ACTIVE" } } }, select: { id: true } });
    if (!org) throw new Error("pilot_organization_unavailable");
    const definition = await tx.agentDefinition.upsert({
      where: { key_version: { key: "mark", version: 1 } }, update: {}, create: PRIVATE_MARK_DEFINITION,
    });
    if (pilotConfigHash(definition.manifest) !== pilotConfigHash(PRIVATE_MARK_DEFINITION.manifest)) throw new Error("pilot_definition_conflict");
    const existing = await tx.agentInstance.findUnique({ where: { organizationId_definitionKey: { organizationId, definitionKey: "mark" } }, include: { revisions: true, channelRoutes: true } });
    if (existing) {
      const revision = existing.revisions.find(v => v.version === existing.configVersion);
      if (existing.status !== "PAUSED" || existing.definitionVersion !== 1 || existing.configVersion !== 1 || existing.channelRoutes.length || !revision || revision.sourceHash !== pilotConfigHash(PRIVATE_MARK_CONFIG) || pilotConfigHash(revision.snapshot) !== pilotConfigHash(PRIVATE_MARK_CONFIG)) throw new Error("pilot_configuration_conflict");
      if (!await tx.aiPilotBudgetPolicy.findUnique({ where: { organizationId }, select: { organizationId: true } })) throw new Error("pilot_configuration_conflict");
      return { instanceId: existing.id, version: existing.configVersion, created: false };
    }
    await tx.aiPilotBudgetPolicy.upsert({ where: { organizationId }, update: {}, create: { organizationId, enabled: false, updatedById: actorId } });
    const instance = await tx.agentInstance.create({ data: {
      organizationId, definitionKey: "mark", definitionVersion: 1, publicName: "Mark", status: "PAUSED",
      revisions: { create: { version: 1, sourceHash: pilotConfigHash(PRIVATE_MARK_CONFIG), snapshot: PRIVATE_MARK_CONFIG, createdById: actorId } },
    } });
    await tx.auditLog.create({ data: { organizationId, userId: actorId, action: "ai.private_pilot.prepare", resource: "AgentInstance", resourceId: instance.id, metadata: { version: 1, mode: "review_only", paused: true } } });
    return { instanceId: instance.id, version: 1, created: true };
  }, { timeout: 15000 });
}

/** Platform-only metadata; excludes messages, prompts, customer details and credentials. */
export async function getPrivatePilotAdmin(actorId: string, selectedId?: string, page = 0) {
  assertPilotAdminStaging(); if (selectedId) targetId.parse(selectedId);
  z.number().int().min(0).max(10000).parse(page);
  const result = await prisma.$transaction(async tx => {
    await freshAdmin(tx, actorId);
    const organizations = await tx.organization.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 100 });
    const organizationId = selectedId ?? organizations[0]?.id;
    if (!organizationId) return { organizations, organization: null, instance: null, policy: null, pending: [], pendingCount: 0, roots: [] };
    const organization = await tx.organization.findFirst({ where: { id: organizationId, isActive: true }, select: { id: true, name: true, modules: { where: { module: "AI_WHATSAPP", status: "ACTIVE" }, select: { id: true } } } });
    if (!organization) throw new Error("pilot_organization_unavailable");
    const [instance, policy, pending, pendingCount, roots] = await Promise.all([
      tx.agentInstance.findUnique({ where: { organizationId_definitionKey: { organizationId, definitionKey: "mark" } }, select: { id: true, status: true, configVersion: true } }),
      tx.aiPilotBudgetPolicy.findUnique({ where: { organizationId }, select: { enabled: true, version: true, dailyMxn: true, monthlyMxn: true, rootMxn: true } }),
      tx.aiUsage.findMany({ where: { organizationId, pilotStep: { not: null }, status: "PENDING" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * 10, take: 10, select: { id: true, pilotRootId: true, pilotStep: true, model: true, createdAt: true, pilotEstimateMxn: true } }),
      tx.aiUsage.count({ where: { organizationId, pilotStep: { not: null }, status: "PENDING" } }),
      tx.aiPilotBudgetRoot.findMany({ where: { organizationId, state: { not: "CLOSED" } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, select: { id: true, state: true, holdMxn: true, createdAt: true } }),
    ]);
    return {
      organizations, organization: { id: organization.id, name: organization.name, moduleEnabled: organization.modules.length > 0 }, instance,
      policy: policy ? { ...policy, dailyMxn: policy.dailyMxn.toString(), monthlyMxn: policy.monthlyMxn.toString(), rootMxn: policy.rootMxn.toString() } : null,
      pending: pending.map(v => ({ ...v, createdAt: v.createdAt.toISOString(), pilotEstimateMxn: v.pilotEstimateMxn?.toString() ?? null })), pendingCount,
      roots: roots.map(v => ({ ...v, createdAt: v.createdAt.toISOString(), holdMxn: v.holdMxn.toString() })),
    };
  });
  if (!result.organization) return { ...result, budget: null };
  const budget = await getBudgetState(result.organization.id);
  return { ...result, budget: { spentMxn: budget.spentMxn, reservedMxn: budget.reservedMxn, remainingMxn: budget.remainingMxn, availableMxn: budget.availableMxn } };
}
export type PrivatePilotAdminView = Awaited<ReturnType<typeof getPrivatePilotAdmin>>;
