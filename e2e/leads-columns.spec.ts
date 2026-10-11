import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-leads-columns@example.com";
const TEST_PASSWORD = "LeadsColumns123";

test.describe("leads table: gear to choose columns", () => {
  test.describe.configure({ mode: "serial" });

  let orgId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `E2E Leads Columns ${Date.now()}`, slug: `e2e-leads-columns-${Date.now()}`, n8nWebhookSecret: randomBytes(32).toString("hex") },
    });
    orgId = org.id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "CRM", status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Columns Owner", role: "OWNER", organizationId: org.id, passwordHash: await bcrypt.hash(TEST_PASSWORD, 12), language: "es" },
    });
    await prisma.lead.create({
      data: { organizationId: org.id, name: "Paciente Columnas", phone: "555-8100", phoneKey: "5558100", customFields: { aseguradora: "GNP" } },
    });
  });

  test.afterAll(async () => {
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.customField.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  test("creating a field from the gear shows it as a column, and base columns can be hidden", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    await page.goto("/portal/leads");
    const table = page.locator("table");
    await expect(table.getByRole("columnheader", { name: /score/i })).toBeVisible();

    const gear = page.getByRole("button", { name: /columnas de la tabla/i });
    await expect(async () => {
      await gear.click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1500 });
    }).toPass();
    const dialog = page.getByRole("dialog");

    await dialog.getByPlaceholder(/nombre del campo/i).fill("Aseguradora");
    await dialog.getByRole("button", { name: /agregar y mostrar/i }).click();
    await expect(dialog.getByRole("checkbox", { name: "Aseguradora" })).toBeChecked();

    await dialog.getByRole("checkbox", { name: /score/i }).uncheck();
    await expect(dialog.getByRole("checkbox", { name: /score/i })).not.toBeChecked();
    await page.keyboard.press("Escape");

    await expect(table.getByRole("columnheader", { name: "Aseguradora" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: /score/i })).toHaveCount(0);
    await expect(table.getByRole("cell", { name: "GNP" })).toBeVisible();

    // La preferencia persiste al recargar.
    await page.reload();
    await expect(page.locator("table").getByRole("columnheader", { name: "Aseguradora" })).toBeVisible();
    await expect(page.locator("table").getByRole("columnheader", { name: /score/i })).toHaveCount(0);
  });
});
