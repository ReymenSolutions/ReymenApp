// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { setMenuPerBranch, setBranchDishAvailable, setBranchVariantPrice } = await import("./branch-menu");
const { getFoodMenuForPos, applyBranchMenu } = await import("@/lib/food");

describe("menú por sucursal", () => {
  let org: { id: string };
  let other: { id: string };
  let owner: { id: string };
  let viewer: { id: string };
  let otherOwner: { id: string };
  let centro: { id: string };
  let taco: { id: string; variants: { id: string }[] };
  let torta: { id: string; variants: { id: string }[] };
  const as = (u: { id: string }, role: "OWNER" | "VIEWER", orgId = org.id) => authMock.mockResolvedValue(fakeSession({ id: u.id, role, organizationId: orgId }));
  const names = async (branch: string | null) => (await getFoodMenuForPos(org.id, branch)).map((d) => d.name).sort();
  const priceOf = async (branch: string | null, dish: string) => (await getFoodMenuForPos(org.id, branch)).find((d) => d.name === dish)?.variants[0].price;

  beforeAll(async () => {
    org = await createTestOrg("Branch Menu Org");
    other = await createTestOrg("Branch Menu Other");
    owner = await createTestUser(org.id, "OWNER", "bm-owner");
    viewer = await createTestUser(org.id, "VIEWER", "bm-viewer");
    otherOwner = await createTestUser(other.id, "OWNER", "bm-other");
    for (const o of [org, other]) await prisma.organizationModule.create({ data: { organizationId: o.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    centro = await prisma.branch.create({ data: { organizationId: org.id, name: "Centro" } });
    const mk = (name: string, price: number) =>
      prisma.foodDish.create({ data: { organizationId: org.id, name, variants: { create: [{ organizationId: org.id, label: "Único", price }] } }, include: { variants: true } });
    taco = await mk("Taco", 50);
    torta = await mk("Torta", 90);
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });

  it("apagado (por defecto) todas las sucursales ven el mismo menú aunque haya cambios guardados", async () => {
    as(owner, "OWNER");
    await expect(setBranchDishAvailable(centro.id, torta.id, false)).resolves.toBeTruthy();
    await setBranchVariantPrice(centro.id, taco.variants[0].id, 65);
    expect(await names(centro.id)).toEqual(["Taco", "Torta"]);
    expect(await priceOf(centro.id, "Taco")).toBe(50);
  });

  it("encendido, la sucursal oculta platillos y usa sus precios; la Principal y las demás siguen con el menú base", async () => {
    as(owner, "OWNER");
    await setMenuPerBranch(true);
    expect(await names(centro.id)).toEqual(["Taco"]);
    expect(await priceOf(centro.id, "Taco")).toBe(65);
    expect(await names(null)).toEqual(["Taco", "Torta"]);
    expect(await priceOf(null, "Taco")).toBe(50);
    // Una sucursal desconocida (o de otra organización) cae en el menú base.
    expect(await names("no-existe")).toEqual(["Taco", "Torta"]);
  });

  it("volver a mostrar un platillo y quitar el precio regresa al menú base", async () => {
    as(owner, "OWNER");
    await setBranchDishAvailable(centro.id, torta.id, true);
    await setBranchVariantPrice(centro.id, taco.variants[0].id, null);
    expect(await names(centro.id)).toEqual(["Taco", "Torta"]);
    expect(await priceOf(centro.id, "Taco")).toBe(50);
  });

  it("solo quien administra la configuración cambia el menú, y no se toca lo de otra organización", async () => {
    as(viewer, "VIEWER");
    await expect(setMenuPerBranch(false)).rejects.toThrow();
    await expect(setBranchDishAvailable(centro.id, torta.id, false)).rejects.toThrow();
    as(otherOwner, "OWNER", other.id);
    await expect(setBranchDishAvailable(centro.id, torta.id, false)).rejects.toThrow(); // sucursal ajena
    as(owner, "OWNER");
    await expect(setBranchVariantPrice(centro.id, taco.variants[0].id, -5)).rejects.toThrow();
    await expect(setBranchVariantPrice(centro.id, "variante-ajena", 10)).rejects.toThrow();
  });

  it("applyBranchMenu es pura: no modifica el menú de entrada", () => {
    const base = [{ dishId: "a", name: "A", categoryId: null, categoryName: null, stockStatus: "ok", variants: [{ variantId: "v", label: "U", price: 10, externalPosId: null, stockStatus: "ok" }], modifierGroups: [] }] as never;
    const out = applyBranchMenu(base, new Set(), new Map([["v", 12]]));
    expect(out[0].variants[0].price).toBe(12);
    expect((base as { variants: { price: number }[] }[])[0].variants[0].price).toBe(10);
  });
});
