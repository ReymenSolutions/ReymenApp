import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { sanitizeRulebook, type RulebookInput } from "@/lib/rulebook";
import { fingerprint, LEGACY_DEFINITION, readLegacyConfiguration } from "./legacy";

/** Global rollout gate keeps old-schema runtime working. Tenant gate only enables observation, never a second effects owner. */
export const agentModelEnabled = () => process.env.AI_AGENT_MODEL_ENABLED === "true";
export function assertAgentModelEnabled() {
  if (!agentModelEnabled()) throw new UserError("El modelo de agentes aún no está habilitado en este entorno");
}
export async function lockAgentModel(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('ai-agent-model'), hashtext(${organizationId}))::text`;
}

/** Caller holds the tenant model lock. Every revision is insert-only; old executions keep their configVersion. */
export async function syncLegacyInstance(tx: Prisma.TransactionClient, organizationId: string, createdById?: string) {
  const source = await readLegacyConfiguration(tx, organizationId);
  const definition = await tx.agentDefinition.upsert({ where: { key_version: { key: LEGACY_DEFINITION.key, version: LEGACY_DEFINITION.version } }, create: LEGACY_DEFINITION, update: {} });
  if (fingerprint({ key: definition.key, version: definition.version, displayName: definition.displayName, specialty: definition.specialty, manifest: definition.manifest }) !== fingerprint(LEGACY_DEFINITION)) throw new UserError("La definición legacy requiere revisión; no se sobrescribirá");
  let instance = await tx.agentInstance.findUnique({ where: { organizationId_definitionKey: { organizationId, definitionKey: LEGACY_DEFINITION.key } } });
  if (!instance) {
    instance = await tx.agentInstance.create({ data: { organizationId, definitionKey: LEGACY_DEFINITION.key, definitionVersion: 1, publicName: source.publicName, legacyAssistantId: source.legacyAssistantId } });
  } else {
    if (instance.definitionVersion !== LEGACY_DEFINITION.version || (instance.legacyAssistantId && instance.legacyAssistantId !== source.legacyAssistantId)) throw new UserError("El mapeo del asistente requiere revisión; no se reasignará automáticamente");
    const previous = await tx.agentConfigRevision.findUniqueOrThrow({ where: { organizationId_agentInstanceId_version: { organizationId, agentInstanceId: instance.id, version: instance.configVersion } } });
    if (previous.sourceHash === source.sourceHash) return { instance, source };
    instance = await tx.agentInstance.update({ where: { id: instance.id }, data: { configVersion: { increment: 1 }, publicName: source.publicName, legacyAssistantId: source.legacyAssistantId } });
  }
  await tx.agentConfigRevision.create({ data: { organizationId, agentInstanceId: instance.id, version: instance.configVersion, sourceHash: source.sourceHash, snapshot: source.snapshot, createdById } });
  return { instance, source };
}

/** Dry-run is the default, including source hash/counts. Never activates a tenant, specialist, channel or commercial right. */
export async function backfillLegacyAgent(organizationId: string, opts: { apply?: boolean; expectedHash?: string; actorId?: string } = {}) {
  if (!opts.apply) return prisma.$transaction(async tx => {
    const source = await readLegacyConfiguration(tx, organizationId);
    return { applied: false as const, sourceHash: source.sourceHash, inventory: source.inventory };
  }, { isolationLevel: "RepeatableRead" });
  assertAgentModelEnabled();
  return prisma.$transaction(async tx => {
    await lockAgentModel(tx, organizationId);
    const before = await readLegacyConfiguration(tx, organizationId);
    if (!opts.expectedHash || before.sourceHash !== opts.expectedHash) throw new UserError("La configuración cambió; repite la comparación antes de aplicar");
    const { instance, source } = await syncLegacyInstance(tx, organizationId, opts.actorId);
    if (source.sourceHash !== opts.expectedHash) throw new UserError("La configuración cambió durante la comparación; repite la revisión");
    await tx.auditLog.create({ data: { organizationId, userId: opts.actorId, action: "agent_model.backfill", resource: "AgentInstance", resourceId: instance.id, metadata: { configVersion: instance.configVersion, sourceHash: source.sourceHash } } });
    return { applied: true as const, instanceId: instance.id, configVersion: instance.configVersion, sourceHash: source.sourceHash, inventory: source.inventory };
  });
}

/** Reads legacy configuration even when the global gate is off; no dependency on migrated tables in that case. */
export async function getLegacyAgentModel(organizationId: string) {
  const source = await readLegacyConfiguration(prisma, organizationId);
  if (!agentModelEnabled()) return { adapter: "legacy" as const, shadowEnabled: false, source, instance: null };
  const [instance, rollout] = await Promise.all([
    prisma.agentInstance.findUnique({ where: { organizationId_definitionKey: { organizationId, definitionKey: LEGACY_DEFINITION.key } } }),
    prisma.agentModelRollout.findUnique({ where: { organizationId } }),
  ]);
  return { adapter: "legacy" as const, shadowEnabled: rollout?.shadowEnabled ?? false, source, instance };
}

export async function setAgentModelShadow(organizationId: string, enabled: boolean, expectedHash: string, actorId: string) {
  assertAgentModelEnabled();
  return prisma.$transaction(async tx => {
    await lockAgentModel(tx, organizationId);
    const source = await readLegacyConfiguration(tx, organizationId);
    if (source.sourceHash !== expectedHash) throw new UserError("La configuración cambió; repite la comparación");
    if (enabled) {
      const entitlement = await tx.organizationModule.findUnique({ where: { organizationId_module: { organizationId, module: "AI_WHATSAPP" } } });
      if (!source.snapshot.rights.isActive || entitlement?.status !== "ACTIVE") throw new UserError("Organización o módulo inactivo");
      const synced = await syncLegacyInstance(tx, organizationId, actorId);
      if (synced.source.sourceHash !== expectedHash) throw new UserError("La configuración cambió durante la comparación; repite la revisión");
    }
    const rollout = await tx.agentModelRollout.upsert({ where: { organizationId }, create: { organizationId, shadowEnabled: enabled, updatedById: actorId }, update: { shadowEnabled: enabled, updatedById: actorId } });
    await tx.auditLog.create({ data: { organizationId, userId: actorId, action: "agent_model.shadow", resource: "AgentModelRollout", resourceId: organizationId, metadata: { enabled } } });
    return rollout;
  });
}

/** One authoritative write: legacy fields are updated transactionally with their mirror. No tools, grants, plans or channel activations here. */
export async function configureLegacyAgent(organizationId: string, input: { id: string; expectedVersion: number; expectedHash: string; publicName: string; rulebook?: RulebookInput }, actorId: string) {
  assertAgentModelEnabled();
  return prisma.$transaction(async tx => {
    await lockAgentModel(tx, organizationId);
    const instance = await tx.agentInstance.findFirst({ where: { id: input.id, organizationId, definitionKey: LEGACY_DEFINITION.key } });
    if (!instance) throw new UserError("Agente no encontrado");
    const source = await readLegacyConfiguration(tx, organizationId);
    if (instance.configVersion !== input.expectedVersion || source.sourceHash !== input.expectedHash) throw new UserError("La configuración cambió; recarga antes de guardar");
    await tx.whatsAppAssistant.upsert({ where: { organizationId }, create: { organizationId, name: input.publicName, capabilities: [] }, update: { name: input.publicName } });
    if (input.rulebook) {
      const rulebook = sanitizeRulebook(input.rulebook);
      await tx.businessRulebook.upsert({ where: { organizationId }, create: { organizationId, ...rulebook, updatedById: actorId }, update: { ...rulebook, updatedById: actorId } });
    }
    const result = await syncLegacyInstance(tx, organizationId, actorId);
    await tx.auditLog.create({ data: { organizationId, userId: actorId, action: "agent_model.configure", resource: "AgentInstance", resourceId: instance.id, metadata: { configVersion: result.instance.configVersion } } });
    return { id: instance.id, configVersion: result.instance.configVersion, sourceHash: result.source.sourceHash };
  });
}

/** Old identity/rulebook forms share the new CAS lock while their legacy write remains authoritative. */
export async function withLegacyIdentityWrite<T>(organizationId: string, write: (tx: Prisma.TransactionClient) => Promise<T>) {
  if (!agentModelEnabled()) return write(prisma);
  return prisma.$transaction(async tx => {
    await lockAgentModel(tx, organizationId);
    const result = await write(tx);
    const instance = await tx.agentInstance.findUnique({ where: { organizationId_definitionKey: { organizationId, definitionKey: LEGACY_DEFINITION.key } } });
    if (instance) await syncLegacyInstance(tx, organizationId);
    return result;
  });
}
