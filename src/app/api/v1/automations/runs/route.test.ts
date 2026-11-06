// @vitest-environment node
import { expect, it, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { POST } from "./route";
let id = "";
afterAll(async () => { if (id) await cleanupOrg(id); });
it("requires the automation credential and admission before settlement; callbacks do not double count", async () => {
  id = (await createTestOrg("External admission synthetic")).id;
  const a = await prisma.automation.create({ data: { organizationId: id, name: "External", type: "custom", webhookSecret: "only-synthetic" } });
  const call = (action: string, secret = "only-synthetic") => POST(new NextRequest("http://localhost/api/v1/automations/runs", { method: "POST", headers: { "x-reymen-secret": secret }, body: JSON.stringify({ automationId: a.id, executionId: "durable-run-1", action }) }));
  expect((await call("reserve", "other-business-secret")).status).toBe(401);
  expect((await call("succeeded")).status).toBe(409);
  expect((await call("reserve")).status).toBe(200);
  expect((await call("reserve")).status).toBe(200);
  expect((await call("succeeded")).status).toBe(200);
  expect((await call("succeeded")).status).toBe(200);
  expect((await call("failed")).status).toBe(200);
  expect(await prisma.automationUsage.count({ where: { organizationId: id, state: "SUCCEEDED" } })).toBe(1);
  expect((await call("reserve")).status).toBe(409);
});
