import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

// Run against a local server restarted with both flags false.
test("UI rollback preserves legacy pages and redirects new routes without creating agent data", async ({ page }) => {
  test.skip(process.env.E2E_AI_UI_ROLLBACK !== "true", "Requires a server with the UI/model flags disabled");
  const prisma = new PrismaClient(), stamp = Date.now();
  const email = `phase2-rollback-${stamp}@example.com`, password = "Phase2Rollback12345";
  const org = await prisma.organization.create({ data: { name: "Phase2 rollback fixture", slug: `phase2-rollback-${stamp}`, n8nWebhookSecret: randomBytes(32).toString("hex") } });
  try {
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE" } });
    await prisma.user.create({ data: { organizationId: org.id, email, passwordHash: await bcrypt.hash(password, 12), role: "OWNER" } });
    await page.goto("/login"); await page.locator('input[type="email"]').fill(email); await page.locator('input[type="password"]').fill(password); await page.locator('button[type="submit"]').click();
    await page.waitForURL(url => !url.pathname.startsWith("/login"));
    await page.goto("/portal/whatsapp");
    await expect(page.getByRole("heading", { name: "Centro de asistentes IA" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Mis asistentes", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /base de conocimiento/i, exact: true }).first()).toBeVisible();
    for (const path of ["ai-agents", "ai-agents/assistant", "ai-channels"]) {
      await page.goto(`/portal/${path}`); await expect(page).toHaveURL(/\/portal\/whatsapp$/);
    }
    await page.goto("/portal/knowledge-base"); await expect(page.getByLabel("Reglas duras")).toBeVisible();
    expect(await prisma.agentInstance.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await prisma.agentModelRollout.count({ where: { organizationId: org.id } })).toBe(0);
  } finally {
    await prisma.organizationModule.deleteMany({ where: { organizationId: org.id } });
    await prisma.user.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } }); await prisma.$disconnect();
  }
});
