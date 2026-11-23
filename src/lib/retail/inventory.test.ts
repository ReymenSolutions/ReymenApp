// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupOrg, createTestOrg, createTestUser } from "@/test/helpers";
import { cancelRetailTransfer, configureRetailLocation, createRetailLocation, dispatchRetailTransfer, markRetailWaste, receiveRetailTransfer, registerRetailItem, requestRetailTransfer } from "./inventory";

describe("Retail inventory boundaries and transfers", () => {
  let a: Awaited<ReturnType<typeof createTestOrg>>;
  let b: Awaited<ReturnType<typeof createTestOrg>>;
  let ownerA: Awaited<ReturnType<typeof createTestUser>>;
  let agentA: Awaited<ReturnType<typeof createTestUser>>;
  let viewerA: Awaited<ReturnType<typeof createTestUser>>;
  let ownerB: Awaited<ReturnType<typeof createTestUser>>;
  let warehouseA: string;
  let storeA: string;
  let storeB: string;

  beforeAll(async () => {
    a = await createTestOrg("Retail Inventory A");
    b = await createTestOrg("Retail Inventory B");
    await prisma.organizationModule.createMany({ data: [a.id, b.id].map((organizationId) => ({ organizationId, module: "RETAIL" as const, status: "ACTIVE" as const, source: "ADMIN_GRANTED" as const })) });
    [ownerA, agentA, viewerA, ownerB] = await Promise.all([
      createTestUser(a.id, "OWNER", "retail-owner-a"), createTestUser(a.id, "AGENT", "retail-agent-a"),
      createTestUser(a.id, "VIEWER", "retail-viewer-a"), createTestUser(b.id, "OWNER", "retail-owner-b"),
    ]);
    const [warehouse, store, otherStore] = await Promise.all([
      prisma.branch.create({ data: { organizationId: a.id, name: "Bodega de prueba" } }),
      prisma.branch.create({ data: { organizationId: a.id, name: "Tienda de prueba" } }),
      prisma.branch.create({ data: { organizationId: b.id, name: "Tienda de otra org" } }),
    ]);
    warehouseA = warehouse.id; storeA = store.id; storeB = otherStore.id;
    await Promise.all([
      configureRetailLocation(a.id, ownerA.id, { branchId: warehouseA, type: "BODEGA", format: "BODEGA" }),
      configureRetailLocation(a.id, ownerA.id, { branchId: storeA, type: "TIENDA", format: "PREMIUM" }),
      configureRetailLocation(b.id, ownerB.id, { branchId: storeB, type: "TIENDA", format: "OUTLET" }),
    ]);
  });

  afterAll(async () => {
    if (a) await cleanupOrg(a.id);
    if (b) await cleanupOrg(b.id);
  });

  const add = (code: string) => registerRetailItem(a.id, agentA.id, { code, locationId: warehouseA, salePrice: "199.00", cost: null });

  it("requires the entitlement, role and tenant for locations and item intake", async () => {
    await expect(createRetailLocation(a.id, viewerA.id, { name: "No autorizada", type: "TIENDA", format: "OUTLET" })).rejects.toThrow(/permiso/i);
    const newLocation = await createRetailLocation(a.id, ownerA.id, { name: "Nueva tienda", type: "TIENDA", format: "OUTLET" });
    expect(await prisma.retailLocationSettings.findUnique({ where: { branchId: newLocation.id } })).toMatchObject({ organizationId: a.id, type: "TIENDA" });
    const inactive = await createRetailLocation(a.id, ownerA.id, { name: "Tienda por abrir", type: "TIENDA", format: "HOGAR", isActive: false });
    expect(inactive.isActive).toBe(false);
    const wholesale = await createRetailLocation(a.id, ownerA.id, { name: "Mayoreo por retomar", type: "MAYOREO", format: "MAYOREO", isActive: true });
    expect(wholesale.isActive).toBe(false);
    await expect(createRetailLocation(a.id, ownerA.id, { name: "Nueva tienda", type: "TIENDA", format: "OUTLET" })).rejects.toThrow(/ya existe/i);
    await expect(configureRetailLocation(a.id, viewerA.id, { branchId: storeA, type: "TIENDA", format: "PREMIUM" })).rejects.toThrow(/permiso/i);
    await expect(configureRetailLocation(a.id, ownerA.id, { branchId: storeB, type: "TIENDA", format: "PREMIUM" })).rejects.toThrow(/organización/i);
    await expect(configureRetailLocation(a.id, ownerA.id, { branchId: warehouseA, type: "TIENDA", format: "PREMIUM" })).rejects.toThrow(/tipo/i);
    await expect(registerRetailItem(a.id, ownerB.id, { code: "X-1", locationId: warehouseA, salePrice: "100" })).rejects.toThrow(/permiso/i);
    await expect(registerRetailItem(a.id, viewerA.id, { code: "X-2", locationId: warehouseA, salePrice: "100" })).rejects.toThrow(/permiso/i);
    await expect(registerRetailItem(a.id, agentA.id, { code: "X-COST", locationId: warehouseA, salePrice: "100", cost: "50" })).rejects.toThrow(/costos/i);
    await expect(registerRetailItem(a.id, agentA.id, { code: "X-3", locationId: storeB, salePrice: "100" })).rejects.toThrow(/bodega/i);
    await expect(prisma.retailItem.create({ data: { organizationId: a.id, code: "X-DB", locationId: storeB, salePrice: "100", createdById: agentA.id } })).rejects.toThrow();
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: a.id, module: "RETAIL" } }, data: { status: "SUSPENDED" } });
    await expect(registerRetailItem(a.id, agentA.id, { code: "X-4", locationId: warehouseA, salePrice: "100" })).rejects.toThrow(/módulo/i);
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: a.id, module: "RETAIL" } }, data: { status: "ACTIVE" } });
  });

  it("creates one unique physical item with an ALTA movement and no fabricated cost", async () => {
    const item = await add("LAB-001");
    expect(item.code).toBe("LAB-001");
    expect(item.cost).toBeNull();
    expect(item.status).toBe("DISPONIBLE");
    const movements = await prisma.retailMovement.findMany({ where: { organizationId: a.id, itemId: item.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: "ALTA", actorUserId: agentA.id, toLocationId: warehouseA });
    await expect(add("lab-001")).rejects.toThrow(/código ya existe/i);
    await expect(registerRetailItem(a.id, agentA.id, { code: "BAD-MONEY", locationId: warehouseA, salePrice: "1.999" })).rejects.toThrow(/decimales/i);
  });

  it("keeps an item in transit until the destination confirms receipt", async () => {
    const item = await add("LAB-002");
    const transfer = await requestRetailTransfer(a.id, agentA.id, item.id, storeA);
    expect(transfer.status).toBe("SOLICITADO");
    await expect(requestRetailTransfer(b.id, ownerB.id, item.id, storeB)).rejects.toThrow(/disponible/i);
    await expect(requestRetailTransfer(a.id, agentA.id, item.id, storeB)).rejects.toThrow(/destino/i);
    await dispatchRetailTransfer(a.id, agentA.id, transfer.id);
    const inTransit = await prisma.retailItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(inTransit).toMatchObject({ locationId: warehouseA, status: "EN_TRASLADO" });
    await expect(dispatchRetailTransfer(a.id, agentA.id, transfer.id)).rejects.toThrow(/pendiente/i);
    await receiveRetailTransfer(a.id, agentA.id, transfer.id);
    const received = await prisma.retailItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(received).toMatchObject({ locationId: storeA, status: "DISPONIBLE" });
    const saved = await prisma.retailTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
    expect(saved.requestedAt).toBeInstanceOf(Date);
    expect(saved.departedAt).toBeInstanceOf(Date);
    expect(saved.receivedAt).toBeInstanceOf(Date);
    expect(saved.status).toBe("RECIBIDO");
    expect(await prisma.retailMovement.count({ where: { organizationId: a.id, itemId: item.id } })).toBe(4);
  });

  it("allows at most one open transfer under concurrent requests", async () => {
    const item = await add("LAB-003");
    const results = await Promise.allSettled([
      requestRetailTransfer(a.id, agentA.id, item.id, storeA),
      requestRetailTransfer(a.id, ownerA.id, item.id, storeA),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.retailTransfer.count({ where: { organizationId: a.id, itemId: item.id, status: "SOLICITADO" } })).toBe(1);
    expect(await prisma.retailMovement.count({ where: { organizationId: a.id, itemId: item.id, type: "TRASLADO_SOLICITUD" } })).toBe(1);
  });

  it("requires a manager and a reason to cancel a request or mark waste", async () => {
    const item = await add("LAB-004");
    const transfer = await requestRetailTransfer(a.id, agentA.id, item.id, storeA);
    await expect(cancelRetailTransfer(a.id, agentA.id, transfer.id, "Cambio de destino")).rejects.toThrow(/permiso/i);
    await expect(markRetailWaste(a.id, ownerA.id, item.id, "Daño")).rejects.toThrow(/traslado/i);
    await cancelRetailTransfer(a.id, ownerA.id, transfer.id, "Cambio de destino");
    await expect(markRetailWaste(a.id, ownerA.id, item.id, " ")).rejects.toThrow(/motivo/i);
    await expect(markRetailWaste(a.id, viewerA.id, item.id, "Defecto")).rejects.toThrow(/permiso/i);
    await markRetailWaste(a.id, ownerA.id, item.id, "Cierre defectuoso");
    expect(await prisma.retailItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ status: "MERMA" });
    const waste = await prisma.retailMovement.findFirstOrThrow({ where: { organizationId: a.id, itemId: item.id, type: "MERMA" } });
    expect(waste.reason).toBe("Cierre defectuoso");
  });
});
