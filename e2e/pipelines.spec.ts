import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = `e2e-pipelines-${randomBytes(8).toString("hex")}@example.com`;
const TEST_PASSWORD = "PipelinesE2E123";

test.describe("varios embudos", () => {
  test.describe.configure({ mode: "serial" });
  let orgId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `E2E Pipelines ${Date.now()}`, slug: `e2e-pipelines-${Date.now()}`, n8nWebhookSecret: randomBytes(32).toString("hex"), plan: "professional" },
    });
    orgId = org.id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "CRM", status: "ACTIVE", source: "SUBSCRIBED" } });
    const pipeline = await prisma.pipeline.create({ data: { organizationId: org.id, name: "Ventas", isDefault: true } });
    await prisma.pipelineStage.createMany({
      data: [
        { organizationId: org.id, pipelineId: pipeline.id, name: "Nuevo", order: 0 },
        { organizationId: org.id, pipelineId: pipeline.id, name: "Ganado", order: 1, isWon: true },
      ],
    });
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Pipelines Owner", role: "OWNER", organizationId: org.id, passwordHash: await bcrypt.hash(TEST_PASSWORD, 12), language: "es" },
    });
  });

  test.afterAll(async () => {
    if (!orgId) return;
    await prisma.opportunity.deleteMany({ where: { organizationId: orgId } });
    await prisma.pipelineStage.deleteMany({ where: { organizationId: orgId } });
    await prisma.pipeline.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  test("crea un embudo en Configuración y el tablero permite cambiar entre embudos", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    await page.goto("/portal/settings");
    await page.getByLabel("Nuevo embudo").fill("Renovaciones");
    await page.getByRole("button", { name: /crear embudo/i }).click();
    await expect(page.getByTestId("pipeline-config")).toHaveCount(2);

    await page.goto("/portal/pipeline");
    const nav = page.getByRole("navigation", { name: "Embudos" });
    await expect(nav.getByRole("link", { name: "Ventas" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Renovaciones" }).click();
    await expect(nav.getByRole("link", { name: "Renovaciones" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("En proceso").first()).toBeVisible();
  });
});
