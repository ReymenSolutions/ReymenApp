import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-rulebook@example.com";
const TEST_PASSWORD = "Rulebook12345";

test.describe("rulebook del negocio", () => {
  let orgId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `E2E Rulebook ${Date.now()}`, slug: `e2e-rulebook-${Date.now()}`, n8nWebhookSecret: randomBytes(32).toString("hex") },
    });
    orgId = org.id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE", source: "SUBSCRIBED" } });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    await prisma.user.create({ data: { email: TEST_EMAIL, name: "E2E Rulebook", role: "OWNER", organizationId: org.id, passwordHash } });
  });

  test.afterAll(async () => {
    await prisma.businessRulebook.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  test("se llena, se guarda y sigue ahí al recargar", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    await page.goto("/portal/knowledge-base");
    const rulesSection = page.locator("summary").filter({ hasText: "Reglas del negocio" });
    if (await rulesSection.isVisible()) await rulesSection.click();
    await expect(page.getByText("0 de 4 secciones listas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardado" })).toBeDisabled();

    await page.getByLabel("Reglas duras").fill("Nunca inventes precios");
    await page.getByLabel("Precios").fill("Revisión: $500");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Rulebook guardado")).toBeVisible();

    await page.reload();
    if (await rulesSection.isVisible()) await rulesSection.click();
    await expect(page.getByLabel("Reglas duras")).toHaveValue("Nunca inventes precios");
    await expect(page.getByText("2 de 4 secciones listas")).toBeVisible();
    expect(await prisma.businessRulebook.count({ where: { organizationId: orgId, rules: "Nunca inventes precios" } })).toBe(1);
  });
});
