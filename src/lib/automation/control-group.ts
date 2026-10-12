import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { ATTRIBUTION_WINDOW_DAYS } from "./attribution";

// ── Grupo de control ─────────────────────────────────────────────────────────
// La atribución por último contacto muestra ventas ASOCIADAS, no causadas. Para medir causalidad, un porcentaje
// configurable de los clientes elegibles NO recibe el mensaje a propósito, y se compara su tasa de regreso con la de
// quienes sí lo recibieron. La asignación es determinista (misma automatización + mismo cliente = mismo grupo), así
// el grupo no cambia de un evento a otro y no se puede "elegir" a quién medir.

export const CONTROL_REASON = "control_group";
const DAY = 86_400_000;
/** Por debajo de este tamaño por grupo la diferencia es ruido: no se saca conclusión. */
export const MIN_GROUP_SIZE = 30;

/** ¿Este cliente es parte del grupo de control de esta automatización? (pct = 0 → nunca) */
export function isControlGroup(automationId: string, customerId: string, pct: number): boolean {
  if (!pct || pct <= 0) return false;
  const digest = createHash("sha256").update(`${automationId}:${customerId}`).digest();
  return digest.readUInt32BE(0) % 100 < Math.min(pct, 100);
}

export type LiftResult = {
  automationId: string;
  windowDays: number;
  treated: { customers: number; returned: number; rate: number; revenuePerCustomer: number };
  control: { customers: number; returned: number; rate: number; revenuePerCustomer: number };
  /** Diferencia en puntos porcentuales de la tasa de regreso (tratados − control). */
  liftPoints: number;
  /** Con menos de MIN_GROUP_SIZE por grupo no se concluye nada. */
  reliable: boolean;
};

type Sale = { customerId: string | null; occurredAt: Date; netAmount: unknown };

/** Tasa de regreso (y gasto) en la ventana siguiente a la fecha de referencia de cada cliente. Pura, para poder probarla. */
export function groupStats(refs: { customerId: string; at: Date }[], sales: Sale[], windowDays: number) {
  const byCustomer = new Map<string, Sale[]>();
  for (const s of sales) if (s.customerId) byCustomer.set(s.customerId, [...(byCustomer.get(s.customerId) ?? []), s]);
  let returned = 0;
  let revenue = 0;
  for (const { customerId, at } of refs) {
    const back = (byCustomer.get(customerId) ?? []).filter((s) => s.occurredAt.getTime() > at.getTime() && s.occurredAt.getTime() <= at.getTime() + windowDays * DAY);
    if (back.length > 0) returned++;
    revenue += back.reduce((sum, s) => sum + Number(s.netAmount), 0);
  }
  const n = refs.length;
  return { customers: n, returned, rate: n ? Math.round((returned / n) * 1000) / 10 : 0, revenuePerCustomer: n ? Math.round((revenue / n) * 100) / 100 : 0 };
}

/**
 * Compara a quienes recibieron el mensaje con el grupo de control de la misma automatización en los últimos `days`
 * días. Fecha de referencia: el envío (tratados) o el momento en que habría salido (control). Regreso = cualquier
 * compra (positiva) dentro de la ventana siguiente; no es atribución, es la tasa de regreso de cada grupo.
 */
export async function computeLift(organizationId: string, automationId: string, days = 90, now: Date = new Date(), windowDays = ATTRIBUTION_WINDOW_DAYS): Promise<LiftResult> {
  const since = new Date(now.getTime() - days * DAY);
  const [touches, held] = await Promise.all([
    prisma.automationTouch.findMany({ where: { organizationId, automationId, touchedAt: { gte: since } }, select: { customerId: true, touchedAt: true } }),
    prisma.automationExecution.findMany({ where: { organizationId, automationId, status: "SKIPPED", skipReason: CONTROL_REASON, createdAt: { gte: since } }, select: { subjectId: true, createdAt: true } }),
  ]);
  // Un cliente cuenta una vez por grupo (con su primera fecha de referencia).
  const first = <T,>(items: T[], id: (t: T) => string, at: (t: T) => Date) => {
    const m = new Map<string, Date>();
    for (const i of [...items].sort((a, b) => at(a).getTime() - at(b).getTime())) if (!m.has(id(i))) m.set(id(i), at(i));
    return [...m].map(([customerId, when]) => ({ customerId, at: when }));
  };
  const treatedRefs = first(touches, (t) => t.customerId, (t) => t.touchedAt);
  const controlRefs = first(held, (h) => h.subjectId, (h) => h.createdAt);
  const ids = [...new Set([...treatedRefs, ...controlRefs].map((r) => r.customerId))];
  const sales = ids.length ? await prisma.foodSale.findMany({ where: { organizationId, customerId: { in: ids }, grossAmount: { gt: 0 }, occurredAt: { gte: since } }, select: { customerId: true, occurredAt: true, netAmount: true } }) : [];
  const treated = groupStats(treatedRefs, sales, windowDays);
  const control = groupStats(controlRefs, sales, windowDays);
  return {
    automationId,
    windowDays,
    treated,
    control,
    liftPoints: Math.round((treated.rate - control.rate) * 10) / 10,
    reliable: treated.customers >= MIN_GROUP_SIZE && control.customers >= MIN_GROUP_SIZE,
  };
}
