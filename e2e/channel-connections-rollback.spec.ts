import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

test("account flag can be disabled independently of the Phase2 interface", async ({ page, request }) => {
  test.skip(process.env.E2E_CHANNEL_ROLLBACK !== "true", "Requires UI/model true and account flag false on the local server");
  const prisma = new PrismaClient(), stamp = Date.now(), email = `phase3-rollback-${stamp}@example.com`, password = "Phase3Rollback12345";
  const org = await prisma.organization.create({ data: { name: "Phase3 rollback fixture", slug: `phase3-rollback-${stamp}`, n8nWebhookSecret: randomBytes(32).toString("hex") } });
  try {
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE" } });
    await prisma.user.create({ data: { organizationId: org.id, email, passwordHash: await bcrypt.hash(password, 12), role: "OWNER" } });
    await page.goto("/login"); await page.locator('input[type="email"]').fill(email); await page.locator('input[type="password"]').fill(password); await page.locator('button[type="submit"]').click(); await page.waitForURL(url => !url.pathname.startsWith("/login"));
    await page.goto("/portal/ai-channels"); await expect(page.getByRole("heading", { name: "Canales", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar sin activar", exact: true })).toHaveCount(0);
    await expect(page.getByText("Conexión sin verificar", { exact: true })).toHaveCount(6);
    expect((await request.post("/api/webhooks/n8n/channels", { data: {} })).status()).toBe(503);
    expect(await prisma.channelConnection.count({ where: { organizationId: org.id } })).toBe(0);
  } finally {
    await prisma.organizationModule.deleteMany({ where: { organizationId: org.id } }); await prisma.user.deleteMany({ where: { organizationId: org.id } }); await prisma.organization.delete({ where: { id: org.id } }); await prisma.$disconnect();
  }
});
