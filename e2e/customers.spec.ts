import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-customers@example.com";
const TEST_PASSWORD = "CustomersE2E123";

test.describe("clientes del negocio", () => {
  test.describe.configure({ mode: "serial" });
  let orgId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `E2E Customers ${Date.now()}`, slug: `e2e-customers-${Date.now()}`, n8nWebhookSecret: randomBytes(32).toString("hex"), plan: "professional" },
    });
    orgId = org.id;
    for (const mod of ["FOOD_OPS", "CRM"] as const) await prisma.organizationModule.create({ data: { organizationId: org.id, module: mod, status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Customers Owner", role: "OWNER", organizationId: org.id, passwordHash: await bcrypt.hash(TEST_PASSWORD, 12), language: "es" },
    });
    await prisma.customer.create({
      data: { organizationId: org.id, phone: "+525599990001", phoneKey: "5599990001", name: "Marta Compradora", consentAccepted: true, visitCount: 3, totalSpent: 1250, lastVisitAt: new Date() },
    });
  });

  test.afterAll(async () => {
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.customer.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  test("lista clientes y los convierte en contacto del CRM", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    await page.goto("/portal/customers");
    await expect(page.getByText("Marta Compradora")).toBeVisible();
    await expect(page.getByText("3 visitas")).toBeVisible();

    await page.getByPlaceholder(/buscar por nombre/i).fill("zzz");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/ningún cliente coincide/i)).toBeVisible();
    await page.goto("/portal/customers");

    await page.getByRole("button", { name: /crear contacto/i }).click();
    await expect(page).toHaveURL(/\/portal\/leads\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByText("Marta Compradora").first()).toBeVisible();

    await page.goto("/portal/customers");
    await expect(page.getByRole("link", { name: /ver contacto/i })).toBeVisible();
  });
});
