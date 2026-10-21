import { Prisma, type AgentSandboxRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { UserError } from "@/lib/user-error";
import { fingerprint } from "@/lib/ai/agents/legacy";
import { checkRateLimit } from "@/lib/rate-limit";
import { MARK_PREVIEW, markSandboxEnabled, sandboxInput, type SandboxInput, type SandboxResult } from "./contract";
import { runMarkSandbox } from "./engine";
import { fixtureDecision, fixtureRead } from "./fixtures";
const RUN_TTL_MS = 60_000;
const pending = ["QUEUED", "RUNNING"] as const;
export function assertMarkSandboxEnabled() {
  if (!markSandboxEnabled()) throw new UserError("Las pruebas de Mark aún no están habilitadas");
}
/** Fresh DB authority at admission and each boundary; never forwards the operator's session to a tool. */
export async function sandboxAuthority(organizationId: string, actorId: string) {
  const [user, module] = await Promise.all([
    prisma.user.findFirst({ where: { id: actorId, organizationId, isActive: true, organization: { isActive: true } }, select: { role: true } }),
    prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId, module: "AI_WHATSAPP" } }, select: { status: true } }),
  ]);
  return !!user && can(user.role, "knowledge_base:manage") && module?.status === "ACTIVE";
}
function hash(input: SandboxInput) { return fingerprint({ input, definition: MARK_PREVIEW.version, fixtures: MARK_PREVIEW.fixtureVersion }); }
function view(row: AgentSandboxRun) {
  return { id: row.id, status: row.status, trace: row.trace, result: row.result as unknown as Partial<SandboxResult> | null, createdAt: row.createdAt, expiresAt: row.expiresAt };
}
export async function expireMarkSandboxRuns(now = new Date()) {
  if (!markSandboxEnabled()) return { count: 0 };
  const stale = await prisma.agentSandboxRun.findMany({ where: { status: { in: [...pending] }, expiresAt: { lte: now } }, orderBy: { expiresAt: "asc" }, take: 50, select: { id: true } });
  if (!stale.length) return { count: 0 };
  return prisma.agentSandboxRun.updateMany({ where: { id: { in: stale.map(r => r.id) }, status: { in: [...pending] }, expiresAt: { lte: now } }, data: { status: "FAILED", result: { mode: "simulation", outcome: "handoff", reason: "timeout", providerCalls: 0, externalEffects: 0 } } });
}
async function ownRun(organizationId: string, actorId: string, id: string) {
  const row = await prisma.agentSandboxRun.findFirst({ where: { id, organizationId, createdById: actorId } });
  if (!row) throw new UserError("Prueba no encontrada");
  if (pending.some(s => s === row.status) && row.expiresAt.getTime() <= Date.now()) {
    await prisma.agentSandboxRun.updateMany({ where: { id, organizationId, createdById: actorId, status: { in: [...pending] } }, data: { status: "FAILED", result: { mode: "simulation", outcome: "handoff", reason: "timeout", providerCalls: 0, externalEffects: 0 } } });
    return prisma.agentSandboxRun.findUniqueOrThrow({ where: { id } });
  }
  return row;
}
export async function admitMarkSandbox(organizationId: string, actorId: string, requestKey: string, raw: SandboxInput) {
  assertMarkSandboxEnabled(); const input = sandboxInput.parse(raw), inputHash = hash(input);
  if (!await sandboxAuthority(organizationId, actorId)) throw new UserError("No autorizado");
  // A duplicate may read the previous durable outcome, but never mutates or reruns it.
  const old = await prisma.agentSandboxRun.findUnique({ where: { organizationId_createdById_requestKey: { organizationId, createdById: actorId, requestKey } } });
  if (old) { if (old.inputHash !== inputHash) throw new UserError("La solicitud cambió; inicia una prueba nueva"); return view(await ownRun(organizationId, actorId, old.id)); }
  if (!(await checkRateLimit(`mark-sandbox:${organizationId}:${actorId}`, { limit: 10, windowMs: 60_000 })).allowed) throw new UserError("Demasiadas pruebas; espera un minuto");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('mark-sandbox'), hashtext(${organizationId + ":" + actorId}))::text`;
    const previous = await tx.agentSandboxRun.findUnique({ where: { organizationId_createdById_requestKey: { organizationId, createdById: actorId, requestKey } } });
    if (previous) { if (previous.inputHash !== inputHash) throw new UserError("La solicitud cambió; inicia una prueba nueva"); return view(previous); }
    await tx.agentSandboxRun.updateMany({ where: { organizationId, createdById: actorId, status: { in: [...pending] }, expiresAt: { lte: new Date() } }, data: { status: "FAILED", result: { mode: "simulation", outcome: "handoff", reason: "timeout", providerCalls: 0, externalEffects: 0 } } });
    if (await tx.agentSandboxRun.findFirst({ where: { organizationId, createdById: actorId, status: { in: [...pending] } }, select: { id: true } })) throw new UserError("Ya hay una prueba en curso; detenla antes de iniciar otra");
    const row = await tx.agentSandboxRun.create({ data: { organizationId, createdById: actorId, requestKey, inputHash, fixtureVersion: MARK_PREVIEW.fixtureVersion, definitionVersion: MARK_PREVIEW.version, expiresAt: new Date(Date.now() + RUN_TTL_MS) } });
    await tx.auditLog.create({ data: { organizationId, userId: actorId, action: "mark.sandbox.admit", resource: "AgentSandboxRun", resourceId: row.id, metadata: { mode: "simulation", definitionVersion: MARK_PREVIEW.version, fixtureVersion: MARK_PREVIEW.fixtureVersion, permissions: input.permissions, channel: input.channel } } });
    return view(row);
  });
}
export async function readMarkSandbox(organizationId: string, actorId: string, id: string) {
  assertMarkSandboxEnabled();
  if (!await sandboxAuthority(organizationId, actorId)) throw new UserError("No autorizado");
  return view(await ownRun(organizationId, actorId, id));
}
export async function cancelMarkSandbox(organizationId: string, actorId: string, id: string) {
  assertMarkSandboxEnabled();
  if (!await sandboxAuthority(organizationId, actorId)) throw new UserError("No autorizado");
  await ownRun(organizationId, actorId, id);
  await prisma.agentSandboxRun.updateMany({ where: { id, organizationId, createdById: actorId, status: { in: [...pending] } }, data: { status: "CANCELLED", result: Prisma.JsonNull } });
  return view(await ownRun(organizationId, actorId, id));
}
export async function executeMarkSandbox(organizationId: string, actorId: string, id: string, raw: SandboxInput) {
  assertMarkSandboxEnabled(); const input = sandboxInput.parse(raw);
  if (!await sandboxAuthority(organizationId, actorId)) throw new UserError("No autorizado");
  const row = await ownRun(organizationId, actorId, id);
  if (row.inputHash !== hash(input) || row.fixtureVersion !== MARK_PREVIEW.fixtureVersion || row.definitionVersion !== MARK_PREVIEW.version) throw new UserError("La solicitud cambió; inicia una prueba nueva");
  if (row.status !== "QUEUED") return view(row);
  const owned = { id, organizationId, createdById: actorId };
  const claim = await prisma.agentSandboxRun.updateMany({ where: { ...owned, status: "QUEUED", expiresAt: { gt: new Date() } }, data: { status: "RUNNING" } });
  if (!claim.count) return view(await ownRun(organizationId, actorId, id));
  const result = await runMarkSandbox(input, {
    next: fixtureDecision, read: fixtureRead,
    authority: async () => {
      if (!markSandboxEnabled() || !await sandboxAuthority(organizationId, actorId)) return "authority_changed";
      const state = await prisma.agentSandboxRun.findFirst({ where: { ...owned, status: "RUNNING", expiresAt: { gt: new Date() } }, select: { id: true } });
      return state ? "ok" : "cancelled";
    },
    progress: async trace => { await prisma.agentSandboxRun.updateMany({ where: { ...owned, status: "RUNNING", expiresAt: { gt: new Date() } }, data: { trace: trace as unknown as Prisma.InputJsonValue } }); },
  });
  // No side effect is admitted here except a sandbox result. Cancellation/expiry fences late commits.
  const stillAuthorized = markSandboxEnabled() && await sandboxAuthority(organizationId, actorId);
  const status = !stillAuthorized ? "CANCELLED" : result.outcome === "reply" ? "SUCCEEDED" : result.outcome === "cancelled" ? "CANCELLED" : "WAITING_HANDOFF";
  await prisma.agentSandboxRun.updateMany({ where: { ...owned, status: "RUNNING", expiresAt: { gt: new Date() } }, data: { status, trace: result.trace as unknown as Prisma.InputJsonValue, result: stillAuthorized ? result as unknown as Prisma.InputJsonValue : Prisma.JsonNull } });
  return view(await ownRun(organizationId, actorId, id));
}
