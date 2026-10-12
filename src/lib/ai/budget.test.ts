// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const notifyAdmins = vi.fn().mockResolvedValue(undefined);
const sendEmail = vi.fn().mockResolvedValue({ sent: true });
vi.mock("@/lib/admin-notifications", () => ({ notifyAdmins: (...a: unknown[]) => notifyAdmins(...a) }));
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const { runAiCall } = await import("./gateway");
const { setAnthropicClientForTests } = await import("./providers/anthropic");
const { billingCycle, getBudgetState, isBudgetBlocked, extendBudget, resetBudget, applyTopup, creditBudget, setMonthlyBudget, setBudgetPolicy, AiBudgetError } = await import("./budget");
const { evaluateBudgetAlerts } = await import("./budget-alerts");
const { getAgentStatuses } = await import("./agent-status");

const MODEL = "bud-model";
const input = { system: "s", messages: [{ role: "user" as const, content: "hola" }], maxOutputTokens: 100 };
// Cada llamada cuesta exactamente $0.10 MXN (100 tokens de salida a $1,000 MXN por millón, entrada gratis) y el peor caso estimado es el mismo.
const response = { id: "m1", model: MODEL, stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 0, output_tokens: 100 } };

describe("ciclo de facturación (puro)", () => {
  const tz = "America/Mexico_City";
  it("el ciclo empieza el día ancla a medianoche del negocio y termina donde empieza el siguiente", () => {
    const anchor = new Date("2026-03-15T20:00:00Z");
    const mid = billingCycle(anchor, tz, new Date("2026-10-20T12:00:00Z"));
    expect(mid.start.toISOString()).toBe("2026-10-15T06:00:00.000Z");
    expect(mid.end.toISOString()).toBe("2026-11-15T06:00:00.000Z");
    const before = billingCycle(anchor, tz, new Date("2026-10-10T12:00:00Z"));
    expect(before.start.toISOString()).toBe("2026-09-15T06:00:00.000Z");
    expect(before.end.getTime()).toBe(mid.start.getTime()); // sin huecos ni traslapes
    // Cambio de año.
    expect(billingCycle(anchor, tz, new Date("2027-01-05T12:00:00Z")).start.toISOString()).toBe("2026-12-15T06:00:00.000Z");
    // Un ancla del día 31 se trata como 28: ningún mes la pierde.
    expect(billingCycle(new Date("2026-01-31T12:00:00Z"), tz, new Date("2026-02-28T12:00:00Z")).start.toISOString()).toBe("2026-02-28T06:00:00.000Z");
  });
});

describe("Hard Budget Limit por tenant", () => {
  let a: { id: string };
  let b: { id: string };
  const create = vi.fn();
  const ctx = (orgId: string, n: string) => ({ organizationId: orgId, agentKey: "inbox:whatsapp", operation: "draft", origin: "whatsapp", requestId: `req-${n}` });
  const call = (orgId: string, n: string) => runAiCall(ctx(orgId, n), input);
  const usage = (orgId: string) => prisma.aiUsage.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    a = await createTestOrg("Budget A");
    b = await createTestOrg("Budget B");
    await prisma.aiRate.create({ data: { provider: "anthropic", model: MODEL, currency: "MXN", inputPerMTok: 0, outputPerMTok: 1000, effectiveFrom: new Date("2020-01-01"), source: "test-budget" } });
    await prisma.aiRate.create({ data: { provider: "anthropic", model: "bud-cheap", currency: "MXN", inputPerMTok: 0, outputPerMTok: 100, effectiveFrom: new Date("2020-01-01"), source: "test-budget" } });
  });
  afterAll(async () => {
    await prisma.aiRate.deleteMany({ where: { source: "test-budget" } });
    for (const o of [a, b]) {
      await prisma.aiBudgetAdjustment.deleteMany({ where: { organizationId: o.id } });
      await cleanupOrg(o.id);
    }
  });
  beforeEach(async () => {
    create.mockReset();
    create.mockResolvedValue(response);
    notifyAdmins.mockClear();
    sendEmail.mockClear();
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("AI_DRAFT_MODEL", MODEL);
    setAnthropicClientForTests({ beta: { messages: { create } } } as never);
    for (const o of [a, b]) {
      await prisma.aiUsage.deleteMany({ where: { organizationId: o.id } });
      await prisma.aiBudgetAdjustment.deleteMany({ where: { organizationId: o.id } });
      await prisma.aiBudgetAlert.deleteMany({ where: { organizationId: o.id } });
      await prisma.aiBudgetReservation.deleteMany({ where: { organizationId: o.id } });
      await prisma.aiBudgetSetting.deleteMany({ where: { organizationId: o.id } });
      await prisma.auditLog.deleteMany({ where: { organizationId: o.id } });
    }
    await setMonthlyBudget(a.id, 0.35, "admin1");
    await setMonthlyBudget(b.id, 0.35, "admin1");
  });
  afterEach(() => {
    setAnthropicClientForTests(null);
    vi.unstubAllEnvs();
  });

  it("sin configuración rige el presupuesto de su plan (nunca ilimitado)", async () => {
    await prisma.aiBudgetSetting.deleteMany({ where: { organizationId: a.id } });
    const state = await getBudgetState(a.id);
    expect(state).toMatchObject({ source: "plan", baseMxn: 75, policy: "BLOCK", status: "OK" });
  });

  it("al agotarse el presupuesto bloquea las llamadas nuevas de ESE tenant: no llama al modelo, queda BLOCKED y avisa al 100 %", async () => {
    for (const n of ["1", "2", "3"]) await call(a.id, n);
    expect(create).toHaveBeenCalledTimes(3);
    expect((await getBudgetState(a.id)).spentMxn).toBeCloseTo(0.3, 6);
    await expect(call(a.id, "4")).rejects.toMatchObject({ name: "AiBudgetError", code: "BUDGET_EXHAUSTED" });
    expect(create).toHaveBeenCalledTimes(3); // la bloqueada no llamó al proveedor
    expect((await usage(a.id)).pop()).toMatchObject({ status: "BLOCKED", errorCode: "BUDGET_EXHAUSTED" });
    expect(await isBudgetBlocked(a.id)).toBe(true);
    expect(await prisma.aiBudgetAlert.findFirst({ where: { organizationId: a.id, threshold: 100 } })).not.toBeNull();
    expect(notifyAdmins).toHaveBeenCalled();
    // El historial queda intacto y el consumo no creció por lo bloqueado.
    expect((await getBudgetState(a.id)).spentMxn).toBeCloseTo(0.3, 6);
  });

  it("aislamiento: el bloqueo de un tenant no afecta a otro", async () => {
    for (const n of ["1", "2", "3"]) await call(a.id, n);
    await expect(call(a.id, "4")).rejects.toBeInstanceOf(AiBudgetError);
    expect(await isBudgetBlocked(b.id)).toBe(false);
    await expect(call(b.id, "1")).resolves.toMatchObject({ text: "ok" });
    expect((await getBudgetState(b.id)).spentMxn).toBeCloseTo(0.1, 6);
    expect((await getBudgetState(a.id)).spentMxn).toBeCloseTo(0.3, 6);
  });

  it("concurrencia: solicitudes simultáneas nunca suman más de lo disponible", async () => {
    create.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 30)); return response; });
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => call(a.id, `p${i}`)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const blocked = results.filter((r) => r.status === "rejected" && (r.reason as Error).name === "AiBudgetError").length;
    expect(ok).toBe(3); // 3 × 0.10 ≤ 0.35 < 4 × 0.10
    expect(blocked).toBe(7);
    expect(create).toHaveBeenCalledTimes(3);
    const state = await getBudgetState(a.id);
    expect(state.spentMxn).toBeLessThanOrEqual(0.35);
    expect(state.reservedMxn).toBe(0); // todas las reservas se liberaron
  });

  it("sin forma de calcular el costo (sin tarifa) no se llama: nunca gasto sin medir", async () => {
    vi.stubEnv("AI_DRAFT_MODEL", "modelo-sin-tarifa");
    await expect(call(a.id, "x")).rejects.toMatchObject({ code: "NO_RATE" });
    expect(create).not.toHaveBeenCalled();
  });

  it("renovación mensual: el ciclo nuevo arranca en cero, los ajustes del ciclo anterior no pasan y el historial se conserva", async () => {
    const before = await getBudgetState(a.id);
    for (const n of ["1", "2", "3"]) await call(a.id, n);
    await extendBudget(a.id, 5, "excepción del mes", "admin1");
    const inCycle = await getBudgetState(a.id);
    expect(inCycle).toMatchObject({ adjustmentsMxn: 5 });
    expect(inCycle.spentMxn).toBeCloseTo(0.3, 6);
    const nextNow = new Date(before.cycleEnd.getTime() + 3600_000);
    const next = await getBudgetState(a.id, nextNow);
    expect(next.cycleStart.getTime()).toBe(before.cycleEnd.getTime());
    expect(next).toMatchObject({ spentMxn: 0, adjustmentsMxn: 0, availableMxn: 0.35, status: "OK" });
    // Historial intacto: el consumo y el ajuste del ciclo anterior siguen consultables.
    expect(await prisma.aiUsage.count({ where: { organizationId: a.id, status: "SUCCEEDED" } })).toBe(3);
    expect(await prisma.aiBudgetAdjustment.count({ where: { organizationId: a.id } })).toBe(1);
    // Una denegación del ciclo anterior no bloquea el nuevo.
    await prisma.aiUsage.create({ data: { organizationId: a.id, operation: "draft", origin: "x", provider: "anthropic", model: MODEL, requestId: "old-denial", status: "BLOCKED", errorCode: "BUDGET_EXHAUSTED", createdAt: before.cycleStart } });
    expect(await isBudgetBlocked(a.id, nextNow)).toBe(false);
  });

  it("desbloqueo: ampliar, restablecer o una recarga válida devuelven la capacidad; la recarga es idempotente", async () => {
    for (const n of ["1", "2", "3"]) await call(a.id, n);
    await expect(call(a.id, "4")).rejects.toBeInstanceOf(AiBudgetError);
    expect(await isBudgetBlocked(a.id)).toBe(true);

    // Recarga pagada y confirmada (mismo pago repetido = una sola vez).
    expect(await applyTopup(a.id, 0.5, "pago_123", "Recarga Starter")).toEqual({ applied: true });
    expect(await applyTopup(a.id, 0.5, "pago_123", "Recarga Starter (reintento del webhook)")).toEqual({ applied: false });
    expect((await getBudgetState(a.id)).adjustmentsMxn).toBe(0.5);
    expect(await isBudgetBlocked(a.id)).toBe(false);
    await expect(call(a.id, "5")).resolves.toMatchObject({ text: "ok" });

    // Agotar otra vez y restablecer: queda otra vez el presupuesto base completo.
    for (const n of ["6", "7", "8", "9", "10", "11", "12"]) await call(a.id, n).catch(() => undefined);
    const exhausted = await getBudgetState(a.id);
    const reset = await resetBudget(a.id, "cortesía comercial", "admin1");
    expect(reset.state.remainingMxn).toBeCloseTo(0.35, 6);
    expect(exhausted.remainingMxn).toBeLessThan(0.1);
    // Un asiento compensatorio corrige un error sin editar nada.
    const credit = await creditBudget(a.id, -0.1, "corrección", "admin1");
    expect(credit.state.remainingMxn).toBeCloseTo(0.25, 6);
    expect(await prisma.aiBudgetAdjustment.count({ where: { organizationId: a.id } })).toBeGreaterThanOrEqual(3);
  });

  it("alertas 50/75/90/100 %: una por umbral y ciclo, aunque se evalúen muchas veces o a la vez; avisos a admins (≥75) y a dueños (≥90)", async () => {
    await prisma.user.create({ data: { organizationId: a.id, name: "Dueña", email: `owner-${a.id}@x.mx`, role: "OWNER", isActive: true, passwordHash: "x" } as never });
    const seed = (n: string, cost: number) => prisma.aiUsage.create({ data: { organizationId: a.id, operation: "draft", origin: "x", provider: "anthropic", model: MODEL, requestId: `seed-${n}`, status: "SUCCEEDED", costMxn: cost } });
    await seed("1", 0.18); // 51 %
    expect(await evaluateBudgetAlerts(a.id)).toEqual([50]);
    await seed("2", 0.09); // 77 %
    expect(await evaluateBudgetAlerts(a.id)).toEqual([75]);
    await seed("3", 0.05); // 91 %
    const concurrent = await Promise.all([evaluateBudgetAlerts(a.id), evaluateBudgetAlerts(a.id), evaluateBudgetAlerts(a.id)]);
    expect(concurrent.flat()).toEqual([90]); // un solo ganador
    await seed("4", 0.05); // 105 %
    expect(await evaluateBudgetAlerts(a.id)).toEqual([100]);
    expect(await evaluateBudgetAlerts(a.id)).toEqual([]);
    expect(await prisma.aiBudgetAlert.count({ where: { organizationId: a.id } })).toBe(4);
    expect(notifyAdmins).toHaveBeenCalledTimes(3); // 75, 90, 100
    expect(sendEmail).toHaveBeenCalledTimes(2); // dueños: 90 y 100
    expect(await prisma.auditLog.count({ where: { organizationId: a.id, action: "ai.budget_alert" } })).toBe(4);
  });

  it("política DEGRADE solo con modelo económico con tarifa, autorizada y con tope; BLOCK por defecto", async () => {
    await expect(setBudgetPolicy(a.id, { policy: "DEGRADE", provider: "anthropic", model: "sin-tarifa", capMxn: 1 }, "admin1")).rejects.toBeInstanceOf(AiBudgetError);
    expect((await getBudgetState(a.id)).policy).toBe("BLOCK");
    for (const n of ["1", "2", "3"]) await call(a.id, n);
    await setBudgetPolicy(a.id, { policy: "DEGRADE", provider: "anthropic", model: "bud-cheap", capMxn: 0.05 }, "admin1");
    create.mockResolvedValue({ ...response, model: "bud-cheap" });
    // Agotado el presupuesto: sigue con el modelo económico (100 tokens × $100/M = $0.01), hasta el tope extra ($0.05).
    const served: string[] = [];
    for (let i = 0; i < 14; i++) {
      const r = await call(a.id, `d${i}`).catch((e) => e);
      served.push(r instanceof AiBudgetError ? "blocked" : "ok");
    }
    // 0.30 gastado; el modelo caro (0.10) ya no cabe, el económico (0.01) sí, hasta 0.35 + 0.05 de tope = 10 llamadas.
    expect(served.filter((s) => s === "ok").length).toBe(10);
    expect(served[served.length - 1]).toBe("blocked");
    const rows = await usage(a.id);
    expect(rows.filter((r) => r.model === "bud-cheap").length).toBeGreaterThanOrEqual(1);
    expect((await getBudgetState(a.id)).spentMxn).toBeLessThanOrEqual(0.35 + 0.05 + 1e-9);
    // Volver a BLOCK borra la autorización.
    await setBudgetPolicy(a.id, { policy: "BLOCK" }, "admin1");
    expect(await prisma.aiBudgetSetting.findUnique({ where: { organizationId: a.id } })).toMatchObject({ policy: "BLOCK", fallbackModel: null, policyAuthorizedById: null });
  });

  it("estado de los agentes: apagado manual (configuración) y bloqueado por presupuesto (temporal) se distinguen, sin tocar la configuración", async () => {
    await prisma.agentChannelSetting.upsert({ where: { organizationId_channel: { organizationId: a.id, channel: "instagram" } }, create: { organizationId: a.id, channel: "instagram", mode: "OFF" }, update: { mode: "OFF" } });
    let status = await getAgentStatuses(a.id);
    expect(status.blocked).toBe(false);
    expect(status.agents.find((x) => x.agentKey === "inbox:whatsapp")?.runtime).toBe("ACTIVE");
    for (const n of ["1", "2", "3"]) await call(a.id, n);
    await call(a.id, "4").catch(() => undefined);
    status = await getAgentStatuses(a.id);
    expect(status.blocked).toBe(true);
    expect(status.agents.find((x) => x.agentKey === "inbox:whatsapp")).toMatchObject({ runtime: "BUDGET_EXHAUSTED", configuredMode: "SUGGEST" });
    expect(status.agents.find((x) => x.agentKey === "inbox:instagram")).toMatchObject({ runtime: "OFF_MANUAL", configuredMode: "OFF" });
    expect(status.agents.find((x) => x.agentKey === "pipeline")?.runtime).toBe("BUDGET_EXHAUSTED");
    // La configuración de los agentes sigue intacta durante el bloqueo.
    expect((await prisma.agentChannelSetting.findUnique({ where: { organizationId_channel: { organizationId: a.id, channel: "instagram" } } }))?.mode).toBe("OFF");
    // Al ampliar, vuelven solos.
    await extendBudget(a.id, 1, "excepción", "admin1");
    expect((await getAgentStatuses(a.id)).agents.find((x) => x.agentKey === "inbox:whatsapp")?.runtime).toBe("ACTIVE");
  });
});
