// @vitest-environment node
// Lealtad ↔ Reymen POS de punta a punta, por las mismas rutas firmadas que usa el POS.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { enrollMember, saveProgram } from "./service";
import { saveLocation, listLocations } from "./locations";
import { getLoyaltyAnalytics } from "./queries";
import { resolvePeriod } from "./period";
import { DEMO_ANCHOR } from "./postal-zones";

const { POST: orders } = await import("@/app/api/webhooks/pos/orders/route");
const { POST: lookup } = await import("@/app/api/webhooks/pos/loyalty/route");

type Org = Awaited<ReturnType<typeof createTestOrg>>;

function req(url: string, org: Org, body: unknown, extra: Record<string, string> = {}) {
  const raw = JSON.stringify(body);
  const ts = Date.now().toString();
  return new NextRequest(url, {
    method: "POST",
    headers: { "x-reymen-signature": createWebhookSignature(raw, org.n8nWebhookSecret, ts), "x-reymen-timestamp": ts, "x-reymen-orgid": org.id, ...extra },
    body: raw,
  });
}
let eventSeq = 0;
const order = (org: Org, body: Record<string, unknown>, eventId = `evt-${Date.now()}-${eventSeq++}`) =>
  orders(req("http://localhost/api/webhooks/pos/orders", org, body, { "x-reymen-event-id": eventId }));
const ask = (org: Org, body: unknown) => lookup(req("http://localhost/api/webhooks/pos/loyalty", org, body));

const GOAL = 3;
const T0 = new Date("2026-10-01T15:00:00.000Z").getTime();
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

async function setup(prefix: string, modules: ("FOOD_OPS" | "REYMEN_POS" | "LOYALTY")[] = ["FOOD_OPS", "REYMEN_POS", "LOYALTY"]) {
  const org = await createTestOrg(prefix);
  for (const mod of modules) await prisma.organizationModule.create({ data: { organizationId: org.id, module: mod, status: "ACTIVE", source: "SUBSCRIBED" } });
  const owner = await createTestUser(org.id, "OWNER", `${prefix.toLowerCase().replace(/\W/g, "")}-owner`);
  const dish = await prisma.foodDish.create({
    data: { organizationId: org.id, name: "Latte", variants: { create: [{ organizationId: org.id, label: "12 oz", price: 85 }] } },
    include: { variants: true },
  });
  if (modules.includes("LOYALTY")) {
    await saveProgram(org.id, owner.id, {
      name: "Club POS", description: null, status: "ACTIVE", visitGoal: GOAL, rewardType: "FREE_ITEM", rewardName: "Bebida gratis",
      rewardDescription: "Hasta 16 oz", rewardHeadline: null, scope: "ORGANIZATION", branchId: null,
    });
  }
  return { org, owner, variantId: dish.variants[0].id };
}

async function enroll(org: Org, phone: string, cp = "64610") {
  const r = await enrollMember(org.slug, { name: "Mariana López", whatsapp: phone, postalCode: cp, email: null, branchId: null, consent: true });
  if (r.status !== "created") throw new Error("expected created");
  const member = await prisma.loyaltyMember.findUniqueOrThrow({ where: { publicToken: r.token } });
  return { token: r.token, member, cardUrl: `https://app.reymen.mx/lealtad/${org.slug}/tarjeta/${r.token}` };
}

describe("Lealtad ↔ Reymen POS", () => {
  let A: Awaited<ReturnType<typeof setup>>;
  let B: Awaited<ReturnType<typeof setup>>;
  let mariana: Awaited<ReturnType<typeof enroll>>;

  beforeAll(async () => {
    A = await setup("Loyalty POS A");
    B = await setup("Loyalty POS B");
    mariana = await enroll(A.org, "81 5551 0001");
  });
  afterAll(async () => {
    await cleanupOrg(A.org.id);
    await cleanupOrg(B.org.id);
  });

  const sale = (orderId: string, minute: number, loyalty?: Record<string, unknown>, amount = 185) => ({
    orderId, occurredAt: at(minute), grossAmount: amount, netAmount: Math.round((amount / 1.16) * 100) / 100,
    items: [{ variantId: A.variantId, quantity: 1 }], ...(loyalty ? { loyalty } : {}),
  });

  describe("consulta en caja", () => {
    it("identifica por el QR de la tarjeta sin devolver datos de contacto completos", async () => {
      const res = await ask(A.org, { code: mariana.cardUrl });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ status: "found", program: { name: "Club POS", visitGoal: GOAL }, member: { firstName: "Mariana", progress: { current: 0, goal: GOAL } } });
      expect(JSON.stringify(json)).not.toContain("55510001");
      expect(json.member.maskedPhone).toContain("0001");
    });

    it("identifica por WhatsApp; un teléfono no inscrito no es miembro", async () => {
      expect((await (await ask(A.org, { phone: "+52 81 5551 0001" })).json()).status).toBe("found");
      expect((await (await ask(A.org, { phone: "81 0000 0000" })).json()).status).toBe("not_enrolled");
      expect((await ask(A.org, {})).status).toBe(400);
    });

    it("aislamiento: la tarjeta de un negocio no existe en otro, y la firma de otro negocio no entra", async () => {
      expect((await (await ask(B.org, { code: mariana.cardUrl })).json()).status).toBe("not_enrolled");
      const forged = new NextRequest("http://localhost/api/webhooks/pos/loyalty", {
        method: "POST",
        headers: { ...Object.fromEntries(req("http://x", B.org, { code: mariana.token }).headers), "x-reymen-orgid": A.org.id },
        body: JSON.stringify({ code: mariana.token }),
      });
      expect((await lookup(forged)).status).toBe(401);
    });

    it("sin el módulo de Lealtad responde 403 con un código propio", async () => {
      const C = await setup("Loyalty POS C", ["FOOD_OPS", "REYMEN_POS"]);
      try {
        const res = await ask(C.org, { code: mariana.token });
        expect(res.status).toBe(403);
        expect((await res.json()).code).toBe("loyalty_module_disabled");
      } finally {
        await cleanupOrg(C.org.id);
      }
    });
  });

  describe("orden con cliente de lealtad", () => {
    it("registra la visita ligada a la venta, con el monto real del ticket", async () => {
      const res = await order(A.org, sale("ORD-1", 0, { code: mariana.cardUrl }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.loyalty).toMatchObject({ status: "visit_registered", member: { progress: { current: 1, goal: GOAL } }, rewardUnlocked: null });
      const s = await prisma.foodSale.findFirstOrThrow({ where: { organizationId: A.org.id, externalOrderId: "ORD-1" } });
      const v = await prisma.loyaltyVisit.findFirstOrThrow({ where: { memberId: mariana.member.id } });
      expect(v).toMatchObject({ saleId: s.id, idempotencyKey: "pos:ORD-1", employeeUserId: null, status: "CONFIRMED" });
      expect(Number(v.saleAmount)).toBe(185);
    });

    it("un reenvío no cuenta doble: ni con el mismo evento ni con la misma orden", async () => {
      const dup = await order(A.org, sale("ORD-1", 0, { code: mariana.cardUrl }), "same-event");
      await order(A.org, sale("ORD-1", 0, { code: mariana.cardUrl }), "same-event");
      expect((await dup.json()).loyalty.status).toBe("already_registered");
      expect(await prisma.loyaltyVisit.count({ where: { memberId: mariana.member.id } })).toBe(1);
    });

    it("dos órdenes seguidas del mismo cliente: la venta se guarda pero la visita no se repite", async () => {
      const res = await order(A.org, sale("ORD-2", 1, { code: mariana.token }, 40));
      expect(res.status).toBe(200);
      expect((await res.json()).loyalty).toEqual({ status: "not_counted", reason: "cooldown" });
      expect(await prisma.foodSale.count({ where: { organizationId: A.org.id, externalOrderId: "ORD-2" } })).toBe(1);
    });

    it("un teléfono no inscrito no suma visitas y la venta se guarda igual", async () => {
      const res = await order(A.org, sale("ORD-3", 2, { phone: "81 9999 0000" }));
      expect((await res.json()).loyalty).toEqual({ status: "not_counted", reason: "not_enrolled" });
      expect(await prisma.foodSale.count({ where: { organizationId: A.org.id, externalOrderId: "ORD-3" } })).toBe(1);
    });

    it("al llegar a la meta desbloquea la recompensa y el POS la canjea una sola vez", async () => {
      await order(A.org, sale("ORD-4", 20, { code: mariana.token }));
      const res = await order(A.org, sale("ORD-5", 40, { phone: "8155510001" }));
      const third = (await res.json()).loyalty;
      expect(third.rewardUnlocked).toMatchObject({ name: "Bebida gratis" });
      expect(third.member.progress.current).toBe(0);
      expect(third.member.rewardsAvailable).toHaveLength(1);
      const rewardId = third.rewardUnlocked.id;

      const redeem = (await (await order(A.org, sale("ORD-6", 60, { code: mariana.token, redeemRewardId: rewardId }, 20))).json()).loyalty;
      expect(redeem).toMatchObject({ status: "visit_registered", redeemed: { id: rewardId }, redeemError: null });
      const again = (await (await order(A.org, sale("ORD-7", 80, { code: mariana.token, redeemRewardId: rewardId }))).json()).loyalty;
      expect(again).toMatchObject({ redeemed: null, redeemError: "reward_not_available" });
      const r = await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: rewardId } });
      expect(r.status).toBe("REDEEMED");
      expect(r.redeemedById).toBeNull();
    });

    it("no se puede canjear la recompensa de otro cliente", async () => {
      const other = await enroll(A.org, "81 5551 0002");
      const reward = await prisma.loyaltyReward.findFirstOrThrow({ where: { memberId: mariana.member.id } });
      const res = (await (await order(A.org, sale("ORD-8", 200, { code: other.token, redeemRewardId: reward.id }))).json()).loyalty;
      expect(res.redeemError).toBe("reward_not_available");
    });
  });

  describe("cancelaciones en el POS", () => {
    const cancel = (orderId: string, minute: number, amount = 185) => ({
      orderId, occurredAt: at(minute), grossAmount: -amount, netAmount: -Math.round((amount / 1.16) * 100) / 100,
      items: [{ variantId: A.variantId, quantity: -1 }],
    });

    it("anula la visita (sin borrarla) y quita una del ciclo y de los totales", async () => {
      const p = await enroll(A.org, "81 5551 0003");
      await order(A.org, sale("CX-1", 300, { code: p.token }));
      const before = await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: p.member.id } });
      expect(before.cycleVisits).toBe(1);
      const res = await order(A.org, cancel("CX-1", 310));
      expect((await res.json()).loyalty).toEqual({ status: "visit_voided", rewardVoided: false, needsReview: false });
      const after = await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: p.member.id } });
      expect(after).toMatchObject({ cycleVisits: 0, totalVisits: 0, visitsWithAmount: 0 });
      expect(Number(after.totalSpent)).toBe(0);
      expect((await prisma.loyaltyVisit.findFirstOrThrow({ where: { memberId: p.member.id } })).status).toBe("VOIDED");
    });

    it("si la venta cancelada desbloqueó una recompensa sin canjear, la recompensa se anula y queda a una visita", async () => {
      const p = await enroll(A.org, "81 5551 0004");
      for (let i = 0; i < GOAL; i++) await order(A.org, sale(`RW-${i}`, 400 + i * 10, { code: p.token }));
      const reward = await prisma.loyaltyReward.findFirstOrThrow({ where: { memberId: p.member.id } });
      const res = await order(A.org, cancel(`RW-${GOAL - 1}`, 500));
      expect((await res.json()).loyalty).toMatchObject({ status: "visit_voided", rewardVoided: true });
      expect((await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: reward.id } })).status).toBe("VOIDED");
      const m = await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: p.member.id } });
      expect(m.cycleVisits).toBe(GOAL - 1);
      // La siguiente visita vuelve a completar la meta y emite una recompensa nueva (sin chocar con la anulada).
      const next = (await (await order(A.org, sale("RW-again", 520, { code: p.token }))).json()).loyalty;
      expect(next.rewardUnlocked).not.toBeNull();
      expect(await prisma.loyaltyReward.count({ where: { memberId: p.member.id, status: "AVAILABLE" } })).toBe(1);
    });

    it("si la recompensa ya se canjeó, solo se anula la visita y queda para revisión", async () => {
      const reward = await prisma.loyaltyReward.findFirstOrThrow({ where: { memberId: mariana.member.id, status: "REDEEMED" } });
      const earned = await prisma.loyaltyVisit.findUniqueOrThrow({ where: { id: reward.earnedVisitId! }, include: { sale: true } });
      const res = await order(A.org, cancel(earned.sale!.externalOrderId!, 600));
      expect((await res.json()).loyalty).toMatchObject({ status: "visit_voided", rewardVoided: false, needsReview: true });
      expect((await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: reward.id } })).status).toBe("REDEEMED");
    });
  });

  describe("ubicación de las sucursales", () => {
    it("guarda CP y pin; nunca una sucursal de otro negocio", async () => {
      const otherBranch = await prisma.branch.create({ data: { organizationId: B.org.id, name: "Ajena" } });
      await expect(saveLocation(A.org.id, A.owner.id, { branchKey: otherBranch.id, postalCode: "64610", lat: 25.7, lng: -100.4 })).rejects.toThrow();
      await expect(saveLocation(A.org.id, A.owner.id, { branchKey: "main", postalCode: "646", lat: 25.7, lng: -100.4 })).rejects.toThrow();
      await expect(saveLocation(A.org.id, A.owner.id, { branchKey: "main", postalCode: "64610", lat: 120, lng: -100.4 })).rejects.toThrow();
      await saveLocation(A.org.id, A.owner.id, { branchKey: "main", postalCode: "64 610", lat: DEMO_ANCHOR.lat, lng: DEMO_ANCHOR.lng });
      const list = await listLocations(A.org.id, "A", []);
      expect(list).toEqual([{ key: "main", branchId: null, label: "A", postalCode: "64610", point: DEMO_ANCHOR }]);
    });

    it("las distancias de las zonas se miden desde la ubicación guardada", async () => {
      const program = await prisma.loyaltyProgram.findFirstOrThrow({ where: { organizationId: A.org.id } });
      const period = resolvePeriod({ p: "custom", from: "2026-09-01", to: "2026-10-31" }, "America/Mexico_City");
      const a = await getLoyaltyAnalytics({ organizationId: A.org.id, programId: program.id, goal: GOAL, period, branch: undefined, timezone: "America/Mexico_City" });
      const z = a.zones.zones.find((x) => x.postalCode === "64610")!;
      expect(z.distanceKm).toBeCloseTo(0.8, 1);
      const none = await getLoyaltyAnalytics({ organizationId: B.org.id, programId: (await prisma.loyaltyProgram.findFirstOrThrow({ where: { organizationId: B.org.id } })).id, goal: GOAL, period, branch: undefined, timezone: "America/Mexico_City" });
      expect(none.zones.zones.every((x) => x.distanceKm === null)).toBe(true);
    });
  });
});
