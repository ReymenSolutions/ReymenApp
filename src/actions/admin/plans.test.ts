// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin-notifications", () => ({ notifyAdmins: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
vi.mock("@/lib/smartcard-link", async (orig) => ({ ...(await orig<typeof import("@/lib/smartcard-link")>()), syncSmartcardMemberLimitForPlan: vi.fn().mockResolvedValue("updated") }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN" }));

const { updatePlan, createPlan, listPlansForAdmin } = await import("./plans");
const { changePlan } = await import("./clients");
const { assertPlanCapacity } = await import("@/lib/plan-limits");
const { getRoiData } = await import("@/lib/roi");
const { getBudgetState } = await import("@/lib/ai/budget");
const { planMemberLimit } = await import("@/lib/smartcard-link");
const { syncModulesToPlan } = await import("./modules");
const { getPlan } = await import("@/lib/plans");
const { stripePriceIdFor, planForPriceId } = await import("@/lib/stripe");

const KEY = "qa-plan";
const base = { name: "QA", nameEn: "QA", description: "Plan de pruebas", descriptionEn: "", priceMxn: 500, maxLeads: 5, maxUsers: 1, maxAutomations: 1, aiBudgetMxn: 10, maxAiAgents: 2, modules: ["CRM"] as const, features: [{ es: "Una cosa", en: "One thing" }], stripePriceId: null, sortOrder: 90, isActive: true };

describe("Admin → Planes: lo que se edita se actualiza en todo lo conectado", () => {
  let org: { id: string };
  const admin = () => authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));

  beforeAll(async () => {
    admin();
    await prisma.plan.deleteMany({ where: { key: KEY } });
    await createPlan({ ...base, modules: [...base.modules], key: KEY });
    org = await createTestOrg("Plans Org");
    await changePlan(org.id, KEY);
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await prisma.plan.deleteMany({ where: { key: KEY } });
  });

  it("solo un admin de la plataforma puede ver o cambiar el catálogo (no el dueño de un cliente)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));
    await expect(listPlansForAdmin()).rejects.toThrow(/autorizado/i);
    await expect(updatePlan(KEY, { ...base, modules: [...base.modules] })).rejects.toThrow(/autorizado/i);
    await expect(createPlan({ ...base, modules: [], key: "otro" })).rejects.toThrow(/autorizado/i);
    authMock.mockResolvedValue(null);
    await expect(updatePlan(KEY, { ...base, modules: [] })).rejects.toThrow(/autorizado/i);
  });

  it("al editar, la versión sube, queda la revisión y la bitácora con el antes y el después", async () => {
    admin();
    const out = await updatePlan(KEY, { ...base, modules: [...base.modules], name: "QA Plus", priceMxn: 750 });
    expect(out).toMatchObject({ success: true, version: 2 });
    expect(out.changed.sort()).toEqual(["name", "priceMxn"]);
    const row = await prisma.plan.findUniqueOrThrow({ where: { key: KEY }, include: { revisions: true } });
    expect(row).toMatchObject({ name: "QA Plus", version: 2, updatedById: "admin1" });
    expect(row.revisions.map((r) => r.version).sort()).toEqual([1, 2]);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "plan.update", resourceId: row.id }, orderBy: { createdAt: "desc" } });
    expect(audit.metadata).toMatchObject({ key: KEY, version: 2, changes: { name: { from: "QA", to: "QA Plus" }, priceMxn: { from: 500, to: 750 } } });
  });

  it("el precio se refleja en el ROI y el precio pactado de un cliente no se toca", async () => {
    admin();
    await updatePlan(KEY, { ...base, modules: [...base.modules], priceMxn: 900 });
    vi.stubEnv("MXN_PER_USD", "20");
    expect((await getRoiData(org.id, KEY)).planCostMxn).toBe(900);
    await prisma.organization.update({ where: { id: org.id }, data: { customMonthlyPriceMxn: 400 } });
    await updatePlan(KEY, { ...base, modules: [...base.modules], priceMxn: 1100 });
    expect((await getRoiData(org.id, KEY)).planCostMxn).toBe(400); // pactado
    await prisma.organization.update({ where: { id: org.id }, data: { customMonthlyPriceMxn: null } });
    expect((await getRoiData(org.id, KEY)).planCostMxn).toBe(1100);
    vi.unstubAllEnvs();
  });

  it("los límites se aplican al instante en la validación de capacidad, y 'ilimitado' no bloquea nunca", async () => {
    admin();
    await prisma.automation.createMany({ data: [0, 1].map((i) => ({ organizationId: org.id, name: `a${i}`, type: "custom", webhookSecret: `s${i}` })) });
    await updatePlan(KEY, { ...base, modules: [...base.modules], maxAutomations: 2 });
    await expect(assertPlanCapacity(org.id, "automations")).rejects.toThrow(/límite/i); // ya tiene 2
    await updatePlan(KEY, { ...base, modules: [...base.modules], maxAutomations: 3 });
    await expect(assertPlanCapacity(org.id, "automations")).resolves.toBeUndefined();
    await updatePlan(KEY, { ...base, modules: [...base.modules], maxAutomations: "" as never });
    expect((await getPlan(KEY)).limits.automations).toBeNull();
    await expect(assertPlanCapacity(org.id, "automations")).resolves.toBeUndefined();
  });

  it("el presupuesto de IA, el límite de SmartCard y los módulos salen del plan editado", async () => {
    admin();
    await updatePlan(KEY, { ...base, modules: ["CRM", "AUTOMATIONS"], aiBudgetMxn: 321, maxUsers: 7 });
    expect((await getBudgetState(org.id)).baseMxn).toBe(321);
    expect(await planMemberLimit(KEY)).toBe(7);
    await prisma.organizationModule.updateMany({ where: { organizationId: org.id, module: "AUTOMATIONS" }, data: { status: "SUSPENDED" } });
    const sync = await syncModulesToPlan(org.id);
    expect(sync.activatedModules).toContain("AUTOMATIONS");
  });

  it("el precio de Stripe del plan se toma del catálogo (y reconoce el plan al revés)", async () => {
    admin();
    expect(await stripePriceIdFor(KEY)).toBeNull();
    await updatePlan(KEY, { ...base, modules: [...base.modules], stripePriceId: "price_qa_1" });
    expect(await stripePriceIdFor(KEY)).toBe("price_qa_1");
    expect(await planForPriceId("price_qa_1")).toBe(KEY);
  });

  it("Cambiar plan solo ofrece planes activos; un plan retirado lo conservan quienes ya lo tienen; siempre queda uno activo", async () => {
    admin();
    const other = await createTestOrg("Plans Other Org");
    try {
      await updatePlan(KEY, { ...base, modules: [...base.modules], isActive: false });
      await expect(changePlan(other.id, KEY)).rejects.toThrow(/inválido/i); // retirado: no se asigna a nuevos
      await expect(changePlan(org.id, KEY)).resolves.toBeTruthy(); // quien ya lo tiene lo conserva
      expect((await getPlan(KEY)).isActive).toBe(false);
      await expect(changePlan(other.id, "no-existe")).rejects.toThrow(/inválido/i);
    } finally {
      await cleanupOrg(other.id);
    }
    await updatePlan(KEY, { ...base, modules: [...base.modules], isActive: true });
    // No se puede retirar el último plan activo.
    const active = await prisma.plan.findMany({ where: { isActive: true }, select: { key: true } });
    if (active.length === 1) await expect(updatePlan(active[0].key, { ...base, modules: [], isActive: false })).rejects.toThrow(/al menos un plan/i);
  });

  it("valida los datos y las llaves nuevas", async () => {
    admin();
    await expect(updatePlan(KEY, { ...base, modules: [], name: "" })).rejects.toThrow(/plan/i);
    await expect(updatePlan(KEY, { ...base, modules: [], priceMxn: -5 })).rejects.toThrow(/plan/i);
    await expect(updatePlan(KEY, { ...base, modules: [], features: Array.from({ length: 20 }, () => ({ es: "x", en: "x" })) })).rejects.toThrow(/plan/i);
    await expect(updatePlan("no-existe", { ...base, modules: [] })).rejects.toThrow(/no encontrado/i);
    await expect(createPlan({ ...base, modules: [], key: "Mala Llave" })).rejects.toThrow(/llave/i);
    await expect(createPlan({ ...base, modules: [], key: KEY })).rejects.toThrow(/Ya existe/i);
  });
});
