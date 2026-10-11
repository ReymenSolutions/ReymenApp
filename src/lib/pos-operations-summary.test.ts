import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filterSnapshotByBranch, summarizeOperations, type PosDeviceStatus, type PosOrder, type PosSnapshot } from "./pos-operations-summary";
import { fetchPosSnapshot, posOpsSignature } from "./pos-operations";

const NOW = "2026-10-02T20:00:00.000Z";
const minAgo = (m: number) => new Date(Date.parse(NOW) - m * 60_000).toISOString();

function order(id: string, extra: Partial<PosOrder> = {}): PosOrder {
  return {
    id,
    number: 1,
    tableId: "t1",
    tableName: "Mesa 1",
    guests: 2,
    status: "open",
    priority: false,
    openedAt: minAgo(40),
    waiterName: "Ana",
    closedAt: null,
    items: [],
    ...extra,
  };
}

const item = (status: PosOrder["items"][number]["status"], sentMin: number | null, extra: Partial<PosOrder["items"][number]> = {}) => ({
  id: Math.random().toString(36).slice(2),
  dishName: "Tacos",
  variantLabel: "",
  quantity: 1,
  unitPriceCents: 10000,
  note: "",
  course: 1,
  station: "kitchen" as const,
  status,
  sentAt: sentMin === null ? null : minAgo(sentMin),
  readyAt: null,
  ...extra,
});

const device = (extra: Partial<PosDeviceStatus> = {}): PosDeviceStatus => ({
  code: "C1",
  name: "Caja 1",
  employeeName: "Ana",
  kitchenMode: false,
  cash: null,
  today: { salesCount: 3, salesCents: 45000, cancelledCount: 1 },
  outbox: { pending: 2, failed: 0, lastError: null },
  soldOut: [{ dishId: "d1", name: "Flan" }],
  lastPrintAt: null,
  menuCheckedAt: null,
  ...extra,
});

function snapshot(): PosSnapshot {
  return {
    serverTime: NOW,
    floor: {
      tables: [
        { id: "t1", name: "Mesa 1", area: "", seats: 4, active: true },
        { id: "t2", name: "Mesa 2", area: "", seats: 4, active: true },
        { id: "t3", name: "Mesa 3", area: "", seats: 4, active: false },
      ],
      kitchen: { lateMinutes: 15 },
      orders: [
        order("o1", {
          priority: true,
          items: [
            item("new", 20), // late
            item("preparing", 5, { station: "bar", quantity: 2 }),
            item("ready", 30, { readyAt: minAgo(18) }), // ready: never late; prep 12 min
            item("held", null, { course: 2 }),
            item("cancelled", 10),
          ],
        }),
        order("o2", { number: 2, tableId: null, tableName: "Mostrador C1-000010", status: "paid", items: [item("preparing", 16, { station: "desserts" })] }),
        order("o3", { number: 3, tableId: "t2", status: "cancelled", items: [item("new", 50)] }),
      ],
    },
    devices: [
      { deviceId: "a", number: 1, lastSeenAt: minAgo(0.5), statusAt: minAgo(0.5), status: device() },
      { deviceId: "b", number: 2, lastSeenAt: minAgo(10), statusAt: null, status: device({ code: "C2", name: "Caja 2", soldOut: [{ dishId: "d1", name: "Flan" }], outbox: { pending: 0, failed: 1, lastError: "x" } }) },
      { deviceId: "c", number: 3, lastSeenAt: minAgo(1), statusAt: null, status: null },
    ],
    staffCount: 4,
  };
}

describe("summarizeOperations", () => {
  const s = summarizeOperations(snapshot());

  it("counts tables, open checks and what is still to be charged", () => {
    expect(s.tables).toEqual({ total: 2, occupied: 1 });
    expect(s.openOrders).toHaveLength(1);
    expect(s.openOrders[0]).toMatchObject({ number: 1, minutesOpen: 40, totalCents: 50000, ready: 1, cooking: 3, held: 1, priority: true, late: true });
    expect(s.openTotalCents).toBe(50000);
    expect(s.guests).toBe(2);
  });

  it("finds late items (paid counter orders included, cancelled orders and ready items excluded)", () => {
    expect(s.kitchen.late.map((l) => [l.tableName, l.minutes, l.station])).toEqual([
      ["Mesa 1", 20, "kitchen"],
      ["Mostrador C1-000010", 16, "desserts"],
    ]);
    expect(s.kitchen).toMatchObject({ newCount: 1, preparingCount: 3, readyCount: 1, byStation: { kitchen: 1, bar: 2, desserts: 1 }, avgPrepMinutes: 12 });
  });

  it("reports registers, sold-out marks and pending events across devices", () => {
    expect(s.devices.map((d) => [d.code, d.online])).toEqual([
      ["C1", true],
      ["C2", false],
      ["C3", true],
    ]);
    expect(s.soldOut).toEqual([{ dishId: "d1", name: "Flan", devices: ["C1", "C2"] }]);
    expect(s.posToday).toEqual({ salesCount: 6, salesCents: 90000, cancelledCount: 2 });
    expect(s).toMatchObject({ pendingEvents: 2, failedEvents: 1 });
  });
});

describe("fetchPosSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("signs exactly like the POS verifies it: HMAC of '<timestamp>.<orgId>.ops-snapshot'", async () => {
    vi.stubEnv("REYMEN_POS_URL", "https://pos.example.test/");
    let seen: { url: string; headers: Headers } | null = null;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen = { url, headers: new Headers(init.headers) };
      return Response.json(snapshot());
    });
    const result = await fetchPosSnapshot("org1", "llave");
    expect(result.kind).toBe("ok");
    const { url, headers } = seen!;
    expect(url).toBe("https://pos.example.test/api/ops/snapshot");
    const ts = headers.get("x-reymen-timestamp")!;
    const expected = createHmac("sha256", "llave").update(`${ts}.org1.ops-snapshot`).digest("hex");
    expect(headers.get("x-reymen-signature")).toBe(`sha256=${expected}`);
    expect(posOpsSignature("llave", "org1", ts)).toBe(expected);
    expect(headers.get("x-reymen-orgid")).toBe("org1");
  });

  it("tells apart a rejected key from an unreachable server", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
    expect((await fetchPosSnapshot("org1", "k")).kind).toBe("unauthorized");
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await fetchPosSnapshot("org1", "k")).toMatchObject({ kind: "unreachable" });
    vi.stubGlobal("fetch", async () => Response.json({ nope: true }));
    expect((await fetchPosSnapshot("org1", "k")).kind).toBe("unreachable");
  });
});

describe("filterSnapshotByBranch", () => {
  const snapshot = (): PosSnapshot => ({
    serverTime: NOW,
    floor: {
      tables: [
        { id: "t1", name: "Mesa 1", area: "", seats: 4, active: true },
        { id: "t2", name: "Mesa 2", area: "", seats: 4, active: true, branchId: "centro" },
      ],
      orders: [order("a", { items: [item("preparing", 5)] }), order("b", { branchId: "centro", items: [item("ready", 20)] }), order("c", { branchId: null })],
      kitchen: { lateMinutes: 15 },
    },
    devices: [],
    staffCount: 2,
  });

  it("sin filtro deja todo; null = Principal (incluye lo anterior a las sucursales); un id = esa sucursal", () => {
    expect(filterSnapshotByBranch(snapshot(), undefined).floor.orders).toHaveLength(3);
    expect(filterSnapshotByBranch(snapshot(), null).floor.orders.map((o) => o.id)).toEqual(["a", "c"]);
    expect(filterSnapshotByBranch(snapshot(), null).floor.tables.map((t) => t.id)).toEqual(["t1"]);
    expect(filterSnapshotByBranch(snapshot(), "centro").floor.orders.map((o) => o.id)).toEqual(["b"]);
    expect(filterSnapshotByBranch(snapshot(), "otra").floor.orders).toEqual([]);
  });

  it("el resumen de operaciones cuenta solo la sucursal elegida", () => {
    const centro = summarizeOperations(filterSnapshotByBranch(snapshot(), "centro"));
    expect(centro.kitchen.readyCount).toBe(1);
    expect(centro.openOrders).toHaveLength(1);
    const principal = summarizeOperations(filterSnapshotByBranch(snapshot(), null));
    expect(principal.kitchen.readyCount).toBe(0);
    expect(principal.kitchen.preparingCount).toBe(1);
  });
});
