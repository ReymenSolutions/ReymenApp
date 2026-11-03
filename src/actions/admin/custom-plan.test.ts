// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/smartcard-link", async (orig) => ({ ...(await orig<typeof import("@/lib/smartcard-link")>()), syncSmartcardMemberLimitForPlan: vi.fn().mockResolvedValue("updated") }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN" }));

const { saveCustomPlan, removeCustomPlan, getCustomPlanState, listCustomPlanClients, createPlan } = await import("./plans");
const { changePlan } = await import("./clients");
const { setOrgAgentsCap } = await import("./ai-budget");
const { assertPlanCapacity } = await import("@/lib/plan-limits");
const { getAgentCap } = await import("@/lib/agent-cap");
const { getBudgetState } = await import("@/lib/ai/budget");
const { getOrgLimits, limitsFor } = await import("@/lib/plans");

const KEY = "qa-custom-base";
const basePlan = { name: "Base QA", nameEn: "QA Base", description: "", descriptionEn: "", priceMxn: 900, maxLeads: 50, maxUsers: 2, maxAutomations: 1, aiBudgetMxn: 30, maxAiAgents: 1, modules: ["CRM"] as ("CRM")[], features: [], stripePriceId: null, accent: "slate" as const, sortOrder: 95, isActive: true };
const admin = () => authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
const input = (orgId: string, over: Partial<Parameters<typeof saveCustomPlan>[0]> = {}) => ({
  orgId, basePlan: KEY, priceMxn: 4321, aiBudgetMxn: 250, modules: ["CRM", "AUTOMATIONS", "AI_WHATSAPP"] as ("CRM" | "AUTOMATIONS" | "AI_WHATSAPP")[],
  limits: { leads: 1000, users: 1, automations: 0, aiAgents: 3 }, ...over,
});

describe("Plan «A la medida» (Custom Service) por cliente", () => {
  let org: { id: string };

  beforeAll(async () => {
    admin();
    await prisma.plan.deleteMany({ where: { key: KEY } });
    await createPlan({ ...basePlan, key: KEY });
    org = await createTestOrg("Custom Plan Org");
    await changePlan(org.id, KEY);
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await prisma.plan.deleteMany({ where: { key: KEY } });
  });

  it("limitsFor: sin A la medida usa el plan (y el tope pactado de agentes); con A la medida, los suyos (null = ilimitado)", () => {
    const plan = { limits: { leads: 50, users: 2, automations: 1 }, maxAiAgents: 1 } as never;
    const org = { plan: KEY, customPlan: false, customMaxLeads: 9, customMaxUsers: 9, customMaxAutomations: 9, customMaxAiAgents: 9, aiAgentsCapOverride: null };
    expect(limitsFor(org, plan)).toMatchObject({ custom: false, leads: 50, users: 2, automations: 1, aiAgents: 1, aiAgentsSource: "plan" });
    expect(limitsFor({ ...org, aiAgentsCapOverride: 4 }, plan)).toMatchObject({ aiAgents: 4, aiAgentsSource: "override" });
    expect(limitsFor({ ...org, customPlan: true, customMaxLeads: null }, plan)).toMatchObject({ custom: true, leads: null, users: 9, automations: 9, aiAgents: 9, aiAgentsSource: "custom" });
  });

  it("solo un admin de la plataforma configura A la medida", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));
    await expect(saveCustomPlan(input(org.id))).rejects.toThrow(/autorizado/i);
    await expect(getCustomPlanState(org.id)).rejects.toThrow(/autorizado/i);
    await expect(removeCustomPlan(org.id)).rejects.toThrow(/autorizado/i);
  });

  it("guarda módulos (interruptores), cantidades (contadores), presupuesto de IA y precio, y todo lo conectado los respeta", async () => {
    admin();
    const out = await saveCustomPlan(input(org.id));
    expect(out.success).toBe(true);

    const row = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(row).toMatchObject({ customPlan: true, plan: KEY, customMaxLeads: 1000, customMaxUsers: 1, customMaxAutomations: 0, customMaxAiAgents: 3 });
    expect(Number(row.customMonthlyPriceMxn)).toBe(4321);

    const active = (await prisma.organizationModule.findMany({ where: { organizationId: org.id, status: "ACTIVE" } })).map((m) => m.module).sort();
    expect(active).toEqual(["AI_WHATSAPP", "AUTOMATIONS", "CRM"]);

    expect(await getOrgLimits(org.id)).toMatchObject({ custom: true, leads: 1000, users: 1, automations: 0, aiAgents: 3 });
    // 0 automatizaciones pactadas: bloquea crear una; los leads usan su propio tope, no el del plan base (50).
    await expect(assertPlanCapacity(org.id, "automations")).rejects.toThrow(/automatizaciones/);
    await expect(assertPlanCapacity(org.id, "leads")).resolves.toBeUndefined();
    expect(await getAgentCap(org.id)).toMatchObject({ cap: 3, source: "custom" });
    expect((await getBudgetState(org.id)).baseMxn).toBe(250);

    const listed = (await listCustomPlanClients()).find((c) => c.id === org.id);
    expect(listed).toMatchObject({ customPlan: true, priceMxn: 4321, limits: { leads: 1000, users: 1, automations: 0, aiAgents: 3 } });

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "client.custom_plan", organizationId: org.id }, orderBy: { createdAt: "desc" } });
    expect(audit.metadata).toMatchObject({ after: { priceMxn: 4321, limits: { aiAgents: 3 } } });
  });

  it("apagar un módulo lo cancela (sin borrar su historial) y encenderlo lo reactiva; «ilimitado» no bloquea", async () => {
    admin();
    await saveCustomPlan(input(org.id, { modules: ["CRM"], limits: { leads: null, users: null, automations: null, aiAgents: null } }));
    const ai = await prisma.organizationModule.findUniqueOrThrow({ where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } } });
    expect(ai.status).toBe("CANCELLED");
    await expect(assertPlanCapacity(org.id, "automations")).resolves.toBeUndefined();
    expect(await getAgentCap(org.id)).toMatchObject({ cap: null, source: "custom" });

    await saveCustomPlan(input(org.id, { modules: ["CRM", "AI_WHATSAPP"] }));
    const again = await prisma.organizationModule.findUniqueOrThrow({ where: { id: ai.id } });
    expect(again).toMatchObject({ status: "ACTIVE", cancelledAt: null });
  });

  it("valida: precio > 0, Reymen POS necesita Foods y cantidades dentro de rango", async () => {
    admin();
    await expect(saveCustomPlan(input(org.id, { priceMxn: 0 }))).rejects.toThrow(/precio/i);
    await expect(saveCustomPlan(input(org.id, { modules: ["REYMEN_POS"] }))).rejects.toThrow(/Foods/);
    await expect(saveCustomPlan(input(org.id, { limits: { leads: -1, users: 1, automations: 1, aiAgents: 1 } }))).rejects.toThrow(/cantidades/i);
    await expect(saveCustomPlan(input(org.id, { basePlan: "no-existe" }))).rejects.toThrow(/Plan base/);
  });

  it("su tope de agentes no se cambia desde Presupuesto de IA: se ajusta en A la medida", async () => {
    admin();
    await expect(setOrgAgentsCap({ orgId: org.id, cap: 9, reason: "Prueba de tope" })).rejects.toThrow(/A la medida/);
  });

  it("quitar A la medida (o elegir un plan del catálogo) devuelve los límites, el precio y el presupuesto del plan base", async () => {
    admin();
    await saveCustomPlan(input(org.id));
    await removeCustomPlan(org.id);
    const row = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(row).toMatchObject({ customPlan: false, customMonthlyPriceMxn: null, customMaxLeads: null, customMaxAiAgents: null });
    expect(await getOrgLimits(org.id)).toMatchObject({ custom: false, leads: 50, users: 2, automations: 1, aiAgents: 1 });
    expect((await getBudgetState(org.id)).baseMxn).toBe(30);

    await saveCustomPlan(input(org.id));
    await changePlan(org.id, KEY);
    expect(await getOrgLimits(org.id)).toMatchObject({ custom: false, leads: 50 });
  });
});
