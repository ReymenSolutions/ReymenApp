import { prisma } from "./prisma";
import { hasModule } from "./modules";

// ─── Eventos del POS: tiempos de cocina y cierres de turno ───────────
// Los procesan POST /api/webhooks/pos/kitchen y /api/webhooks/pos/shifts (autenticación e idempotencia
// por evento las resuelve createOrgWebhookHandler). Un dato inválido tira un Error con el motivo: el POS
// lo ve como rechazo (422) y no reintenta con el mismo contenido.

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v: unknown, min = 0): number | null => (typeof v === "number" && Number.isInteger(v) && v >= min ? v : null);
const date = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Sucursal de Reymen del evento: solo se acepta una de esta organización; si no, Principal. */
async function validBranch(organizationId: string, branchId: unknown): Promise<string | null> {
  const id = str(branchId, 128);
  if (!id) return null;
  return (await prisma.branch.findFirst({ where: { id, organizationId }, select: { id: true } }))?.id ?? null;
}

const MAX_PREP_SECONDS = 24 * 3600;
const STATIONS = new Set(["kitchen", "bar", "desserts"]);

/** `kitchen.ticket_ready`: cocina marcó productos como listos. Un renglón por producto; reenviarlo no duplica. */
export async function processKitchenTicketReady(payload: unknown, organizationId: string): Promise<{ saved: number }> {
  if (!(await hasModule(organizationId, "FOOD_OPS"))) throw new Error("El módulo Food no está habilitado para esta organización");
  const body = rec(payload);
  const orderId = str(body?.orderId, 128);
  const orderNumber = int(body?.orderNumber, 0);
  const tableName = str(body?.tableName, 80);
  if (!body || !orderId || orderNumber === null || !tableName || !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 200) {
    throw new Error("orderId, orderNumber, tableName e items son requeridos");
  }
  const branchId = await validBranch(organizationId, body.branchId);
  const deviceCode = str(body.deviceCode, 20);

  const rows = body.items.map((raw) => {
    const i = rec(raw);
    const itemId = str(i?.itemId, 128);
    const name = str(i?.name);
    const quantity = int(i?.quantity, 1);
    const station = typeof i?.station === "string" && STATIONS.has(i.station) ? i.station : null;
    const sentAt = date(i?.sentAt);
    const readyAt = date(i?.readyAt);
    if (!itemId || !name || quantity === null || !station || !sentAt || !readyAt) throw new Error("Cada producto requiere itemId, name, quantity, station, sentAt y readyAt");
    const prepSeconds = Math.round((readyAt.getTime() - sentAt.getTime()) / 1000);
    // Un reloj descompuesto (listo antes de enviarse, o días después) no debe contaminar los promedios.
    if (prepSeconds < 0 || prepSeconds > MAX_PREP_SECONDS) throw new Error("Los tiempos del producto no son válidos");
    return { externalItemId: itemId, itemName: name, quantity, station, sentAt, readyAt, prepSeconds };
  });

  let saved = 0;
  for (const r of rows) {
    const result = await prisma.foodKitchenTicket.upsert({
      where: { organizationId_externalItemId: { organizationId, externalItemId: r.externalItemId } },
      create: { organizationId, branchId, externalOrderId: orderId, orderNumber, tableName, deviceCode, ...r },
      // Si cocina lo marcó listo otra vez, vale la última vez.
      update: { readyAt: r.readyAt, sentAt: r.sentAt, prepSeconds: r.prepSeconds, station: r.station, quantity: r.quantity },
      select: { id: true },
    });
    if (result) saved++;
  }
  return { saved };
}

/** `shift.closed`: corte Z de un turno de caja. Una fila por turno; reenviarlo no duplica. */
export async function processShiftClosed(payload: unknown, organizationId: string): Promise<void> {
  if (!(await hasModule(organizationId, "FOOD_OPS"))) throw new Error("El módulo Food no está habilitado para esta organización");
  const b = rec(payload);
  const sessionId = str(b?.sessionId, 128);
  const shiftNumber = int(b?.number, 0);
  const openedAt = date(b?.openedAt);
  const closedAt = date(b?.closedAt);
  const openedByName = str(b?.openedByName, 120);
  const closedByName = str(b?.closedByName, 120);
  const money = (k: string) => num(b?.[k]);
  const openingFloat = money("openingFloat");
  const expected = money("expected");
  const counted = money("counted");
  const difference = money("difference");
  const salesTotal = money("salesTotal");
  const tips = money("tips");
  const cancelledTotal = money("cancelledTotal");
  const salesCount = int(b?.salesCount, 0);
  const cancelledCount = int(b?.cancelledCount, 0);
  if (
    !b || !sessionId || shiftNumber === null || !openedAt || !closedAt || !openedByName || !closedByName ||
    [openingFloat, expected, counted, difference, salesTotal, tips, cancelledTotal].some((n) => n === null) ||
    salesCount === null || cancelledCount === null
  ) {
    throw new Error("El cierre de turno no trae todos sus datos");
  }
  if (closedAt < openedAt) throw new Error("El cierre es anterior a la apertura");
  const round2 = (n: number | null) => Math.round((n as number) * 100) / 100;
  const data = {
    branchId: await validBranch(organizationId, b.branchId),
    shiftNumber,
    deviceCode: str(b.deviceCode, 20),
    openedAt,
    closedAt,
    openedByName,
    closedByName,
    openingFloat: round2(openingFloat),
    expected: round2(expected),
    counted: round2(counted),
    // La diferencia se recalcula: no se confía en que el POS la mande consistente.
    difference: round2((counted as number) - (expected as number)),
    salesTotal: round2(salesTotal),
    salesCount,
    tips: round2(tips),
    cancelledTotal: round2(cancelledTotal),
    cancelledCount,
    notes: str(b.notes, 1000),
  };
  await prisma.foodShiftClose.upsert({
    where: { organizationId_externalSessionId: { organizationId, externalSessionId: sessionId } },
    create: { organizationId, externalSessionId: sessionId, ...data },
    update: data,
  });
}

// ─── Lecturas para el Centro de operaciones ──────────────────────────

export interface KitchenTimeRow {
  station: string;
  items: number;
  avgSeconds: number;
  maxSeconds: number;
}

/** Tiempo de preparación por estación en las últimas `hours` horas (undefined = todas las sucursales, null = Principal). */
export async function getKitchenTimes(organizationId: string, hours = 24, branch?: string | null): Promise<KitchenTimeRow[]> {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await prisma.foodKitchenTicket.groupBy({
    by: ["station"],
    where: { organizationId, readyAt: { gte: since }, ...(branch === undefined ? {} : { branchId: branch }) },
    _count: { _all: true },
    _avg: { prepSeconds: true },
    _max: { prepSeconds: true },
  });
  return rows
    .map((r) => ({ station: r.station, items: r._count._all, avgSeconds: Math.round(r._avg.prepSeconds ?? 0), maxSeconds: r._max.prepSeconds ?? 0 }))
    .sort((a, b) => b.items - a.items);
}

/** Últimos cortes de turno (de la sucursal elegida o de todas). */
export async function getRecentShiftCloses(organizationId: string, limit = 5, branch?: string | null) {
  return prisma.foodShiftClose.findMany({
    where: { organizationId, ...(branch === undefined ? {} : { branchId: branch }) },
    orderBy: { closedAt: "desc" },
    take: limit,
  });
}
