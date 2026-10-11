// Pure module — importable from client and server contexts.
// Centro de operaciones (Food → Operación): convierte la "foto" que entrega
// el servidor de Reymen POS (GET /api/ops/snapshot) en lo que muestra la
// página. Sin Prisma ni fetch para poder probarlo aislado.

export type PosStation = "kitchen" | "bar" | "desserts";
export type PosItemStatus = "held" | "new" | "preparing" | "ready" | "delivered" | "cancelled";

export interface PosOrderItem {
  id: string;
  dishName: string;
  variantLabel: string;
  quantity: number;
  unitPriceCents: number;
  note: string;
  course: number;
  station: PosStation;
  status: PosItemStatus;
  sentAt: string | null;
  readyAt: string | null;
}

export interface PosOrder {
  id: string;
  number: number;
  tableId: string | null;
  tableName: string;
  guests: number;
  status: "open" | "paid" | "cancelled";
  priority: boolean;
  openedAt: string;
  waiterName: string;
  items: PosOrderItem[];
  closedAt: string | null;
  /** Sucursal de Reymen (null/ausente: Principal). POS anteriores a las sucursales no lo mandan. */
  branchId?: string | null;
}

export interface PosDeviceStatus {
  code: string;
  name: string;
  employeeName: string | null;
  kitchenMode: boolean;
  cash: {
    number: number;
    openedAt: string;
    openedByName: string;
    salesCount: number;
    salesCents: number;
    tipsCents: number;
    expectedCashCents: number;
    cardCents: number;
    transferCents: number;
    cancelledCount: number;
  } | null;
  today: { salesCount: number; salesCents: number; cancelledCount: number };
  outbox: { pending: number; failed: number; lastError: string | null };
  soldOut: { dishId: string; name: string }[];
  lastPrintAt: string | null;
  menuCheckedAt: string | null;
}

export interface PosSnapshot {
  serverTime: string;
  floor: {
    tables: { id: string; name: string; area: string; seats: number; active: boolean; branchId?: string | null }[];
    orders: PosOrder[];
    kitchen: { lateMinutes: number };
  };
  devices: { deviceId: string; number: number; lastSeenAt: string; statusAt: string | null; status: PosDeviceStatus | null }[];
  staffCount: number;
}

/** Un dispositivo que no reporta en este tiempo se considera desconectado. */
export const DEVICE_ONLINE_MS = 2 * 60_000;

export interface OpenOrderRow {
  id: string;
  number: number;
  tableName: string;
  guests: number;
  waiterName: string;
  minutesOpen: number;
  totalCents: number;
  ready: number;
  cooking: number;
  held: number;
  priority: boolean;
  late: boolean;
}

export interface LateItemRow {
  orderNumber: number;
  tableName: string;
  name: string;
  quantity: number;
  station: PosStation;
  minutes: number;
  priority: boolean;
}

export interface DeviceRow {
  deviceId: string;
  code: string;
  name: string;
  online: boolean;
  lastSeenAt: string;
  status: PosDeviceStatus | null;
}

export interface OperationsSummary {
  tables: { total: number; occupied: number };
  openOrders: OpenOrderRow[];
  openTotalCents: number;
  guests: number;
  kitchen: {
    lateMinutes: number;
    newCount: number;
    preparingCount: number;
    readyCount: number;
    byStation: Record<PosStation, number>;
    avgPrepMinutes: number | null;
    late: LateItemRow[];
  };
  devices: DeviceRow[];
  /** Unión de agotados de todas las cajas, con qué caja lo marcó. */
  soldOut: { dishId: string; name: string; devices: string[] }[];
  /** Ventas de hoy según las cajas (incluye las que aún no llegan a Reymen). */
  posToday: { salesCount: number; salesCents: number; cancelledCount: number };
  pendingEvents: number;
  failedEvents: number;
}

const minutesBetween = (from: string, to: number) => Math.max(0, Math.floor((to - Date.parse(from)) / 60_000));

const inKitchen = (s: PosItemStatus) => s === "new" || s === "preparing" || s === "ready";

export function summarizeOperations(snapshot: PosSnapshot, now = new Date(snapshot.serverTime)): OperationsSummary {
  const t = now.getTime();
  const lateMinutes = snapshot.floor.kitchen.lateMinutes;
  const orders = snapshot.floor.orders.filter((o) => o.status !== "cancelled");
  const open = orders.filter((o) => o.status === "open");
  const activeTables = snapshot.floor.tables.filter((tb) => tb.active);

  const late: LateItemRow[] = [];
  const byStation: Record<PosStation, number> = { kitchen: 0, bar: 0, desserts: 0 };
  let newCount = 0;
  let preparingCount = 0;
  let readyCount = 0;
  const prep: number[] = [];
  for (const o of orders) {
    for (const i of o.items) {
      if (i.sentAt && i.readyAt) prep.push((Date.parse(i.readyAt) - Date.parse(i.sentAt)) / 60_000);
      if (!inKitchen(i.status)) continue;
      if (i.status === "new") newCount += i.quantity;
      if (i.status === "preparing") preparingCount += i.quantity;
      if (i.status === "ready") readyCount += i.quantity;
      if (i.status !== "ready") byStation[i.station] += i.quantity;
      const minutes = i.sentAt ? minutesBetween(i.sentAt, t) : 0;
      if (i.status !== "ready" && minutes >= lateMinutes) {
        late.push({
          orderNumber: o.number,
          tableName: o.tableName,
          name: i.variantLabel ? `${i.dishName} (${i.variantLabel})` : i.dishName,
          quantity: i.quantity,
          station: i.station,
          minutes,
          priority: o.priority,
        });
      }
    }
  }
  late.sort((a, b) => b.minutes - a.minutes);

  const openOrders: OpenOrderRow[] = open
    .map((o) => {
      const billable = o.items.filter((i) => i.status !== "cancelled");
      const sum = (st: PosItemStatus[]) => billable.filter((i) => st.includes(i.status)).reduce((n, i) => n + i.quantity, 0);
      return {
        id: o.id,
        number: o.number,
        tableName: o.tableName,
        guests: o.guests,
        waiterName: o.waiterName,
        minutesOpen: minutesBetween(o.openedAt, t),
        totalCents: billable.reduce((n, i) => n + i.unitPriceCents * i.quantity, 0),
        ready: sum(["ready"]),
        cooking: sum(["new", "preparing"]),
        held: sum(["held"]),
        priority: o.priority,
        late: late.some((l) => l.orderNumber === o.number),
      };
    })
    .sort((a, b) => b.minutesOpen - a.minutesOpen);

  const devices: DeviceRow[] = snapshot.devices.map((d) => ({
    deviceId: d.deviceId,
    code: d.status?.code ?? `C${d.number}`,
    name: d.status?.name ?? `Caja ${d.number}`,
    online: t - Date.parse(d.lastSeenAt) < DEVICE_ONLINE_MS,
    lastSeenAt: d.lastSeenAt,
    status: d.status,
  }));

  const soldOutMap = new Map<string, { dishId: string; name: string; devices: string[] }>();
  for (const d of devices) {
    for (const s of d.status?.soldOut ?? []) {
      const entry = soldOutMap.get(s.dishId) ?? { dishId: s.dishId, name: s.name, devices: [] };
      entry.devices.push(d.code);
      soldOutMap.set(s.dishId, entry);
    }
  }

  const reporting = devices.map((d) => d.status).filter((s): s is PosDeviceStatus => s !== null);
  return {
    tables: { total: activeTables.length, occupied: new Set(open.filter((o) => o.tableId).map((o) => o.tableId)).size },
    openOrders,
    openTotalCents: openOrders.reduce((n, o) => n + o.totalCents, 0),
    guests: open.reduce((n, o) => n + o.guests, 0),
    kitchen: {
      lateMinutes,
      newCount,
      preparingCount,
      readyCount,
      byStation,
      avgPrepMinutes: prep.length ? Math.round(prep.reduce((a, b) => a + b, 0) / prep.length) : null,
      late,
    },
    devices,
    soldOut: [...soldOutMap.values()].sort((a, b) => a.name.localeCompare(b.name, "es")),
    posToday: {
      salesCount: reporting.reduce((n, s) => n + s.today.salesCount, 0),
      salesCents: reporting.reduce((n, s) => n + s.today.salesCents, 0),
      cancelledCount: reporting.reduce((n, s) => n + s.today.cancelledCount, 0),
    },
    pendingEvents: reporting.reduce((n, s) => n + s.outbox.pending, 0),
    failedEvents: reporting.reduce((n, s) => n + s.outbox.failed, 0),
  };
}

/**
 * Deja solo las mesas y cuentas de una sucursal (undefined = todas, null = Principal). Los
 * dispositivos y el personal no se filtran: el POS no los asocia a una sucursal.
 */
export function filterSnapshotByBranch(snapshot: PosSnapshot, branch: string | null | undefined): PosSnapshot {
  if (branch === undefined) return snapshot;
  const keep = (x: { branchId?: string | null }) => (x.branchId ?? null) === branch;
  return { ...snapshot, floor: { ...snapshot.floor, tables: snapshot.floor.tables.filter(keep), orders: snapshot.floor.orders.filter(keep) } };
}
