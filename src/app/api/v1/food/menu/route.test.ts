// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { GET } = await import("./route");

function makeRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

describe("GET /api/v1/food/menu", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Food Menu Route Org A");
    orgB = await createTestOrg("Food Menu Route Org B");
    await prisma.organizationModule.create({ data: { organizationId: orgA.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.foodDish.create({
      data: { organizationId: orgA.id, name: "Org A Secret Dish", variants: { create: [{ organizationId: orgA.id, label: "Único", price: 50 }] } },
    });
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("returns org A's menu when authenticated with org A's own n8nWebhookSecret (backward compat)", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.some((d: { name: string }) => d.name === "Org A Secret Dish")).toBe(true);
  });

  it("lists only the org's active branches (never another org's, never archived ones) and changes the ETag when they change", async () => {
    authMock.mockResolvedValue(null);
    const call = () => GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret }));
    const before = await call();
    expect((await before.json()).branches).toEqual([]);

    const centro = await prisma.branch.create({ data: { organizationId: orgA.id, name: "Centro" } });
    await prisma.branch.create({ data: { organizationId: orgA.id, name: "Vieja", isActive: false } });
    await prisma.branch.create({ data: { organizationId: orgB.id, name: "Ajena" } });
    const after = await call();
    expect((await after.json()).branches).toEqual([{ id: centro.id, name: "Centro" }]);
    expect(after.headers.get("etag")).not.toBe(before.headers.get("etag"));
  });

  it("with menu-per-branch on, ?branchId= returns that branch's menu; without it (or with a foreign id) the base menu", async () => {
    authMock.mockResolvedValue(null);
    const dish = await prisma.foodDish.findFirstOrThrow({ where: { organizationId: orgA.id, name: "Org A Secret Dish" }, include: { variants: true } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { organizationId: orgA.id, name: "Centro" } });
    await prisma.organization.update({ where: { id: orgA.id }, data: { menuPerBranch: true } });
    await prisma.branchVariantPrice.create({ data: { organizationId: orgA.id, branchId: branch.id, variantId: dish.variants[0].id, price: 77 } });
    const get = async (qs: string) => (await (await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}${qs}`, { "x-api-key": orgA.n8nWebhookSecret }))).json()).data;
    expect((await get(`&branchId=${branch.id}`)).find((d: { name: string }) => d.name === "Org A Secret Dish").variants[0].price).toBe(77);
    expect((await get("")).find((d: { name: string }) => d.name === "Org A Secret Dish").variants[0].price).toBe(50);
    expect((await get("&branchId=ajena")).find((d: { name: string }) => d.name === "Org A Secret Dish").variants[0].price).toBe(50);
    await prisma.organization.update({ where: { id: orgA.id }, data: { menuPerBranch: false } });
    expect((await get(`&branchId=${branch.id}`)).find((d: { name: string }) => d.name === "Org A Secret Dish").variants[0].price).toBe(50);
  });

  it("CRITICAL: rejects org B's secret used to read org A's menu", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": orgB.n8nWebhookSecret }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when FOOD_OPS isn't enabled for the org, even with a valid secret", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgB.id}`, { "x-api-key": orgB.n8nWebhookSecret }));
    expect(res.status).toBe(403);
  });

  it("accepts the separate foodPosReadKey once one has been generated", async () => {
    const readKey = "test-food-pos-read-key-12345";
    await prisma.organization.update({ where: { id: orgA.id }, data: { foodPosReadKey: readKey } });

    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": readKey }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.some((d: { name: string }) => d.name === "Org A Secret Dish")).toBe(true);
  });

  it("CRITICAL: org B cannot read org A's menu using org A's foodPosReadKey mismatched to org B's id", async () => {
    const readKey = "test-food-pos-read-key-mismatch";
    await prisma.organization.update({ where: { id: orgA.id }, data: { foodPosReadKey: readKey } });

    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgB.id}`, { "x-api-key": readKey }));
    expect(res.status).toBe(401);
  });

  it("rejects when foodPosReadKey is still null and the caller doesn't have the n8nWebhookSecret", async () => {
    await prisma.organization.update({ where: { id: orgB.id }, data: { foodPosReadKey: null } });
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgB.id}`, { "x-api-key": "some-guess" }));
    expect(res.status).toBe(401);
  });

  describe("ETag / meta.version", () => {
    it("returns an ETag header and the same value as meta.version", async () => {
      authMock.mockResolvedValue(null);
      const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret }));
      const etag = res.headers.get("etag");
      expect(etag).toBeTruthy();
      const body = await res.json();
      expect(etag).toBe(`"${body.meta.version}"`);
    });

    it("returns 304 with no body when If-None-Match matches the current ETag", async () => {
      authMock.mockResolvedValue(null);
      const first = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret }));
      const etag = first.headers.get("etag")!;

      const second = await GET(
        makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret, "if-none-match": etag })
      );
      expect(second.status).toBe(304);
      const text = await second.text();
      expect(text).toBe("");
    });

    it("CRITICAL: a delete that doesn't touch the most-recently-modified row still changes the ETag", async () => {
      // Guards against the exact bug the POS integrator flagged: hashing
      // max(updatedAt) instead of the response content would leave the
      // ETag unchanged when an OLDER row (not the most recently modified
      // one) is deleted, so a cached POS would keep selling something that
      // no longer exists.
      const orgC = await createTestOrg("Food Menu Route Org C (etag delete)");
      await prisma.organizationModule.create({ data: { organizationId: orgC.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });

      const oldDish = await prisma.foodDish.create({
        data: { organizationId: orgC.id, name: "Old Dish (deleted later)", variants: { create: [{ organizationId: orgC.id, label: "Único", price: 10 }] } },
      });
      // Se toca (actualiza) un platillo DISTINTO más recientemente que oldDish.
      await prisma.foodDish.update({ where: { id: oldDish.id }, data: {} });
      const newerDish = await prisma.foodDish.create({
        data: { organizationId: orgC.id, name: "Newer Dish", variants: { create: [{ organizationId: orgC.id, label: "Único", price: 20 }] } },
      });

      authMock.mockResolvedValue(null);
      const before = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgC.id}`, { "x-api-key": orgC.n8nWebhookSecret }));
      const etagBefore = before.headers.get("etag");

      // Borra el platillo MÁS VIEJO -- newerDish sigue siendo el "más reciente".
      await prisma.foodDish.delete({ where: { id: oldDish.id } });

      const after = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgC.id}`, { "x-api-key": orgC.n8nWebhookSecret }));
      expect(after.status).toBe(200); // nunca debe salir 304 aquí -- el contenido sí cambió
      const etagAfter = after.headers.get("etag");
      expect(etagAfter).not.toBe(etagBefore);

      void newerDish;
      await cleanupOrg(orgC.id);
    });
  });

  it("CRITICAL: warns (never blocks) about dishes, variants and extras running out, and lists low supplies", async () => {
    authMock.mockResolvedValue(null);
    const cheese = await prisma.foodInventoryItem.create({ data: { organizationId: orgA.id, name: "Queso menú", unit: "kg", currentStock: 0.5, minStock: 1 } });
    const beef = await prisma.foodInventoryItem.create({ data: { organizationId: orgA.id, name: "Carne menú", unit: "kg", currentStock: 0, minStock: 1 } });
    const bread = await prisma.foodInventoryItem.create({ data: { organizationId: orgA.id, name: "Pan menú", unit: "pza", currentStock: 50, minStock: 5 } });
    const group = await prisma.foodModifierGroup.create({
      data: {
        organizationId: orgA.id,
        name: "Extras menú",
        options: {
          create: [
            { name: "Extra queso", priceDelta: 10, ingredients: { create: [{ inventoryItemId: cheese.id, quantity: 0.03 }] } },
            { name: "Sin carne", priceDelta: 0, ingredients: { create: [{ inventoryItemId: beef.id, quantity: -0.15 }] } },
          ],
        },
      },
    });
    await prisma.foodDish.create({
      data: {
        organizationId: orgA.id,
        name: "Hamburguesa menú",
        variants: {
          create: [
            { organizationId: orgA.id, label: "Sencilla", price: 90, ingredients: { create: [{ inventoryItemId: bread.id, quantity: 1 }, { inventoryItemId: cheese.id, quantity: 0.05 }] } },
            { organizationId: orgA.id, label: "Doble", price: 120, ingredients: { create: [{ inventoryItemId: beef.id, quantity: 0.3 }] } },
          ],
        },
        modifierGroups: { create: [{ groupId: group.id }] },
      },
    });

    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret }));
    const body = await res.json();
    const dish = body.data.find((d: { name: string }) => d.name === "Hamburguesa menú");
    const byLabel = Object.fromEntries(dish.variants.map((v: { label: string; stockStatus: string }) => [v.label, v.stockStatus]));
    expect(byLabel).toEqual({ Sencilla: "low", Doble: "out" });
    expect(dish.stockStatus).toBe("low"); // una variante aún se puede vender
    const options = Object.fromEntries(dish.modifierGroups[0].options.map((o: { name: string; stockStatus: string }) => [o.name, o.stockStatus]));
    expect(options).toEqual({ "Extra queso": "low", "Sin carne": null }); // "Sin ..." no consume
    expect(body.data.find((d: { name: string }) => d.name === "Org A Secret Dish").stockStatus).toBeNull(); // sin receta

    const low = body.inventory.lowStock.map((i: { name: string; status: string }) => `${i.name}:${i.status}`);
    expect(low).toEqual(expect.arrayContaining(["Carne menú:out", "Queso menú:low"]));
    expect(low).not.toContain("Pan menú:low");

    // Un cambio de existencia cambia el ETag para que el POS se entere.
    await prisma.foodInventoryItem.update({ where: { id: beef.id }, data: { currentStock: 10 } });
    const after = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret, "if-none-match": res.headers.get("etag")! }));
    expect(after.status).toBe(200);
  });
});
