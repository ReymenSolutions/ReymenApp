// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin-notifications", () => ({ notifyAdmins: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN" }));

const { getOrgAiBudget, extendOrgAiBudget, resetOrgAiBudget, creditOrgAiBudget, setOrgAiBudget, setOrgAiBudgetPolicy } = await import("./ai-budget");

describe("presupuesto de IA por cliente (acciones de admin, auditadas)", () => {
  let org: { id: string };
  beforeAll(async () => {
    org = await createTestOrg("Budget Admin Org");
    await prisma.aiRate.create({ data: { provider: "anthropic", model: "eco-model", currency: "MXN", inputPerMTok: 1, outputPerMTok: 1, effectiveFrom: new Date("2020-01-01"), source: "test-budget-admin" } });
  });
  afterAll(async () => {
    await prisma.aiRate.deleteMany({ where: { source: "test-budget-admin" } });
    await prisma.aiBudgetAdjustment.deleteMany({ where: { organizationId: org.id } });
    await cleanupOrg(org.id);
  });
  const admin = () => authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));

  it("solo un admin de la plataforma consulta o cambia presupuestos (ni siquiera el dueño del propio cliente)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));
    await expect(getOrgAiBudget({ orgId: org.id })).rejects.toThrow(/autorizado/i);
    await expect(extendOrgAiBudget({ orgId: org.id, amountMxn: 10, reason: "quiero más" })).rejects.toThrow(/autorizado/i);
    await expect(setOrgAiBudget({ orgId: org.id, monthlyBudgetMxn: 9999 })).rejects.toThrow(/autorizado/i);
    authMock.mockResolvedValue(null);
    await expect(resetOrgAiBudget({ orgId: org.id, reason: "motivo válido" })).rejects.toThrow(/autorizado/i);
  });

  it("consulta, fija, amplía, ajusta y restablece; todo queda en la bitácora con quién y por qué", async () => {
    admin();
    expect((await getOrgAiBudget({ orgId: org.id })).state).toMatchObject({ source: "plan", baseMxn: 75 });
    await setOrgAiBudget({ orgId: org.id, monthlyBudgetMxn: 100 });
    const ext = await extendOrgAiBudget({ orgId: org.id, amountMxn: 25, reason: "campaña de temporada" });
    expect(ext.state).toMatchObject({ baseMxn: 100, adjustmentsMxn: 25, availableMxn: 125 });
    await creditOrgAiBudget({ orgId: org.id, amountMxn: -5, reason: "corrección de captura" });
    const reset = await resetOrgAiBudget({ orgId: org.id, reason: "cortesía comercial" });
    expect(reset.state.remainingMxn).toBe(100); // sin consumo: el reset deja el base completo
    const view = await getOrgAiBudget({ orgId: org.id });
    expect(view.adjustments.map((a) => a.type).sort()).toEqual(["CREDIT", "EXTEND", "RESET"]);
    expect(view.adjustments.find((a) => a.type === "EXTEND")).toMatchObject({ amountMxn: 25, reason: "campaña de temporada" });
    const actions = (await prisma.auditLog.findMany({ where: { organizationId: org.id, userId: "admin1", action: { startsWith: "ai.budget_" } } })).map((a) => a.action).sort();
    expect(actions).toEqual(expect.arrayContaining(["ai.budget_credit", "ai.budget_extend", "ai.budget_reset", "ai.budget_set"]));
    // Volver al predeterminado del plan.
    await setOrgAiBudget({ orgId: org.id, monthlyBudgetMxn: null });
    expect((await getOrgAiBudget({ orgId: org.id })).state.source).toBe("plan");
  });

  it("exige motivo y montos válidos; un cliente inexistente no se puede tocar", async () => {
    admin();
    await expect(extendOrgAiBudget({ orgId: org.id, amountMxn: 10, reason: "x" })).rejects.toThrow(/monto|motivo/i);
    await expect(extendOrgAiBudget({ orgId: org.id, amountMxn: -3, reason: "motivo válido" })).rejects.toThrow(/monto|motivo/i);
    await expect(creditOrgAiBudget({ orgId: org.id, amountMxn: 0, reason: "motivo válido" })).rejects.toThrow(/monto|motivo/i);
    await expect(extendOrgAiBudget({ orgId: "no-existe", amountMxn: 10, reason: "motivo válido" })).rejects.toThrow(/no encontrado/i);
  });

  it("la política de modelo económico exige tarifa y tope, y queda a nombre de quien la autoriza", async () => {
    admin();
    await expect(setOrgAiBudgetPolicy({ orgId: org.id, policy: "DEGRADE", provider: "anthropic", model: "sin-tarifa", capMxn: 10 })).rejects.toThrow(/tarifa/i);
    await expect(setOrgAiBudgetPolicy({ orgId: org.id, policy: "DEGRADE", provider: "anthropic", model: "eco-model", capMxn: 0 })).rejects.toThrow();
    const out = await setOrgAiBudgetPolicy({ orgId: org.id, policy: "DEGRADE", provider: "anthropic", model: "eco-model", capMxn: 10 });
    expect(out.state).toMatchObject({ policy: "DEGRADE", degradeCapMxn: 10, fallback: { provider: "anthropic", model: "eco-model" } });
    expect(await prisma.aiBudgetSetting.findUnique({ where: { organizationId: org.id } })).toMatchObject({ policyAuthorizedById: "admin1" });
    expect((await setOrgAiBudgetPolicy({ orgId: org.id, policy: "BLOCK" })).state.policy).toBe("BLOCK");
  });
});
