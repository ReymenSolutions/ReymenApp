// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";
import { MAX_BRANCHES, listBranches } from "@/lib/branches";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createBranch, renameBranch, setBranchActive } = await import("./branches");
const { processFoodPosOrder, getFoodSalesSummary } = await import("@/lib/food");

describe("sucursales", () => {
  let org: { id: string };
  let other: { id: string };
  let owner: { id: string };
  let viewer: { id: string };
  let otherOwner: { id: string };
  let variantId: string;
  const as = (u: { id: string }, role: "OWNER" | "VIEWER", orgId = org.id) => authMock.mockResolvedValue(fakeSession({ id: u.id, role, organizationId: orgId }));
  const sale = (extra: Record<string, unknown> = {}, gross = 100) => ({ grossAmount: gross, netAmount: gross / 1.16, items: [{ variantId, quantity: gross > 0 ? 1 : -1 }], ...extra });

  beforeAll(async () => {
    org = await createTestOrg("Branches Org");
    other = await createTestOrg("Branches Other");
    owner = await createTestUser(org.id, "OWNER", "br-owner");
    viewer = await createTestUser(org.id, "VIEWER", "br-viewer");
    otherOwner = await createTestUser(other.id, "OWNER", "br-other");
    for (const o of [org, other]) await prisma.organizationModule.create({ data: { organizationId: o.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    const dish = await prisma.foodDish.create({
      data: { organizationId: org.id, name: "Taco", variants: { create: [{ organizationId: org.id, label: "Único", price: 100 }] } },
      include: { variants: true },
    });
    variantId = dish.variants[0].id;
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });

  it("el administrador crea, renombra y archiva; el rol de solo lectura no", async () => {
    as(viewer, "VIEWER");
    await expect(createBranch("Centro")).rejects.toThrow();
    as(owner, "OWNER");
    const { branchId } = await createBranch("  Centro  ");
    expect((await listBranches(org.id))[0].name).toBe("Centro");
    await renameBranch(branchId, "Centro Histórico");
    expect((await listBranches(org.id))[0].name).toBe("Centro Histórico");
    await setBranchActive(branchId, false);
    expect(await listBranches(org.id, { activeOnly: true })).toHaveLength(0);
    await setBranchActive(branchId, true);
    expect(await listBranches(org.id, { activeOnly: true })).toHaveLength(1);
  });

  it("rechaza nombres repetidos, el nombre 'Principal' y vacíos", async () => {
    as(owner, "OWNER");
    await expect(createBranch("centro histórico")).rejects.toThrow(/mismo nombre|ese nombre/);
    await expect(createBranch("Principal")).rejects.toThrow();
    await expect(createBranch("   ")).rejects.toThrow();
  });

  it("no toca sucursales de otra organización", async () => {
    as(otherOwner, "OWNER", other.id);
    const mine = (await listBranches(org.id))[0];
    await expect(renameBranch(mine.id, "Hack")).rejects.toThrow();
    await expect(setBranchActive(mine.id, false)).rejects.toThrow();
  });

  it("respeta el máximo de sucursales", async () => {
    as(owner, "OWNER");
    const have = await prisma.branch.count({ where: { organizationId: org.id } });
    await prisma.branch.createMany({ data: Array.from({ length: MAX_BRANCHES - have }, (_, i) => ({ organizationId: org.id, name: `S${i}` })) });
    await expect(createBranch("Una más")).rejects.toThrow(/máximo/);
    await prisma.branch.deleteMany({ where: { organizationId: org.id, name: { startsWith: "S" } } });
  });

  it("las ventas del POS se separan por sucursal y 'todas' las junta", async () => {
    const branch = (await listBranches(org.id))[0];
    await processFoodPosOrder(sale({ orderId: "M-1" }, 100), org.id); // sin sucursal → principal
    await processFoodPosOrder(sale({ orderId: "C-1", branchId: branch.id }, 300), org.id);
    await processFoodPosOrder(sale({ orderId: "C-2", branchId: "no-existe" }, 50), org.id); // desconocida → principal

    expect((await getFoodSalesSummary(org.id)).today.gross).toBe(450);
    expect((await getFoodSalesSummary(org.id, null)).today.gross).toBe(150);
    expect((await getFoodSalesSummary(org.id, branch.id)).today.gross).toBe(300);
  });

  it("una sucursal de otra organización no se acepta y una cancelación hereda la de la venta original", async () => {
    const theirs = await prisma.branch.create({ data: { organizationId: other.id, name: "Ajena" } });
    await processFoodPosOrder(sale({ orderId: "X-1", branchId: theirs.id }, 70), org.id);
    expect((await prisma.foodSale.findFirstOrThrow({ where: { organizationId: org.id, externalOrderId: "X-1" } })).branchId).toBeNull();

    const branch = (await listBranches(org.id))[0];
    await processFoodPosOrder(sale({ orderId: "Z-1", branchId: branch.id }, 200), org.id);
    await processFoodPosOrder(sale({ orderId: "Z-1" }, -200), org.id);
    const cancel = await prisma.foodSale.findFirstOrThrow({ where: { organizationId: org.id, externalOrderId: "Z-1", grossAmount: { lt: 0 } } });
    expect(cancel.branchId).toBe(branch.id);
  });
});
