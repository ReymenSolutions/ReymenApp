// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { createWorkshopVehicle, createWorkshopQuote } = await import("./workshop");

describe("workshop tenant integration", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let customerA: { id: string };
  let customerB: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Workshop A");
    orgB = await createTestOrg("Workshop B");
    await prisma.organizationModule.create({ data: { organizationId: orgA.id, module: "WORKSHOP", status: "ACTIVE", source: "ADMIN_GRANTED" } });
    customerA = await prisma.customer.create({ data: { organizationId: orgA.id, phone: "+528110000001", phoneKey: "8110000001", name: "Client A" } });
    customerB = await prisma.customer.create({ data: { organizationId: orgB.id, phone: "+528110000002", phoneKey: "8110000002", name: "Client B" } });
    auth.mockResolvedValue({ user: { id: "owner_a", role: "OWNER", organizationId: orgA.id } });
  });

  afterAll(async () => {
    if (orgA) {
      await prisma.workshopQuoteItem.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopQuote.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopVehicle.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.organizationModule.deleteMany({ where: { organizationId: orgA.id, module: "WORKSHOP" } });
      await prisma.customer.deleteMany({ where: { organizationId: orgA.id } });
      await cleanupOrg(orgA.id);
    }
    if (orgB) {
      await prisma.workshopVehicle.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.customer.deleteMany({ where: { organizationId: orgB.id } });
      await cleanupOrg(orgB.id);
    }
  });

  it("rejects a customer from another organization", async () => {
    await expect(createWorkshopVehicle({ customerId: customerB.id, placas: "WRONG1", vin: "1HGCM82633A004352", marca: "Honda", modelo: "Accord", anio: "2020", kilometrajeActual: "10" })).rejects.toThrow(/organización/i);
  });

  it("creates a CRM-linked vehicle and a net-priced quote only in the session organization", async () => {
    const vehicle = await createWorkshopVehicle({ customerId: customerA.id, placas: "WOLF1", vin: "1HGCM82633A004352", marca: "Honda", modelo: "Accord", anio: "2020", kilometrajeActual: "30000" });
    const quote = await createWorkshopQuote({ vehicleId: vehicle.id, servicioTitulo: "Cambio de aceite", items: [{ tipo: "SERVICIO", concepto: "Cambio de aceite", cantidad: "1", unidad: "serv.", precioUnitarioNeto: "100.00", costoUnitarioNeto: "60.00" }] });
    const saved = await prisma.workshopQuote.findUniqueOrThrow({ where: { id: quote.id }, include: { items: true } });
    expect(saved.organizationId).toBe(orgA.id);
    expect(saved.customerId).toBe(customerA.id);
    expect(saved.folio).toBeNull();
    expect(saved.total.toFixed(2)).toBe("116.00");
    expect(saved.utilidadNeta?.toFixed(2)).toBe("40.00");
    expect(saved.items).toHaveLength(1);
    expect(await prisma.workshopQuote.count({ where: { organizationId: orgB.id } })).toBe(0);
  });

  it("rejects a quote for another organization's vehicle", async () => {
    const otherVehicle = await prisma.workshopVehicle.create({ data: { organizationId: orgB.id, customerId: customerB.id, placas: "OTHER1", vin: "2HGCM82633A004352" } });
    await expect(createWorkshopQuote({ vehicleId: otherVehicle.id, servicioTitulo: "Cambio de aceite", items: [{ tipo: "SERVICIO", concepto: "Cambio de aceite", cantidad: "1", unidad: "serv.", precioUnitarioNeto: "100.00" }] })).rejects.toThrow(/organización/i);
    expect(await prisma.workshopQuote.count({ where: { organizationId: orgA.id, vehicleId: otherVehicle.id } })).toBe(0);
  });
});
