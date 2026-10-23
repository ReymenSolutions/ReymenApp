// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@/lib/app-url", () => ({ getAppUrl: () => "https://app.test" }));

import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { saveProperty, saveZone, changePropertyStatus, type PropertyInput } from "@/lib/realty/service";
import { listCatalog, resolveCatalogItem } from "./index";
import { parseRef } from "./types";
import { productColumns } from "@/lib/smartcard-products";

describe("parseRef", () => {
  it("separa fuente e id", () => {
    expect(parseRef("realty:abc")).toEqual({ key: "realty", id: "abc" });
    expect(parseRef("realty:")).toBeNull();
    expect(parseRef(":abc")).toBeNull();
    expect(parseRef("sin-separador")).toBeNull();
  });
});

describe("productColumns", () => {
  it("solo acepta fotos https y recorta textos", () => {
    const cols = productColumns({ ref: "realty:x", title: "T".repeat(200), subtitle: null, priceLabel: "$1", imageUrl: "http://inseguro/x.webp", url: "https://app.test/p/x", available: true });
    expect(cols.title).toHaveLength(140);
    expect(cols.image_url).toBeNull();
    expect(cols.subtitle).toBeNull();
  });
});

describe("catálogo de Real Estate", () => {
  let orgId = "";
  let otherOrgId = "";
  let publishedId = "";
  let draftId = "";

  const base = (zoneId: string, over: Partial<PropertyInput> = {}): PropertyInput => ({
    title: "Casa en Cumbres",
    description: null,
    operation: "SALE",
    propertyType: "HOUSE",
    status: "AVAILABLE",
    price: 4_500_000,
    currency: "MXN",
    zoneId,
    postalCode: "64610",
    neighborhood: "Cumbres",
    municipality: "Monterrey",
    state: "Nuevo León",
    addressLine: "Calle Secreta 123",
    showExactLocation: false,
    latitude: null,
    longitude: null,
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 2,
    constructionArea: 200,
    landArea: 180,
    ageYears: 5,
    furnished: null,
    features: [],
    contactWhatsapp: null,
    branchId: null,
    advisorUserId: null,
    published: true,
    ...over,
  });

  beforeAll(async () => {
    const org = await createTestOrg("Catalog");
    orgId = org.id;
    await prisma.organizationModule.create({ data: { organizationId: orgId, module: "REALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
    const user = await createTestUser(orgId, "AGENT", "catalog-agent");
    const zoneId = await saveZone(orgId, user.id, { name: "Cumbres", latitude: null, longitude: null });
    publishedId = await saveProperty(orgId, user.id, base(zoneId));
    draftId = await saveProperty(orgId, user.id, base(zoneId, { title: "Borrador", published: false }));
    await saveProperty(orgId, user.id, base(zoneId, { title: "Depa en renta", operation: "RENT", propertyType: "APARTMENT", price: 18_000 }));
    const other = await createTestOrg("CatalogOther");
    otherOrgId = other.id;
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
    await cleanupOrg(otherOrgId);
  });

  it("lista solo propiedades publicadas y disponibles, con landing y precio", async () => {
    const [g] = await listCatalog(orgId);
    expect(g.key).toBe("realty");
    const titles = g.items.map((i) => i.title);
    expect(titles).toContain("Casa en Cumbres");
    expect(titles).not.toContain("Borrador");
    const casa = g.items.find((i) => i.title === "Casa en Cumbres")!;
    expect(casa.priceLabel).toBe("$4,500,000");
    expect(casa.subtitle).toBe("Casa · 3 rec · Cumbres");
    expect(casa.url).toMatch(/^https:\/\/app\.test\/p\/.+\?src=smartcard$/);
    expect(g.items.find((i) => i.title === "Depa en renta")!.priceLabel).toBe("$18,000 / mes");
  });

  it("busca por texto", async () => {
    const [g] = await listCatalog(orgId, "renta");
    expect(g.items.map((i) => i.title)).toEqual(["Depa en renta"]);
  });

  it("no resuelve productos de otra organización ni sin el módulo", async () => {
    expect(await resolveCatalogItem(otherOrgId, `realty:${publishedId}`)).toBeNull();
    expect(await listCatalog(otherOrgId)).toEqual([]);
  });

  it("marca como no disponible un borrador o una propiedad vendida", async () => {
    expect((await resolveCatalogItem(orgId, `realty:${draftId}`))!.available).toBe(false);
    const user = await prisma.user.findFirstOrThrow({ where: { organizationId: orgId } });
    await changePropertyStatus(orgId, user.id, publishedId, "SOLD", null);
    expect((await resolveCatalogItem(orgId, `realty:${publishedId}`))!.available).toBe(false);
  });
});
