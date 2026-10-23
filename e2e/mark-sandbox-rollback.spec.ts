import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
const p = new PrismaClient();
test("Mark sandbox flag rollback preserves the previous tester and sandbox history", async ({ page }) => {
  test.skip(process.env.E2E_MARK_ROLLBACK !== "true", "Requires Mark flag off");
  const stamp = Date.now(), email = `mark-rollback-${stamp}@example.com`, password = "MarkRollback12345";
  const org = await p.organization.create({ data: { name: "Mark rollback fixture", slug: `mark-rollback-${stamp}`, n8nWebhookSecret: randomBytes(32).toString("hex") } });
  try {
    await p.organizationModule.create({ data: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE" } });
    const user = await p.user.create({ data: { email, role: "OWNER", organizationId: org.id, passwordHash: await bcrypt.hash(password, 12) } });
    await p.agentSandboxRun.create({ data: { organizationId: org.id, createdById: user.id, requestKey: randomBytes(16).toString("hex"), inputHash: "fixture", fixtureVersion: "mark-fixtures-v1", definitionVersion: 1, status: "CANCELLED", expiresAt: new Date(0) } });
    await page.goto("/login"); await page.locator('input[type="email"]').fill(email); await page.locator('input[type="password"]').fill(password); await page.locator('button[type="submit"]').click(); await page.waitForURL(url => !url.pathname.startsWith("/login"));
    await page.goto("/portal/ai-lab"); await expect(page.getByRole("heading", { name: /Lía ·/ })).toHaveCount(0); await expect(page.locator("main h1")).toBeVisible();
    expect(await p.agentSandboxRun.count({ where: { organizationId: org.id } })).toBe(1);
  } finally {
    await p.agentSandboxRun.deleteMany({ where: { organizationId: org.id } }); await p.auditLog.deleteMany({ where: { organizationId: org.id } }); await p.organizationModule.deleteMany({ where: { organizationId: org.id } }); await p.user.deleteMany({ where: { organizationId: org.id } }); await p.organization.delete({ where: { id: org.id } }); await p.$disconnect();
  }
});
