// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));

import { GET } from "./route";

describe("GET /api/realty/media/[id]", () => {
  let orgId = "";
  let publicId = "";
  let draftId = "";

  beforeAll(async () => {
    const org = await createTestOrg("MEDIA");
    orgId = org.id;
    const zone = await prisma.realtyZone.create({ data: { organizationId: org.id, name: "Zona", key: "zona" } });
    const base = { organizationId: org.id, operation: "SALE" as const, propertyType: "HOUSE" as const, price: 1_000_000, zoneId: zone.id, title: "Casa" };
    const pub = await prisma.realtyProperty.create({ data: { ...base, slug: `media-pub-${org.id}`, publishedAt: new Date() } });
    const draft = await prisma.realtyProperty.create({ data: { ...base, slug: `media-draft-${org.id}` } });
    const file = { organizationId: org.id, mimeType: "image/webp", data: Buffer.from("fake"), width: 1, height: 1 };
    publicId = (await prisma.realtyPropertyMedia.create({ data: { ...file, propertyId: pub.id } })).id;
    draftId = (await prisma.realtyPropertyMedia.create({ data: { ...file, propertyId: draft.id } })).id;
  });
  afterAll(() => cleanupOrg(orgId));

  const call = (id: string, headers: Record<string, string> = {}) => GET(new Request(`http://x/api/realty/media/${id}`, { headers }), { params: Promise.resolve({ id }) });

  it("una foto publicada se sirve cacheable por CDN, con ETag", async () => {
    const res = await call(publicId);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("ETag")).toBe(`"${publicId}"`);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("si el navegador revalida con el ETag responde 304 sin cuerpo", async () => {
    const res = await call(publicId, { "if-none-match": `"${publicId}"` });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("una foto de borrador no es pública sin sesión", async () => {
    expect((await call(draftId)).status).toBe(404);
  });
});
