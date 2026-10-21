import { Prisma, type AiBudgetAdjustmentType, type AiBudgetPolicy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlan } from "@/lib/plans";
import { getMxnPerUsdRate } from "@/lib/exchange-rate";
import { toMxn } from "./cost";

// ── Presupuesto de IA por tenant (Hard Budget Limit) ─────────────────────────────────────────────────────────────
// Cada tenant tiene un presupuesto mensual de IA en MXN (el costo máximo que Reymen asume por él; NO un crédito del
// cliente). El gateway reserva presupuesto ANTES de llamar al modelo (con un candado por tenant, para que solicitudes
// simultáneas no sumen más de lo disponible) y, al llegar al 100 %, bloquea las llamadas nuevas de ESE tenant. El bloqueo
// es temporal y reversible: no toca la configuración de los agentes ni las conversaciones, y se levanta solo al renovarse
// el ciclo, al ampliar o restablecer el presupuesto (acciones auditadas) o al acreditarse una recarga válida.

export type BudgetBlockCode = "BUDGET_EXHAUSTED" | "NO_RATE" | "NO_FX";

/** La llamada no se hizo por una regla de presupuesto (no es un error del proveedor). */
export class AiBudgetError extends Error {
  constructor(public readonly code: BudgetBlockCode) {
    super(code);
    this.name = "AiBudgetError";
  }
}

export const BUDGET_ALERT_THRESHOLDS = [50, 75, 90, 100] as const;
/** Una reserva que no se liberó (proceso caído a medias) deja de contar pasado este tiempo. */
export const RESERVATION_TTL_MS = 5 * 60_000;

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
type Tx = Prisma.TransactionClient;

// ── Ciclo de facturación ─────────────────────────────────────────────────────────────────────────────────────────

function localParts(date: Date, timezone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

function offsetMinutes(date: Date, timezone: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(date);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(date.getTime() / 1000) * 1000) / 60_000;
}

/** Medianoche local (en la zona del negocio) de un día, como instante UTC. */
function zonedMidnight(y: number, m: number, d: number, timezone: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMinutes(new Date(guess), timezone) * 60_000;
  t = guess - offsetMinutes(new Date(t), timezone) * 60_000;
  return new Date(t);
}

/**
 * Ciclo mensual que contiene `now`: empieza el día del mes de la fecha ancla (tope 28 para que ningún mes lo pierda), a
 * medianoche en la zona del negocio. Cada ciclo termina donde empieza el siguiente: sin huecos ni traslapes.
 */
export function billingCycle(anchor: Date, timezone: string, now: Date): { start: Date; end: Date } {
  const day = Math.min(28, localParts(anchor, timezone).d);
  const { y, m, d } = localParts(now, timezone);
  const startMonth = d >= day ? { y, m } : m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const endMonth = startMonth.m === 12 ? { y: startMonth.y + 1, m: 1 } : { y: startMonth.y, m: startMonth.m + 1 };
  return { start: zonedMidnight(startMonth.y, startMonth.m, day, timezone), end: zonedMidnight(endMonth.y, endMonth.m, day, timezone) };
}

/** Calendar day in the organization's IANA timezone, including 23/25-hour DST days. */
export function budgetDay(timezone: string, now: Date = new Date()) {
  const { y, m, d } = localParts(now, timezone);
  return { start: zonedMidnight(y, m, d, timezone), end: zonedMidnight(y, m, d + 1, timezone) };
}

// ── Estado del presupuesto ───────────────────────────────────────────────────────────────────────────────────────

export type BudgetStatus = "OK" | "WARN_50" | "WARN_75" | "CRITICAL_90" | "EXHAUSTED";

export type BudgetState = {
  organizationId: string;
  cycleStart: Date;
  cycleEnd: Date;
  /** De dónde sale el presupuesto base: fijado para este cliente o el predeterminado de su plan. */
  source: "setting" | "plan";
  baseMxn: number;
  /** Suma de ampliaciones, restablecimientos, recargas y créditos del ciclo. */
  adjustmentsMxn: number;
  availableMxn: number;
  spentMxn: number;
  reservedMxn: number;
  remainingMxn: number;
  /** Gastado sobre disponible (0–100+). */
  percent: number;
  status: BudgetStatus;
  policy: AiBudgetPolicy;
  degradeCapMxn: number | null;
  fallback: { provider: string; model: string } | null;
};

export function statusFor(percent: number): BudgetStatus {
  return percent >= 100 ? "EXHAUSTED" : percent >= 90 ? "CRITICAL_90" : percent >= 75 ? "WARN_75" : percent >= 50 ? "WARN_50" : "OK";
}

/** Presupuesto base mensual de un plan: sale del catálogo de planes (Admin → Planes). */
export async function planBudgetMxn(plan: string): Promise<number> {
  return (await getPlan(plan)).aiBudgetMxn;
}

export async function loadBudgetState(tx: Tx, organizationId: string, now: Date): Promise<BudgetState & { raw: { spent: Prisma.Decimal; reserved: Prisma.Decimal; available: Prisma.Decimal; degradeCap: Prisma.Decimal | null } }> {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true, timezone: true, createdAt: true, aiBudgetSetting: true } });
  const setting = org.aiBudgetSetting;
  const { start, end } = billingCycle(setting?.cycleAnchorAt ?? org.createdAt, org.timezone, now);
  const [spentAgg, reservedAgg, adjAgg] = await Promise.all([
    tx.aiUsage.aggregate({ where: { organizationId, createdAt: { gte: start, lt: end }, status: { in: ["SUCCEEDED", "REFUSED", "FAILED"] } }, _sum: { costMxn: true } }),
    tx.aiBudgetReservation.aggregate({ where: { organizationId, released: false, expiresAt: { gt: now } }, _sum: { amountMxn: true } }),
    tx.aiBudgetAdjustment.aggregate({ where: { organizationId, cycleStart: start }, _sum: { amountMxn: true } }),
  ]);
  const base = setting?.monthlyBudgetMxn ?? D(await planBudgetMxn(org.plan));
  const adj = adjAgg._sum.amountMxn ?? D(0);
  const spent = spentAgg._sum.costMxn ?? D(0);
  // Pilot root holds are durable financial commitments: disabling a flag must not erase them.
  const pilotHolds = await tx.aiPilotBudgetRoot.aggregate({ where: { organizationId, state: { not: "CLOSED" } }, _sum: { holdMxn: true } });
  const reserved = (reservedAgg._sum.amountMxn ?? D(0)).add(pilotHolds._sum.holdMxn ?? D(0));
  const available = base.add(adj);
  const percent = available.gt(0) ? Number(spent.div(available).mul(100)) : 100;
  return {
    organizationId,
    cycleStart: start,
    cycleEnd: end,
    source: setting?.monthlyBudgetMxn ? "setting" : "plan",
    baseMxn: Number(base),
    adjustmentsMxn: Number(adj),
    availableMxn: Number(available),
    spentMxn: Number(spent),
    reservedMxn: Number(reserved),
    remainingMxn: Number(available.sub(spent).sub(reserved)),
    percent,
    status: statusFor(percent),
    policy: setting?.policy ?? "BLOCK",
    degradeCapMxn: setting?.degradeCapMxn ? Number(setting.degradeCapMxn) : null,
    fallback: setting?.policy === "DEGRADE" && setting.fallbackProvider && setting.fallbackModel && setting.degradeCapMxn && setting.policyAuthorizedById ? { provider: setting.fallbackProvider, model: setting.fallbackModel } : null,
    raw: { spent, reserved, available, degradeCap: setting?.policy === "DEGRADE" ? (setting.degradeCapMxn ?? null) : null },
  };
}

export async function getBudgetState(organizationId: string, now: Date = new Date()): Promise<BudgetState> {
  const { raw: _raw, ...state } = await loadBudgetState(prisma, organizationId, now);
  return state;
}

/**
 * ¿Los agentes de IA de este tenant están bloqueados por presupuesto en este momento? Sí si ya no queda nada, o si el
 * gateway rechazó una llamada por presupuesto en este ciclo después del último ajuste (que sí lo desbloquea).
 */
export async function isBudgetBlocked(organizationId: string, now: Date = new Date()): Promise<boolean> {
  const state = await getBudgetState(organizationId, now);
  if (state.remainingMxn <= 0 && !state.fallback) return true;
  const [lastAdj, lastDenial] = await Promise.all([
    prisma.aiBudgetAdjustment.findFirst({ where: { organizationId, cycleStart: state.cycleStart }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.aiUsage.findFirst({ where: { organizationId, status: "BLOCKED", errorCode: "BUDGET_EXHAUSTED", createdAt: { gte: state.cycleStart } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return !!lastDenial && (!lastAdj || lastDenial.createdAt > lastAdj.createdAt);
}

// ── Reserva (control de concurrencia) ────────────────────────────────────────────────────────────────────────────

export type Estimate = { provider: string; model: string; costMxn: Prisma.Decimal };

export type ReserveResult =
  | { ok: true; reservationId: string; /** Si se aplicó la política DEGRADE autorizada: el modelo económico a usar. */ degradeTo?: { provider: string; model: string } }
  | { ok: false; code: "BUDGET_EXHAUSTED" };

/**
 * Reserva presupuesto para una llamada. Un candado por tenant dentro de una transacción serializa las reservas de ese
 * tenant (los demás no se ven afectados): cada una ve lo gastado MÁS lo ya reservado por las que están en curso.
 */
export async function reserveBudget(organizationId: string, usageId: string, primary: Estimate, fallback: Estimate | null, now: Date = new Date()): Promise<ReserveResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ai-budget:" + organizationId}))`;
    const state = await loadBudgetState(tx, organizationId, now);
    const used = state.raw.spent.add(state.raw.reserved);
    const hold = async (est: Estimate) => (await tx.aiBudgetReservation.create({ data: { organizationId, usageId, amountMxn: est.costMxn, expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS) }, select: { id: true } })).id;

    if (used.add(primary.costMxn).lte(state.raw.available)) return { ok: true as const, reservationId: await hold(primary) };
    // Política DEGRADE (solo con configuración explícita y autorizada): modelo económico, con un tope extra sobre el presupuesto.
    if (state.fallback && fallback && state.raw.degradeCap && used.add(fallback.costMxn).lte(state.raw.available.add(state.raw.degradeCap))) {
      return { ok: true as const, reservationId: await hold(fallback), degradeTo: { provider: fallback.provider, model: fallback.model } };
    }
    return { ok: false as const, code: "BUDGET_EXHAUSTED" as const };
  });
}

/** Libera la reserva de una llamada (ya sea porque terminó y su costo real quedó en el ledger, o porque falló). */
export async function releaseReservation(usageId: string): Promise<void> {
  await prisma.aiBudgetReservation.updateMany({ where: { usageId, released: false }, data: { released: true } });
}

// ── Estimación del peor caso de una llamada ──────────────────────────────────────────────────────────────────────

/** Caracteres por token con los que se estima la entrada: conservador (2.5 < los ~3-4 reales), para no subestimar. */
const CHARS_PER_TOKEN = 2.5;

/**
 * Costo máximo que puede tener una llamada, en MXN: la entrada estimada por su tamaño y TODA la salida permitida, al precio
 * más alto aplicable. null si no hay forma de calcularlo (sin tarifa, o USD sin tipo de cambio): entonces no se llama.
 */
export async function estimateCallCostMxn(provider: string, model: string, input: { system: string; messages: { content: string }[]; maxOutputTokens: number }, now: Date): Promise<{ costMxn: Prisma.Decimal } | { code: "NO_RATE" | "NO_FX" }> {
  const rate = await prisma.aiRate.findFirst({ where: { provider, model, effectiveFrom: { lte: now } }, orderBy: { effectiveFrom: "desc" } });
  if (!rate) return { code: "NO_RATE" };
  const chars = input.system.length + input.messages.reduce((n, m) => n + m.content.length, 0);
  const inputTokens = Math.ceil(chars / CHARS_PER_TOKEN) + 64;
  const maxIn = rate.cacheWritePerMTok && rate.cacheWritePerMTok.gt(rate.inputPerMTok) ? rate.cacheWritePerMTok : rate.inputPerMTok;
  const maxOut = rate.reasoningPerMTok && rate.reasoningPerMTok.gt(rate.outputPerMTok) ? rate.reasoningPerMTok : rate.outputPerMTok;
  const cost = D(inputTokens).mul(maxIn).div(1_000_000).add(D(input.maxOutputTokens).mul(maxOut).div(1_000_000));
  const fx = rate.currency === "USD" ? await getMxnPerUsdRate() : null;
  const mxn = toMxn(cost, rate.currency, fx?.rate ?? null);
  return mxn ? { costMxn: mxn } : { code: "NO_FX" };
}

// ── Acciones administrativas (siempre con quién, cuándo y por qué) ───────────────────────────────────────────────

async function addAdjustment(organizationId: string, type: AiBudgetAdjustmentType, amountMxn: number, reason: string, createdById: string | null, externalRef?: string, now: Date = new Date()) {
  const state = await getBudgetState(organizationId, now);
  const row = await prisma.aiBudgetAdjustment.create({ data: { organizationId, cycleStart: state.cycleStart, type, amountMxn: D(amountMxn), reason, createdById, externalRef: externalRef ?? null } });
  return { id: row.id, state: await getBudgetState(organizationId, now) };
}

/** Amplía el presupuesto del ciclo en curso (excepción autorizada). */
export const extendBudget = (organizationId: string, amountMxn: number, reason: string, adminId: string, now?: Date) => addAdjustment(organizationId, "EXTEND", amountMxn, reason, adminId, undefined, now);

/** Restablece el presupuesto del ciclo: compensa lo ya gastado para que vuelva a quedar completo (asiento compensatorio, no borra historial). */
export async function resetBudget(organizationId: string, reason: string, adminId: string, now: Date = new Date()) {
  const state = await getBudgetState(organizationId, now);
  // Disponible nuevo = gastado + base  →  restante = base.
  return addAdjustment(organizationId, "RESET", Number(D(state.spentMxn).sub(D(state.adjustmentsMxn)).toFixed(2)), reason, adminId, undefined, now);
}

/**
 * Acredita una recarga PAGADA Y CONFIRMADA (quien llama garantiza el pago). Idempotente por `externalRef`: el mismo pago
 * repetido (reintento del webhook) no suma dos veces. Al sumarse capacidad, el tenant vuelve a poder usar IA solo.
 */
export async function applyTopup(organizationId: string, amountMxn: number, externalRef: string, reason: string, adminId: string | null = null, now?: Date): Promise<{ applied: boolean }> {
  try {
    await addAdjustment(organizationId, "TOPUP", amountMxn, reason, adminId, externalRef, now);
    return { applied: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { applied: false };
    throw err;
  }
}

/** Crédito o ajuste administrativo (puede ser negativo para compensar un error). */
export const creditBudget = (organizationId: string, amountMxn: number, reason: string, adminId: string, now?: Date) => addAdjustment(organizationId, "CREDIT", amountMxn, reason, adminId, undefined, now);

/** Fija el presupuesto mensual de un cliente (null = volver al predeterminado de su plan). */
export async function setMonthlyBudget(organizationId: string, amountMxn: number | null, adminId: string) {
  await prisma.aiBudgetSetting.upsert({ where: { organizationId }, create: { organizationId, monthlyBudgetMxn: amountMxn === null ? null : D(amountMxn), updatedById: adminId }, update: { monthlyBudgetMxn: amountMxn === null ? null : D(amountMxn), updatedById: adminId } });
}

/**
 * Política al llegar al 100 %. BLOCK es la predeterminada. DEGRADE exige un modelo económico CON tarifa y un tope de gasto
 * extra, y queda a nombre del admin que lo autoriza.
 */
export async function setBudgetPolicy(organizationId: string, policy: { policy: "BLOCK" } | { policy: "DEGRADE"; provider: string; model: string; capMxn: number }, adminId: string, now: Date = new Date()) {
  if (policy.policy === "DEGRADE") {
    const rate = await prisma.aiRate.findFirst({ where: { provider: policy.provider, model: policy.model, effectiveFrom: { lte: now } } });
    if (!rate) throw new AiBudgetError("NO_RATE");
  }
  const data = policy.policy === "BLOCK"
    ? { policy: "BLOCK" as const, fallbackProvider: null, fallbackModel: null, degradeCapMxn: null, policyAuthorizedById: null, policyAuthorizedAt: null, updatedById: adminId }
    : { policy: "DEGRADE" as const, fallbackProvider: policy.provider, fallbackModel: policy.model, degradeCapMxn: D(policy.capMxn), policyAuthorizedById: adminId, policyAuthorizedAt: now, updatedById: adminId };
  await prisma.aiBudgetSetting.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data });
}
