import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = `e2e-push-${randomBytes(8).toString("hex")}@example.com`;
const TEST_PASSWORD = "PushE2E1234";

test.describe("avisos push", () => {
  let orgId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: `E2E Push ${Date.now()}`, slug: `e2e-push-${Date.now()}`, n8nWebhookSecret: randomBytes(32).toString("hex") } });
    orgId = org.id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "CRM", status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.user.create({ data: { email: TEST_EMAIL, name: "E2E Push", role: "OWNER", organizationId: org.id, passwordHash: await bcrypt.hash(TEST_PASSWORD, 12), language: "es" } });
  });
  test.afterAll(async () => {
    if (!orgId) return;
    await prisma.pushSubscription.deleteMany({ where: { user: { email: TEST_EMAIL } } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  test("el service worker se sirve sin sesión y la campana ofrece activar avisos solo si hay llaves", async ({ page, request }) => {
    const sw = await request.get("/sw.js", { maxRedirects: 0 });
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("showNotification");

    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    const key = (await (await page.request.get("/api/push/subscribe")).json()) as { publicKey: string | null };
    await page.getByRole("button", { name: /notificaciones/i }).first().click();
    if (key.publicKey) await expect(page.getByTestId("push-optin")).toBeVisible();
    else await expect(page.getByTestId("push-optin")).toHaveCount(0);
  });
});
