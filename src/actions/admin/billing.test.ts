// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN" }));
const { recordOrgPayment, setOrgBillingDueDate, listCollections } = await import("./billing");

describe("suscripción (acciones de admin, auditadas)", () => {
  let org: { id: string };
  beforeAll(async () => { org = await createTestOrg("Billing Admin"); });
  afterAll(async () => { await cleanupOrg(org.id); });
  const admin = () => authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));

  it("solo un admin de la plataforma registra pagos o fija vencimientos", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));
    await expect(recordOrgPayment({ orgId: org.id, amountMxn: 1, method: "CASH" })).rejects.toThrow(/autorizado/i);
    await expect(setOrgBillingDueDate({ orgId: org.id, dueAt: "2030-01-01", reason: "quiero más" })).rejects.toThrow(/autorizado/i);
    await expect(listCollections()).rejects.toThrow(/autorizado/i);
  });

  it("fija el vencimiento con motivo, registra un pago auditado y aparece en cobranza cuando vence", async () => {
    admin();
    await expect(setOrgBillingDueDate({ orgId: org.id, dueAt: "2030-01-01", reason: "x" })).rejects.toThrow();
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await setOrgBillingDueDate({ orgId: org.id, dueAt: soon, reason: "alta en el cobro mensual" });
    expect((await listCollections()).some((c) => c.orgId === org.id && c.state === "DUE_SOON")).toBe(true);
    const out = await recordOrgPayment({ orgId: org.id, amountMxn: 1299, method: "TRANSFER", months: 1, externalRef: "SPEI-77" });
    expect(out.applied).toBe(true);
    expect((await recordOrgPayment({ orgId: org.id, amountMxn: 1299, method: "TRANSFER", externalRef: "SPEI-77" })).applied).toBe(false);
    expect((await listCollections()).some((c) => c.orgId === org.id)).toBe(false);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: { in: ["billing.due_date", "billing.payment"] } } })).toBe(2);
  });
});
