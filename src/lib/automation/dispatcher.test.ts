// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { verifyWebhookSignature, isTimestampFresh } from "@/lib/webhook-validator";
import { dispatchPendingExecutions, callbackToken, verifyCallbackToken, DISPATCH_BACKOFF_MINUTES, DISPATCH_MAX_ATTEMPTS } from "./dispatcher";
import { applyExecutionCallback } from "./callback";

const SECRET = "test-n8n-secret";

describe("despachador y callback de n8n", () => {
  let org: { id: string };
  let automationId: string;
  let eventId: string;
  const NOW = new Date("2030-10-06T21:00:00Z");

  const makeExecution = (extra: Record<string, unknown> = {}) =>
    prisma.automationExecution.create({
      data: {
        organizationId: org.id,
        automationId,
        domainEventId: eventId,
        subjectType: "customer",
        subjectId: "c1",
        status: "PENDING",
        action: { type: "message", channel: "whatsapp", templateKey: "welcome_new_customer_v1", variables: { name: "Ana" }, recipient: { phone: "+525540000001", name: "Ana" } },
        createdAt: NOW,
        ...extra,
      },
    });
  const reset = async () => {
    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
    const ev = await prisma.domainEvent.create({ data: { organizationId: org.id, type: "customer.created", subjectType: "customer", subjectId: "c1", occurredAt: NOW, dedupeKey: `d-${Math.random()}`, correlationId: "O-1" } });
    eventId = ev.id;
  };
  const okFetch = () => vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

  beforeAll(async () => {
    org = await createTestOrg("Dispatcher Org");
    const a = await prisma.automation.create({ data: { organizationId: org.id, name: "Bienvenida", type: "blueprint", webhookSecret: "s", blueprintKey: "welcome_new_customer", blueprintVersion: 1, trigger: "customer.created", dryRun: false } });
    automationId = a.id;
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });
  beforeEach(async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("N8N_BASE_URL", "http://n8n.test");
    await prisma.automation.update({ where: { id: automationId }, data: { dryRun: false, status: "ACTIVE" } });
    await reset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("envía firmado, con el contrato y marca DISPATCHED", async () => {
    const ex = await makeExecution();
    const fetchImpl = okFetch();
    const res = await dispatchPendingExecutions({ now: NOW, fetchImpl, organizationId: org.id });
    expect(res).toMatchObject({ dispatched: 1, retried: 0, failed: 0 });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit & { headers: Record<string, string>; body: string }];
    expect(url).toBe("http://n8n.test/webhook/reymen-action-message");
    expect(isTimestampFresh(String(Date.now()))).toBe(true);
    expect(verifyWebhookSignature(init.body, init.headers["X-Reymen-Signature"], SECRET, init.headers["X-Reymen-Timestamp"])).toBe(true);
    expect(init.headers["X-Reymen-Event-Id"]).toBe(`${ex.id}:1`);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      specVersion: "1.0",
      type: "action.message.send",
      organization: { id: org.id },
      automation: { blueprintKey: "welcome_new_customer" },
      execution: { id: ex.id, attempt: 1, dryRun: false },
      trigger: { eventType: "customer.created", correlationId: "O-1" },
      recipient: { channel: "whatsapp", phone: "+525540000001" },
      content: { templateKey: "welcome_new_customer_v1", variables: { name: "Ana" } },
    });
    expect(body.callback.token).toBe(callbackToken(ex.id, SECRET));
    expect(body.callback.url).toMatch(/\/api\/webhooks\/n8n\/automation-executions$/);
    expect(await prisma.automationExecution.findUniqueOrThrow({ where: { id: ex.id } })).toMatchObject({ status: "DISPATCHED", attempts: 1, lastError: null });
  });

  it("n8n caído: reintenta con backoff y al agotarse queda FAILED", async () => {
    const ex = await makeExecution();
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    let now = NOW;
    for (let i = 1; i < DISPATCH_MAX_ATTEMPTS; i++) {
      expect(await dispatchPendingExecutions({ now, fetchImpl: down, organizationId: org.id })).toMatchObject({ retried: 1 });
      const row = await prisma.automationExecution.findUniqueOrThrow({ where: { id: ex.id } });
      expect(row).toMatchObject({ status: "PENDING", attempts: i, lastError: "ECONNREFUSED" });
      expect(row.nextAttemptAt!.getTime()).toBe(now.getTime() + DISPATCH_BACKOFF_MINUTES[i - 1] * 60_000);
      // Antes de que toque no se vuelve a intentar.
      expect(await dispatchPendingExecutions({ now, fetchImpl: down, organizationId: org.id })).toMatchObject({ retried: 0, dispatched: 0 });
      now = new Date(row.nextAttemptAt!.getTime() + 1);
      // Mantener el mensaje vigente (deadline de 24 h) para probar solo el backoff.
      await prisma.automationExecution.update({ where: { id: ex.id }, data: { createdAt: now } });
    }
    expect(await dispatchPendingExecutions({ now, fetchImpl: down, organizationId: org.id })).toMatchObject({ failed: 1 });
    expect(await prisma.automationExecution.findUniqueOrThrow({ where: { id: ex.id } })).toMatchObject({ status: "FAILED", attempts: DISPATCH_MAX_ATTEMPTS });
  });

  it("respuesta no 2xx cuenta como fallo", async () => {
    await makeExecution();
    const bad = vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    expect(await dispatchPendingExecutions({ now: NOW, fetchImpl: bad, organizationId: org.id })).toMatchObject({ retried: 1 });
    expect((await prisma.automationExecution.findFirstOrThrow({ where: { organizationId: org.id } })).lastError).toBe("n8n returned 500");
  });

  it("no envía si la automatización volvió a simulación o se pausó, ni sin n8n configurado", async () => {
    await makeExecution();
    const fetchImpl = okFetch();
    await prisma.automation.update({ where: { id: automationId }, data: { dryRun: true } });
    await dispatchPendingExecutions({ now: NOW, fetchImpl, organizationId: org.id });
    await prisma.automation.update({ where: { id: automationId }, data: { dryRun: false, status: "PAUSED" } });
    await dispatchPendingExecutions({ now: NOW, fetchImpl, organizationId: org.id });
    expect(fetchImpl).not.toHaveBeenCalled();

    await prisma.automation.update({ where: { id: automationId }, data: { status: "ACTIVE" } });
    vi.stubEnv("N8N_WEBHOOK_SECRET", "");
    expect(await dispatchPendingExecutions({ now: NOW, fetchImpl, organizationId: org.id })).toMatchObject({ skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await prisma.automationExecution.findFirstOrThrow({ where: { organizationId: org.id } })).status).toBe("PENDING");
  });

  it("un mensaje con más de 24 h sin salir se omite", async () => {
    const ex = await makeExecution({ createdAt: new Date(NOW.getTime() - 25 * 3_600_000) });
    const fetchImpl = okFetch();
    expect(await dispatchPendingExecutions({ now: NOW, fetchImpl, organizationId: org.id })).toMatchObject({ expired: 1 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await prisma.automationExecution.findUniqueOrThrow({ where: { id: ex.id } })).toMatchObject({ status: "SKIPPED", skipReason: "expired" });
  });

  it("callback: token inválido, transición y repetición idempotente", async () => {
    const ex = await makeExecution({ status: "DISPATCHED" });
    expect(verifyCallbackToken(ex.id, "x")).toBe(false);
    expect(await applyExecutionCallback({ executionId: ex.id, token: "mal", status: "sent" })).toEqual({ ok: false, reason: "invalid_token" });
    expect(await applyExecutionCallback({ executionId: "nope", token: callbackToken("nope", SECRET), status: "sent" })).toEqual({ ok: false, reason: "not_found" });

    const token = callbackToken(ex.id, SECRET);
    expect(await applyExecutionCallback({ executionId: ex.id, token, status: "delivered", providerMessageId: "wamid.1" }, NOW)).toEqual({ ok: true, changed: true, status: "SUCCEEDED" });
    expect(await prisma.automationExecution.findUniqueOrThrow({ where: { id: ex.id } })).toMatchObject({ status: "SUCCEEDED", providerMessageId: "wamid.1", completedAt: NOW });
    // Un callback repetido (o contradictorio) no cambia nada.
    expect(await applyExecutionCallback({ executionId: ex.id, token, status: "failed", error: "x" })).toEqual({ ok: true, changed: false, status: "SUCCEEDED" });
    expect((await prisma.automation.findUniqueOrThrow({ where: { id: automationId } })).lastStatus).toBe("SUCCEEDED");
  });

  it("callback failed y skipped", async () => {
    const a = await makeExecution({ status: "DISPATCHED" });
    expect(await applyExecutionCallback({ executionId: a.id, token: callbackToken(a.id, SECRET), status: "failed", error: "número inválido" })).toMatchObject({ status: "FAILED" });
    expect((await prisma.automationExecution.findUniqueOrThrow({ where: { id: a.id } })).lastError).toBe("número inválido");
    const ev2 = await prisma.domainEvent.create({ data: { organizationId: org.id, type: "customer.created", subjectType: "customer", subjectId: "c2", occurredAt: NOW, dedupeKey: `d2-${Math.random()}` } });
    const b = await makeExecution({ status: "DISPATCHED", domainEventId: ev2.id });
    expect(await applyExecutionCallback({ executionId: b.id, token: callbackToken(b.id, SECRET), status: "skipped" })).toMatchObject({ status: "SKIPPED" });
    expect((await prisma.automationExecution.findUniqueOrThrow({ where: { id: b.id } })).skipReason).toBe("provider_skipped");
  });
});
