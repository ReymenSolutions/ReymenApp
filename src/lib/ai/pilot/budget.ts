import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { UserError } from "@/lib/user-error";
import { budgetDay, loadBudgetState } from "../budget";

export const PILOT_LIMITS = Object.freeze({ monthly: 500, daily: 25, root: 1, agentKey: "mark:pilot" });
const enabled = () => process.env.AI_MARK_PILOT_BUDGET_ENABLED === "true";
const requestKeySchema = z.string().uuid();
type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
function gate() { if (!enabled()) throw new UserError("El presupuesto piloto no está habilitado"); }
async function authority(tx: Tx, organizationId: string, actorId: string) {
  const user = await tx.user.findFirst({ where: { id: actorId, organizationId, isActive: true, organization: { isActive: true } }, select: { role: true } });
  const entitlement = await tx.organizationModule.findUnique({ where: { organizationId_module: { organizationId, module: "AI_WHATSAPP" } }, select: { status: true } });
  if (!user || !can(user.role, "knowledge_base:manage") || entitlement?.status !== "ACTIVE") throw new UserError("No autorizado");
}
async function lock(tx: Tx, organizationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ai-budget:" + organizationId}))`;
}
/** Platform-only opt-in. Changing this policy does not enable a provider or a channel. */
export async function configurePilotBudget(organizationId: string, adminId: string, on: boolean, expectedVersion: number) {
  z.boolean().parse(on); if (on) gate(); z.string().min(1).max(128).parse(organizationId); z.number().int().nonnegative().parse(expectedVersion);
  return prisma.$transaction(async tx => {
    await lock(tx, organizationId);
    const admin = await tx.user.findFirst({ where: { id: adminId, isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } });
    if (!admin) throw new UserError("No autorizado");
    const org = await tx.organization.findFirst({ where: { id: organizationId, isActive: true }, select: { id: true } });
    if (!org) throw new UserError("Organización no disponible");
    const previous = await tx.aiPilotBudgetPolicy.findUnique({ where: { organizationId } });
    if ((previous?.version ?? 0) !== expectedVersion) throw new UserError("La configuración cambió; actualiza antes de guardar");
    const row = await tx.aiPilotBudgetPolicy.upsert({ where: { organizationId }, create: { organizationId, enabled: on, updatedById: adminId }, update: { enabled: on, version: { increment: 1 }, updatedById: adminId } });
    await tx.auditLog.create({ data: { organizationId, userId: adminId, action: "ai.pilot_budget.configure", resource: "AiPilotBudgetPolicy", resourceId: organizationId, metadata: { enabled: on, version: row.version, dailyMxn: row.dailyMxn.toString(), monthlyMxn: row.monthlyMxn.toString(), rootMxn: row.rootMxn.toString() } } });
    return row;
  });
}
async function state(tx: Tx, organizationId: string, now: Date) {
  const policy = await tx.aiPilotBudgetPolicy.findUnique({ where: { organizationId } });
  if (!policy?.enabled) throw new UserError("El presupuesto piloto está desactivado para este negocio");
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  const day = budgetDay(org.timezone, now), global = await loadBudgetState(tx, organizationId, now);
  const where = { organizationId, agentKey: PILOT_LIMITS.agentKey, status: { in: ["SUCCEEDED", "REFUSED", "FAILED"] as ("SUCCEEDED" | "REFUSED" | "FAILED")[] } };
  const [daily, monthly, holds] = await Promise.all([
    tx.aiUsage.aggregate({ where: { ...where, createdAt: { gte: day.start, lt: day.end } }, _sum: { costMxn: true } }),
    tx.aiUsage.aggregate({ where: { ...where, createdAt: { gte: global.cycleStart, lt: global.cycleEnd } }, _sum: { costMxn: true } }),
    tx.aiPilotBudgetRoot.aggregate({ where: { organizationId, state: { not: "CLOSED" } }, _sum: { holdMxn: true } }),
  ]);
  return { policy, timezone: org.timezone, day, global, daily: daily._sum.costMxn ?? D(0), monthly: monthly._sum.costMxn ?? D(0), held: holds._sum.holdMxn ?? D(0) };
}
/** Admission primitive only. The fictional Mark sandbox does not call this or incur usage. */
export async function reservePilotRoot(organizationId: string, actorId: string, requestKey: string, now = new Date()) {
  gate(); requestKeySchema.parse(requestKey);
  return prisma.$transaction(async tx => {
    await lock(tx, organizationId); await authority(tx, organizationId, actorId);
    const previous = await tx.aiPilotBudgetRoot.findUnique({ where: { organizationId_createdById_requestKey: { organizationId, createdById: actorId, requestKey } } });
    if (previous) return previous;
    const s = await state(tx, organizationId, now), amount = Prisma.Decimal.min(s.policy.rootMxn, D(PILOT_LIMITS.root));
    // No global DEGRADE allowance is used by this private pilot.
    if (amount.lte(0) || s.daily.add(s.held).add(amount).gt(Prisma.Decimal.min(s.policy.dailyMxn, D(PILOT_LIMITS.daily))) || s.monthly.add(s.held).add(amount).gt(Prisma.Decimal.min(s.policy.monthlyMxn, D(PILOT_LIMITS.monthly))) || amount.gt(s.global.raw.available.sub(s.global.raw.spent).sub(s.global.raw.reserved))) throw new UserError("Presupuesto piloto agotado; continúa con atención humana");
    return tx.aiPilotBudgetRoot.create({ data: { organizationId, createdById: actorId, requestKey, agentKey: PILOT_LIMITS.agentKey, policyVersion: s.policy.version, timezone: s.timezone, dayStart: s.day.start, dayEnd: s.day.end, cycleStart: s.global.cycleStart, cycleEnd: s.global.cycleEnd, rootLimitMxn: amount, holdMxn: amount } });
  }, { timeout: 15000, maxWait: 15000 });
}
async function own(tx: Tx, organizationId: string, actorId: string, id: string) {
  await authority(tx, organizationId, actorId);
  const row = await tx.aiPilotBudgetRoot.findFirst({ where: { id, organizationId, createdById: actorId } });
  if (!row) throw new UserError("Prueba no encontrada");
  return row;
}
/** Must precede any future provider dispatch. No transport is implemented by this primitive. */
export async function beginPilotRoot(organizationId: string, actorId: string, id: string, now = new Date()) {
  gate();
  return prisma.$transaction(async tx => {
    await lock(tx, organizationId); const row = await own(tx, organizationId, actorId, id), s = await state(tx, organizationId, now);
    if (row.state !== "RESERVED" || now < row.dayStart || now >= row.dayEnd || now >= row.cycleEnd || s.timezone !== row.timezone || s.policy.version !== row.policyVersion) throw new UserError("La prueba cambió o venció; no se puede iniciar");
    return tx.aiPilotBudgetRoot.update({ where: { id }, data: { state: "IN_FLIGHT" } });
  });
}
/** Zero-dispatch cancellation only. In-flight/uncertain work must retain its hold for reconciliation. */
export async function cancelUnusedPilotRoot(organizationId: string, actorId: string, id: string) {
  return prisma.$transaction(async tx => {
    await lock(tx, organizationId); const row = await own(tx, organizationId, actorId, id);
    if (row.state === "CLOSED") return row;
    const calls = await tx.aiUsage.count({ where: { organizationId, OR: [{ pilotRootId: id }, { executionId: id }] } });
    if (row.state !== "RESERVED" || calls > 0) throw new UserError("La operación requiere conciliación; se conserva la reserva");
    return tx.aiPilotBudgetRoot.update({ where: { id }, data: { state: "CLOSED", holdMxn: 0, closedAt: new Date() } });
  });
}
