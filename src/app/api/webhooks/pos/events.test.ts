// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const kitchen = await import("./kitchen/route");
const shifts = await import("./shifts/route");

function call(route: { POST: (r: NextRequest) => Promise<Response> }, path: string, org: { id: string; n8nWebhookSecret: string }, payload: unknown, opts: { eventId?: string; secret?: string } = {}) {
  const body = JSON.stringify(payload);
  const ts = Date.now().toString();
  return route.POST(
    new NextRequest(`http://localhost/api/webhooks/pos/${path}`, {
      method: "POST",
      headers: {
        "x-reymen-orgid": org.id,
        "x-reymen-timestamp": ts,
        "x-reymen-signature": createWebhookSignature(body, opts.secret ?? org.n8nWebhookSecret, ts),
        ...(opts.eventId ? { "x-reymen-event-id": opts.eventId } : {}),
      },
      body,
    }),
  );
}

const T0 = "2026-10-12T20:00:00.000Z";
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

describe("eventos del POS: cocina y cierres de turno", () => {
  let org: { id: string; n8nWebhookSecret: string };
  let off: { id: string; n8nWebhookSecret: string };
  let branch: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Pos Events Org");
    off = await createTestOrg("Pos Events Off Org");
    for (const m of ["FOOD_OPS", "REYMEN_POS"] as const) await prisma.organizationModule.create({ data: { organizationId: org.id, module: m, status: "ACTIVE", source: "SUBSCRIBED" } });
    branch = await prisma.branch.create({ data: { organizationId: org.id, name: "Centro" } });
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(off.id);
  });

  const ready = (extra: Record<string, unknown> = {}) => ({
    orderId: "o1",
    orderNumber: 12,
    tableName: "Mesa 4",
    branchId: branch.id,
    deviceCode: "C1",
    items: [
      { itemId: "i1", name: "Café americano", quantity: 2, station: "bar", sentAt: at(0), readyAt: at(4) },
      { itemId: "i2", name: "Pan dulce", quantity: 1, station: "kitchen", sentAt: at(0), readyAt: at(9) },
    ],
    ...extra,
  });

  it("guarda un renglón por producto listo, con su tiempo de preparación y su sucursal", async () => {
    const res = await call(kitchen, "kitchen", org, ready(), { eventId: "kr-1" });
    expect(res.status).toBe(200);
    const rows = await prisma.foodKitchenTicket.findMany({ where: { organizationId: org.id }, orderBy: { prepSeconds: "asc" } });
    expect(rows.map((r) => [r.itemName, r.prepSeconds, r.station, r.branchId])).toEqual([
      ["Café americano", 240, "bar", branch.id],
      ["Pan dulce", 540, "kitchen", branch.id],
    ]);
    expect(rows[0]).toMatchObject({ orderNumber: 12, tableName: "Mesa 4", externalOrderId: "o1", deviceCode: "C1", quantity: 2 });
  });

  it("reenviar no duplica (mismo evento o mismo producto)", async () => {
    expect(((await (await call(kitchen, "kitchen", org, ready(), { eventId: "kr-1" })).json()) as { duplicate?: boolean }).duplicate).toBe(true);
    await call(kitchen, "kitchen", org, ready(), { eventId: "kr-1b" }); // otro envío del mismo producto: se actualiza, no se duplica
    expect(await prisma.foodKitchenTicket.count({ where: { organizationId: org.id } })).toBe(2);
  });

  it("una sucursal ajena o desconocida cae en la Principal", async () => {
    await call(kitchen, "kitchen", org, ready({ branchId: "no-existe", items: [{ itemId: "i3", name: "Té", quantity: 1, station: "bar", sentAt: at(0), readyAt: at(2) }] }), { eventId: "kr-2" });
    expect((await prisma.foodKitchenTicket.findFirstOrThrow({ where: { organizationId: org.id, externalItemId: "i3" } })).branchId).toBeNull();
  });

  it("rechaza datos inválidos con 422 y no guarda nada", async () => {
    const bad = [
      ready({ items: [] }),
      ready({ tableName: "" }),
      ready({ items: [{ itemId: "x", name: "A", quantity: 0, station: "bar", sentAt: at(0), readyAt: at(1) }] }),
      ready({ items: [{ itemId: "x", name: "A", quantity: 1, station: "otra", sentAt: at(0), readyAt: at(1) }] }),
      ready({ items: [{ itemId: "x", name: "A", quantity: 1, station: "bar", sentAt: at(5), readyAt: at(1) }] }), // listo antes de enviarse
      ready({ items: [{ itemId: "x", name: "A", quantity: 1, station: "bar", sentAt: at(0), readyAt: at(60 * 48) }] }), // 2 días
    ];
    for (const [i, payload] of bad.entries()) expect((await call(kitchen, "kitchen", org, payload, { eventId: `bad-${i}` })).status).toBe(422);
    expect(await prisma.foodKitchenTicket.count({ where: { organizationId: org.id, externalItemId: "x" } })).toBe(0);
  });

  const shift = (extra: Record<string, unknown> = {}) => ({
    sessionId: "s1",
    number: 3,
    deviceCode: "C1",
    branchId: branch.id,
    openedAt: at(0),
    closedAt: at(480),
    openedByName: "Ana",
    closedByName: "Beto",
    openingFloat: 500,
    expected: 3250.5,
    counted: 3200,
    difference: 999, // el POS manda algo inconsistente: la app lo recalcula
    salesTotal: 4100.25,
    salesCount: 31,
    tips: 210,
    cancelledTotal: 116,
    cancelledCount: 1,
    notes: "Faltaron 50 pesos",
    ...extra,
  });

  it("guarda el cierre de turno y recalcula la diferencia (contado − esperado)", async () => {
    const res = await call(shifts, "shifts", org, shift(), { eventId: "sc-1" });
    expect(res.status).toBe(200);
    const row = await prisma.foodShiftClose.findFirstOrThrow({ where: { organizationId: org.id, externalSessionId: "s1" } });
    expect(Number(row.difference)).toBe(-50.5);
    expect(row).toMatchObject({ shiftNumber: 3, salesCount: 31, closedByName: "Beto", branchId: branch.id, deviceCode: "C1", notes: "Faltaron 50 pesos" });
    expect(Number(row.salesTotal)).toBe(4100.25);
  });

  it("el mismo turno reenviado se actualiza, no se duplica", async () => {
    await call(shifts, "shifts", org, shift({ counted: 3250.5, notes: "Corregido" }), { eventId: "sc-2" });
    expect(await prisma.foodShiftClose.count({ where: { organizationId: org.id } })).toBe(1);
    const row = await prisma.foodShiftClose.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(Number(row.difference)).toBe(0);
    expect(row.notes).toBe("Corregido");
  });

  it("rechaza un cierre incompleto o con fechas imposibles", async () => {
    expect((await call(shifts, "shifts", org, shift({ sessionId: "s2", salesCount: undefined }), { eventId: "sc-3" })).status).toBe(422);
    expect((await call(shifts, "shifts", org, shift({ sessionId: "s2", closedAt: at(-10) }), { eventId: "sc-4" })).status).toBe(422);
  });

  it("firma inválida → 401; sin el módulo Reymen POS → 403 pos_module_disabled", async () => {
    expect((await call(kitchen, "kitchen", org, ready(), { secret: "otro" })).status).toBe(401);
    const res = await call(shifts, "shifts", off, shift({ sessionId: "s9" }), { eventId: "sc-9" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("pos_module_disabled");
    expect(await prisma.foodShiftClose.count({ where: { organizationId: off.id } })).toBe(0);
  });
});
