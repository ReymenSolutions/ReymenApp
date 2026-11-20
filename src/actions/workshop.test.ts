// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const assertModuleEnabled = vi.fn();
const customerFindFirst = vi.fn();
const vehicleFindFirst = vi.fn();
const vehicleCreate = vi.fn();
const audit = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/modules", () => ({ assertModuleEnabled }));
vi.mock("@/lib/prisma", () => ({ prisma: { customer: { findFirst: customerFindFirst }, workshopVehicle: { findFirst: vehicleFindFirst, create: vehicleCreate } } }));
vi.mock("@/lib/audit", () => ({ logAudit: audit }));

const { createWorkshopVehicle } = await import("./workshop");
const input = { customerId: "customer_a", placas: "ABC123", vin: "1HGCM82633A004352", marca: "Honda", modelo: "Accord", anio: "2020", kilometrajeActual: "30000" };

describe("workshop vehicle authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertModuleEnabled.mockReset();
    assertModuleEnabled.mockResolvedValue(undefined);
    auth.mockResolvedValue({ user: { id: "owner_a", role: "OWNER", organizationId: "org_a" } });
    customerFindFirst.mockResolvedValue({ id: "customer_a" });
    vehicleFindFirst.mockResolvedValue(null);
    vehicleCreate.mockResolvedValue({ id: "vehicle_a" });
  });

  it("rejects a user without the owner permission", async () => {
    auth.mockResolvedValue({ user: { id: "agent_a", role: "AGENT", organizationId: "org_a" } });
    await expect(createWorkshopVehicle(input)).rejects.toThrow(/autorizado/i);
    expect(vehicleCreate).not.toHaveBeenCalled();
  });

  it("rejects an organization without the workshop entitlement", async () => {
    assertModuleEnabled.mockRejectedValue(new Error("Module disabled"));
    await expect(createWorkshopVehicle(input)).rejects.toThrow(/Module disabled/);
    expect(vehicleCreate).not.toHaveBeenCalled();
  });

  it("rejects a customer belonging to another organization", async () => {
    customerFindFirst.mockResolvedValue(null);
    await expect(createWorkshopVehicle(input)).rejects.toThrow(/organización/i);
    expect(customerFindFirst).toHaveBeenCalledWith({ where: { id: "customer_a", organizationId: "org_a" }, select: { id: true } });
    expect(vehicleCreate).not.toHaveBeenCalled();
  });

  it("creates a vehicle only for the session organization", async () => {
    await expect(createWorkshopVehicle(input)).resolves.toEqual({ id: "vehicle_a" });
    expect(vehicleCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: "org_a", customerId: "customer_a" }) }));
  });
});
