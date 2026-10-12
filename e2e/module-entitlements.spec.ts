import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-module-entitlements@example.com";
const TEST_PASSWORD = "ModuleEntitlements123";

test.describe("module entitlements gate navigation and direct URL access", () => {
  test.describe.configure({ mode: "serial" });

  let orgId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `E2E Module Entitlements ${Date.now()}`,
        slug: `e2e-module-entitlements-${Date.now()}`,
        n8nWebhookSecret: randomBytes(32).toString("hex"),
      },
    });
    orgId = org.id;

    // Only CRM enabled — AI_WHATSAPP and AUTOMATIONS deliberately absent,
    // exercising the "new org starts with zero modules" default and the
    // per-module gate independently of the others.
    await prisma.organizationModule.create({
      data: { organizationId: org.id, module: "CRM", status: "ACTIVE", source: "SUBSCRIBED" },
    });

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Module Entitlements", role: "OWNER", organizationId: org.id, passwordHash },
    });
  });

  test.afterAll(async () => {
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  async function login(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  }

  test("navigation only shows the enabled module (CRM), not AI_WHATSAPP/AUTOMATIONS sections", async ({ page }) => {
    await login(page);
    await page.goto("/portal/dashboard");

    // Con CRM, Leads/Pipeline/Citas/Inbox viven dentro de una sola entrada "CRM" con pestañas.
    await expect(page.getByRole("link", { name: /^CRM/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "CRM" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /conversaciones/i })).not.toBeVisible();
    await expect(page.getByRole("link", { name: /agente ia/i })).not.toBeVisible();
    await expect(page.getByRole("link", { name: /automatizaciones/i })).not.toBeVisible();
  });

  test("direct URL access to a non-enabled module's page redirects away instead of rendering it", async ({ page }) => {
    await login(page);

    await page.goto("/portal/conversations");
    await expect(page).toHaveURL(/\/portal\/dashboard/);

    await page.goto("/portal/automations");
    await expect(page).toHaveURL(/\/portal\/dashboard/);

    await page.goto("/portal/whatsapp");
    await expect(page).toHaveURL(/\/portal\/dashboard/);
  });

  test("the enabled module's own page still works normally", async ({ page }) => {
    await login(page);
    await page.goto("/portal/leads");
    await expect(page).toHaveURL(/\/portal\/leads/);
  });

  test("suspending the enabled module blocks it too, and re-activating restores access", async ({ page }) => {
    await login(page);
    await page.goto("/portal/leads");
    await expect(page).toHaveURL(/\/portal\/leads/);

    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: orgId, module: "CRM" } },
      data: { status: "SUSPENDED" },
    });

    await page.goto("/portal/leads");
    await expect(page).toHaveURL(/\/portal\/dashboard/);

    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: orgId, module: "CRM" } },
      data: { status: "ACTIVE" },
    });

    await page.goto("/portal/leads");
    await expect(page).toHaveURL(/\/portal\/leads/);
  });
});
