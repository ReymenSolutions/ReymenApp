// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (r: string) => r === "SUPER_ADMIN" || r === "ADMIN" }));

const { getOrganizationExecutions, retryExecution } = await import("./executions");
const { retryEligibility } = await import("@/lib/automation/retry");

describe("retryEligibility (puro)", () => {
  const ok = { status: "FAILED" as const, providerMessageId: null, action: { type: "message" } };
  const auto = { status: "ACTIVE", dryRun: false };
  it("solo una fallida, de mensaje, sin id de proveedor, activa, en envío real y con consentimiento", () => {
    expect(retryEligibility(ok, auto, { consentAccepted: true })).toEqual({ allowed: true });
    expect(retryEligibility({ ...ok, status: "SUCCEEDED" as never }, auto, { consentAccepted: true })).toMatchObject({ allowed: false });
    expect(retryEligibility({ ...ok, action: { type: "alert" } }, auto, { consentAccepted: true })).toMatchObject({ allowed: false });
    expect(retryEligibility({ ...ok, providerMessageId: "wamid.1" }, auto, { consentAccepted: true })).toMatchObject({ allowed: false, reason: expect.stringMatching(/duplicar/) });
    expect(retryEligibility(ok, { status: "PAUSED", dryRun: false }, { consentAccepted: true })).toMatchObject({ allowed: false });
    expect(retryEligibility(ok, { status: "ACTIVE", dryRun: true }, { consentAccepted: true })).toMatchObject({ allowed: false });
    expect(retryEligibility(ok, auto, null)).toMatchObject({ allowed: false });
    expect(retryEligibility(ok, auto, { consentAccepted: false })).toMatchObject({ allowed: false, reason: expect.stringMatching(/consentimiento/) });
  });
});

describe("ejecuciones por cliente (admin)", () => {
  let org: { id: string };
  let other: { id: string };
  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
    if (other) await cleanupOrg(other.id);
  });
  const admin = () => authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));

  const seed = async (o: { id: string }, key = "customer_recovery") => {
    const customer = await prisma.customer.create({ data: { organizationId: o.id, phone: `+5255${Math.floor(Math.random() * 1e8)}`, phoneKey: `k${Math.random()}`, name: "Ana", consentAccepted: true } });
    const automation = await prisma.automation.create({ data: { organizationId: o.id, name: key, type: "blueprint", webhookSecret: "s", blueprintKey: key, blueprintVersion: 1, trigger: "customer.at_risk", dryRun: false, config: {} } });
    const event = (type = "customer.at_risk") => prisma.domainEvent.create({ data: { organizationId: o.id, type, subjectType: "customer", subjectId: customer.id, occurredAt: new Date(), dedupeKey: `e-${Math.random()}`, correlationId: "ord-77" } });
    const exec = async (status: "FAILED" | "SUCCEEDED" | "SKIPPED" | "DRY_RUN", extra: Record<string, unknown> = {}) =>
      prisma.automationExecution.create({ data: { organizationId: o.id, automationId: automation.id, domainEventId: (await event()).id, subjectType: "customer", subjectId: customer.id, status, action: { type: "message", channel: "whatsapp", templateKey: "customer_recovery_v1", recipient: { name: "Ana" } }, ...extra } });
    return { customer, automation, exec };
  };

  it("solo un admin puede verlas o reintentar", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: null }));
    await expect(getOrganizationExecutions({ orgId: "x" })).rejects.toThrow(/autorizado/i);
    await expect(retryExecution({ orgId: "x", executionId: "y" })).rejects.toThrow(/autorizado/i);
  });

  it("lista las ejecuciones del cliente con su cadena, filtros, resumen y sin mezclar organizaciones", async () => {
    admin();
    org = await createTestOrg("Executions Org");
    other = await createTestOrg("Executions Other");
    const mine = await seed(org);
    const theirs = await seed(other);
    await mine.exec("FAILED", { lastError: "n8n respondió 500", attempts: 5 });
    const sent = await mine.exec("SUCCEEDED", { providerMessageId: "wamid.9", completedAt: new Date() });
    await mine.exec("SKIPPED", { skipReason: "cooldown" });
    await theirs.exec("FAILED"); // de otro cliente: no debe aparecer
    // Atribución ligada a la ejecución exitosa.
    const touch = await prisma.automationTouch.create({ data: { organizationId: org.id, customerId: mine.customer.id, automationId: mine.automation.id, executionId: sent.id, channel: "whatsapp", touchedAt: new Date() } });
    const sale = await prisma.foodSale.create({ data: { organizationId: org.id, customerId: mine.customer.id, occurredAt: new Date(), grossAmount: 200, netAmount: 172, source: "POS" } });
    await prisma.automationConversion.create({ data: { organizationId: org.id, customerId: mine.customer.id, automationId: mine.automation.id, executionId: sent.id, touchId: touch.id, saleId: sale.id, saleAt: sale.occurredAt, attributedRevenue: 172 } });

    const all = await getOrganizationExecutions({ orgId: org.id });
    expect(all.total).toBe(3);
    expect(all.summary).toMatchObject({ failed: 1, touches: 1, conversions: 1, revenue: 172, byStatus: { FAILED: 1, SUCCEEDED: 1, SKIPPED: 1 } });
    const row = all.rows.find((r) => r.id === sent.id)!;
    expect(row).toMatchObject({ subjectLabel: expect.stringContaining("Ana"), providerMessageId: "wamid.9", event: { type: "customer.at_risk", correlationId: "ord-77" }, conversion: { revenue: 172, reverted: false } });
    expect(row.touchedAt).not.toBeNull();

    const failed = await getOrganizationExecutions({ orgId: org.id, status: "FAILED" });
    expect(failed.rows).toHaveLength(1);
    expect(failed.rows[0]).toMatchObject({ lastError: "n8n respondió 500", retry: { allowed: true } });
    expect((await getOrganizationExecutions({ orgId: org.id, automationId: "otra" })).total).toBe(0);
    // Paginación acotada.
    expect((await getOrganizationExecutions({ orgId: org.id, page: 2 })).rows).toHaveLength(0);
  });

  it("reintenta una fallida: vuelve a la cola con plazo nuevo y queda en la bitácora; dos clics no la duplican", async () => {
    admin();
    org = await createTestOrg("Retry Org");
    const { exec } = await seed(org);
    const failed = await exec("FAILED", { lastError: "timeout", attempts: 5, createdAt: new Date(Date.now() - 3 * 86_400_000) });
    const now = new Date("2030-10-07T21:00:00Z"); // 15:00 CDMX, fuera de horas de silencio
    const res = await retryExecution({ orgId: org.id, executionId: failed.id }, now);
    expect(res.scheduledAt.toISOString()).toBe(now.toISOString());
    const after = await prisma.automationExecution.findUniqueOrThrow({ where: { id: failed.id } });
    expect(after).toMatchObject({ status: "PENDING", attempts: 0, lastError: null });
    expect(after.nextAttemptAt?.toISOString()).toBe(now.toISOString());
    expect((after.action as { sendAfter: string }).sendAfter).toBe(now.toISOString()); // el plazo de 24 h cuenta desde ahora
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "automation.execution_retry" } })).toBe(1);
    await expect(retryExecution({ orgId: org.id, executionId: failed.id }, now)).rejects.toThrow(/fallidas/);
  });

  it("de noche el reintento espera a que terminen las horas de silencio", async () => {
    admin();
    org = await createTestOrg("Retry Quiet Org");
    const { exec } = await seed(org);
    const failed = await exec("FAILED");
    const res = await retryExecution({ orgId: org.id, executionId: failed.id }, new Date("2030-10-07T04:00:00Z")); // 22:00 CDMX
    expect(res.scheduledAt.toISOString()).toBe("2030-10-07T15:00:00.000Z"); // 09:00 CDMX
  });

  it("rechaza lo que no es seguro reintentar y no toca nada", async () => {
    admin();
    org = await createTestOrg("Retry Unsafe Org");
    other = await createTestOrg("Retry Unsafe Other");
    const { exec, customer, automation } = await seed(org);
    const withProviderId = await exec("FAILED", { providerMessageId: "wamid.1" });
    await expect(retryExecution({ orgId: org.id, executionId: withProviderId.id })).rejects.toThrow(/duplicar/);
    const done = await exec("SUCCEEDED");
    await expect(retryExecution({ orgId: org.id, executionId: done.id })).rejects.toThrow(/fallidas/);
    await prisma.customer.update({ where: { id: customer.id }, data: { consentAccepted: false } });
    const noConsent = await exec("FAILED");
    await expect(retryExecution({ orgId: org.id, executionId: noConsent.id })).rejects.toThrow(/consentimiento/);
    await prisma.customer.update({ where: { id: customer.id }, data: { consentAccepted: true } });
    await prisma.automation.update({ where: { id: automation.id }, data: { dryRun: true } });
    const dry = await exec("FAILED");
    await expect(retryExecution({ orgId: org.id, executionId: dry.id })).rejects.toThrow(/simulación/);
    // Otra organización no puede reintentar la de este cliente.
    await prisma.automation.update({ where: { id: automation.id }, data: { dryRun: false } });
    const mine = await exec("FAILED");
    await expect(retryExecution({ orgId: other.id, executionId: mine.id })).rejects.toThrow(/no encontrada/);
    expect((await prisma.automationExecution.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("FAILED");
  });
});
