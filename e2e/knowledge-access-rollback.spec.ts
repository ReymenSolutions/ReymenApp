import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
const p = new PrismaClient();
test("knowledge flag rollback restores the documented previous reader without deleting sources", async ({ page }) => {
  test.skip(process.env.E2E_KNOWLEDGE_ROLLBACK !== "true", "Requires knowledge flag off with the center UI on");
  const stamp = Date.now(), email = `phase4-rollback-${stamp}@example.com`, password = "Phase4Rollback12345";
  const org = await p.organization.create({ data: { name: "Knowledge rollback fixture", slug: `knowledge-rollback-${stamp}`, n8nWebhookSecret: randomBytes(32).toString("hex") } });
  try {
    await p.organizationModule.create({ data: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE" } });
    await p.user.create({ data: { email, role: "OWNER", organizationId: org.id, passwordHash: await bcrypt.hash(password, 12) } });
    await p.knowledgeBase.create({ data: { organizationId: org.id, title: "Fuente conservada", content: "Contenido activo anterior", tags: [] } });
    await p.knowledgeAccessPolicy.create({ data: { organizationId: org.id, enabled: true } });
    await page.goto("/login"); await page.locator('input[type="email"]').fill(email); await page.locator('input[type="password"]').fill(password); await page.locator('button[type="submit"]').click(); await page.waitForURL(url => !url.pathname.startsWith("/login"));
    await page.goto("/portal/knowledge-base");
    await expect(page.getByRole("heading", { name: "Fuentes autorizadas", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Fuente conservada", exact: true })).toBeVisible();
    const response = await page.request.get("/api/v1/knowledge-base"); expect(response.status()).toBe(200);
    expect((await response.json()).data[0].content).toBe("Contenido activo anterior");
    expect(await p.knowledgeBase.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await p.knowledgeAccessPolicy.findUnique({ where: { organizationId: org.id } })).toMatchObject({ enabled: true });
  } finally {
    await p.knowledgeAccessPolicy.deleteMany({ where: { organizationId: org.id } }); await p.knowledgeBase.deleteMany({ where: { organizationId: org.id } }); await p.auditLog.deleteMany({ where: { organizationId: org.id } }); await p.organizationModule.deleteMany({ where: { organizationId: org.id } }); await p.user.deleteMany({ where: { organizationId: org.id } }); await p.organization.delete({ where: { id: org.id } }); await p.$disconnect();
  }
});
