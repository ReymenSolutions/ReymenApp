// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { afterEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { runAiCall } from "./gateway";
import { setAnthropicClientForTests } from "./providers/anthropic";
let organizationId: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); setAnthropicClientForTests(null);
  if (organizationId) { await cleanupOrg(organizationId); organizationId = undefined; }
  await prisma.aiRate.deleteMany({ where: { source: "test-atomic-settlement" } });
});
it("rolls back ledger settlement if releasing its reservation fails, leaving no partial financial state", async () => {
  const org = await createTestOrg("Atomic settlement fixture"); organizationId = org.id;
  const model = `settlement-${randomUUID()}`;
  vi.stubEnv("AI_PROVIDER", "anthropic"); vi.stubEnv("AI_DRAFT_MODEL", model);
  await prisma.aiRate.create({ data: { provider: "anthropic", model, currency: "MXN", inputPerMTok: 0, outputPerMTok: 1000, effectiveFrom: new Date("2020-01-01Z"), source: "test-atomic-settlement" } });
  setAnthropicClientForTests({ beta: { messages: { create: vi.fn().mockResolvedValue({ id: "fixture", model, stop_reason: "end_turn", content: [{ type: "text", text: "fixture" }], usage: { input_tokens: 0, output_tokens: 100 } }) } } } as never);
  const transact = prisma.$transaction.bind(prisma) as (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>;
  const injected = new Error("fixture-release-failure");
  vi.spyOn(prisma.aiBudgetReservation, "updateMany").mockRejectedValue(injected);
  vi.spyOn(prisma, "$transaction").mockImplementation(((work: (tx: Prisma.TransactionClient) => Promise<unknown>) => transact(async tx => work(new Proxy(tx, { get(target, property) {
    if (property !== "aiBudgetReservation") return Reflect.get(target, property);
    return new Proxy(target.aiBudgetReservation, { get(delegate, method) {
      if (method === "updateMany") return async () => { throw injected; };
      return Reflect.get(delegate, method);
    } });
  } })))) as typeof prisma.$transaction);
  await expect(runAiCall({ organizationId: org.id, agentKey: "inbox:webchat", operation: "draft", origin: "webchat", requestId: "settlement-fixture" }, { system: "fixture", messages: [{ role: "user", content: "fixture" }], maxOutputTokens: 100 })).rejects.toThrow("fixture-release-failure");
  const usage = await prisma.aiUsage.findUniqueOrThrow({ where: { organizationId_requestId: { organizationId: org.id, requestId: "settlement-fixture" } } });
  expect(usage.status).toBe("PENDING"); expect(usage.costMxn).toBeNull();
  expect((await prisma.aiBudgetReservation.findUniqueOrThrow({ where: { usageId: usage.id } })).released).toBe(false);
});
