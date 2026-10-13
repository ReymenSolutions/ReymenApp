// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const { POST } = await import("./route");

let eventCounter = 0;
// El POS siempre manda x-reymen-event-id (el endpoint lo exige); las pruebas que no lo prueban reciben uno único.
function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/pos/orders", {
    method: "POST",
    headers: { "x-reymen-event-id": `test-evt-${Date.now()}-${++eventCounter}`, ...headers },
    body,
  });
}

function signed(body: string, secret: string, timestamp = Date.now().toString()) {
  return {
    "x-reymen-signature": createWebhookSignature(body, secret, timestamp),
    "x-reymen-timestamp": timestamp,
  };
}

describe("POST /api/webhooks/pos/orders", () => {
  let org: { id: string; n8nWebhookSecret: string };
  let variantId: string;

  beforeAll(async () => {
    org = await createTestOrg("Webhook Pos Orders Org");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REYMEN_POS", status: "ACTIVE", source: "SUBSCRIBED" } });
    const dish = await prisma.foodDish.create({
      data: { organizationId: org.id, name: "Taco", variants: { create: [{ organizationId: org.id, label: "Único", price: 25 }] } },
      include: { variants: true },
    });
    variantId = dish.variants[0].id;
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("accepts a signed order and accumulates the day's dish sale", async () => {
    const body = JSON.stringify({ grossAmount: 25, netAmount: 22, items: [{ variantId, quantity: 1 }] });
    const res = await POST(makeRequest(body, { ...signed(body, org.n8nWebhookSecret), "x-reymen-orgid": org.id }));
    expect(res.status).toBe(200);

    const sale = await prisma.foodDishSale.findFirst({ where: { variantId } });
    expect(sale?.quantity).toBe(1);
  });

  it("rejects a request signed with the wrong secret", async () => {
    const body = JSON.stringify({ grossAmount: 25, netAmount: 22, items: [{ variantId, quantity: 1 }] });
    const res = await POST(makeRequest(body, { ...signed(body, "wrong-secret"), "x-reymen-orgid": org.id }));
    expect(res.status).toBe(401);
  });

  it("returns 422 when the order references a variant from another organization", async () => {
    const otherOrg = await createTestOrg("Webhook Pos Orders Other Org");
    const otherDish = await prisma.foodDish.create({
      data: { organizationId: otherOrg.id, name: "Burrito", variants: { create: [{ organizationId: otherOrg.id, label: "Único", price: 30 }] } },
      include: { variants: true },
    });

    const body = JSON.stringify({ grossAmount: 30, netAmount: 27, items: [{ variantId: otherDish.variants[0].id, quantity: 1 }] });
    const res = await POST(makeRequest(body, { ...signed(body, org.n8nWebhookSecret), "x-reymen-orgid": org.id }));
    expect(res.status).toBe(422);

    await cleanupOrg(otherOrg.id);
  });

  it("idempotency: resending the same order event id does not double-count the sale", async () => {
    const body = JSON.stringify({ grossAmount: 25, netAmount: 22, items: [{ variantId, quantity: 4 }] });
    const eventId = "pos-order-idempotent-1";
    const countBefore = await prisma.foodSale.count({ where: { organizationId: org.id } });

    const first = await POST(
      makeRequest(body, { ...signed(body, org.n8nWebhookSecret), "x-reymen-orgid": org.id, "x-reymen-event-id": eventId })
    );
    expect(first.status).toBe(200);

    const second = await POST(
      makeRequest(body, { ...signed(body, org.n8nWebhookSecret), "x-reymen-orgid": org.id, "x-reymen-event-id": eventId })
    );
    expect(second.status).toBe(200);
    expect((await second.json()).duplicate).toBe(true);

    const countAfter = await prisma.foodSale.count({ where: { organizationId: org.id } });
    // Solo la primera entrega debió crear un FoodSale -- la reentrega se descarta antes de llegar a processFoodPosOrder.
    expect(countAfter - countBefore).toBe(1);
  });

  it("a negative quantity cancels out a prior order for the same variant/day", async () => {
    const before = await prisma.foodDishSale.findFirst({ where: { variantId } });
    const quantityBefore = before?.quantity ?? 0;

    const orderBody = JSON.stringify({ grossAmount: 50, netAmount: 43.1, items: [{ variantId, quantity: 2 }] });
    const orderRes = await POST(makeRequest(orderBody, { ...signed(orderBody, org.n8nWebhookSecret), "x-reymen-orgid": org.id }));
    expect(orderRes.status).toBe(200);

    const cancelBody = JSON.stringify({ grossAmount: -50, netAmount: -43.1, items: [{ variantId, quantity: -2 }] });
    const cancelRes = await POST(makeRequest(cancelBody, { ...signed(cancelBody, org.n8nWebhookSecret), "x-reymen-orgid": org.id }));
    expect(cancelRes.status).toBe(200);

    const after = await prisma.foodDishSale.findFirst({ where: { variantId } });
    expect(after?.quantity).toBe(quantityBefore);
  });

  it("records a modifier option sale when items include an optional modifiers array", async () => {
    const group = await prisma.foodModifierGroup.create({
      data: { organizationId: org.id, name: "Extras (webhook test)", options: { create: [{ name: "Extra queso", priceDelta: 15 }] } },
      include: { options: true },
    });
    const optionId = group.options[0].id;

    const body = JSON.stringify({
      grossAmount: 40,
      netAmount: 34.5,
      items: [{ variantId, quantity: 1, modifiers: [{ optionId, quantity: 1 }] }],
    });
    const res = await POST(makeRequest(body, { ...signed(body, org.n8nWebhookSecret), "x-reymen-orgid": org.id }));
    expect(res.status).toBe(200);

    const modSale = await prisma.foodModifierOptionSale.findFirst({ where: { optionId } });
    expect(modSale?.quantity).toBe(1);
    expect(modSale?.optionName).toBe("Extra queso");
  });

  it("CRITICAL: without the Reymen POS module the sale is refused but not lost — the same event id goes through once it's enabled", async () => {
    await prisma.organizationModule.updateMany({ where: { organizationId: org.id, module: "REYMEN_POS" }, data: { status: "SUSPENDED" } });
    const body = JSON.stringify({ grossAmount: 25, netAmount: 22, items: [{ variantId, quantity: 1 }] });
    const eventId = "pos-order-module-off-1";
    const salesBefore = await prisma.foodSale.count({ where: { organizationId: org.id } });

    const refused = await POST(
      makeRequest(body, { ...signed(body, org.n8nWebhookSecret), "x-reymen-orgid": org.id, "x-reymen-event-id": eventId })
    );
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe("pos_module_disabled");
    expect(await prisma.foodSale.count({ where: { organizationId: org.id } })).toBe(salesBefore);
    expect(await prisma.webhookEvent.count({ where: { organizationId: org.id, externalEventId: eventId } })).toBe(0);

    await prisma.organizationModule.updateMany({ where: { organizationId: org.id, module: "REYMEN_POS" }, data: { status: "ACTIVE" } });
    const retried = await POST(
      makeRequest(body, { ...signed(body, org.n8nWebhookSecret), "x-reymen-orgid": org.id, "x-reymen-event-id": eventId })
    );
    expect(retried.status).toBe(200);
    expect((await retried.json()).duplicate).toBeUndefined();
    expect(await prisma.foodSale.count({ where: { organizationId: org.id } })).toBe(salesBefore + 1);
    expect((await prisma.foodSale.findFirst({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" } }))?.source).toBe("POS");
  });
});
