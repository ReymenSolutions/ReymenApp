import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-pipeline-lead-detail@example.com";
const TEST_PASSWORD = "PipelineLeadDetail123";

test.describe("pipeline board and lead detail golden path", () => {
  test.describe.configure({ mode: "serial" });

  let orgId: string;
  let leadId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `E2E Pipeline Lead Detail ${Date.now()}`,
        slug: `e2e-pipeline-lead-detail-${Date.now()}`,
        n8nWebhookSecret: randomBytes(32).toString("hex"),
      },
    });
    orgId = org.id;

    await prisma.organizationModule.create({
      data: { organizationId: org.id, module: "CRM", status: "ACTIVE", source: "SUBSCRIBED" },
    });

    await prisma.pipelineStage.createMany({
      data: [
        { organizationId: org.id, name: "Nuevo", order: 0 },
        { organizationId: org.id, name: "Contactado", order: 1 },
        { organizationId: org.id, name: "Ganado", order: 2, isWon: true },
        { organizationId: org.id, name: "Perdido", order: 3, isLost: true },
      ],
    });

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Pipeline Owner", role: "OWNER", organizationId: org.id, passwordHash },
    });

    const lead = await prisma.lead.create({
      data: { organizationId: org.id, name: "Lead Pipeline E2E", phone: "555-7000", email: "leadpipeline@example.com" },
    });
    leadId = lead.id;
  });

  test.afterAll(async () => {
    await prisma.opportunity.deleteMany({ where: { organizationId: orgId } });
    await prisma.note.deleteMany({ where: { organizationId: orgId } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.pipelineStage.deleteMany({ where: { organizationId: orgId } });
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

  test("pipeline page renders configured stages as columns", async ({ page }) => {
    await login(page);
    await page.goto("/portal/pipeline");
    await expect(page.getByRole("heading", { name: "Nuevo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ganado" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Perdido" })).toBeVisible();
  });

  test("creating an opportunity from the pipeline page places it in the default first stage", async ({ page }) => {
    await login(page);
    await page.goto("/portal/pipeline");

    await page.getByRole("button", { name: /nueva oportunidad/i }).click();
    await page.getByPlaceholder(/buscar por nombre/i).fill("Lead Pipeline E2E");
    await page.getByText("Lead Pipeline E2E", { exact: false }).first().click();
    await page.getByPlaceholder(/paquete anual/i).fill("Deal Pipeline E2E");
    await page.getByRole("button", { name: /crear oportunidad/i }).click();

    await expect(page.getByText("Deal Pipeline E2E")).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to the lead detail page shows the opportunity and the unified timeline", async ({ page }) => {
    await login(page);
    await page.goto(`/portal/leads/${leadId}`);

    await expect(page.getByRole("heading", { name: "Lead Pipeline E2E" })).toBeVisible();
    // La oportunidad aparece en su tarjeta y también en el historial
    // ("Oportunidad creada: ..."), así que se verifican las dos por separado.
    await expect(page.getByRole("paragraph").filter({ hasText: "Deal Pipeline E2E" })).toBeVisible();
    await expect(page.getByRole("list").getByText("Deal Pipeline E2E")).toBeVisible();
  });

  test("adding a note on the lead detail page appears immediately", async ({ page }) => {
    await login(page);
    await page.goto(`/portal/leads/${leadId}`);

    await page.locator("textarea").fill("Nota E2E del pipeline");
    await page.getByRole("button", { name: /agregar nota/i }).click();

    await expect(page.getByText("Nota E2E del pipeline")).toBeVisible({ timeout: 10_000 });
  });

  test("a same-phone duplicate lead is flagged with a merge option", async ({ page }) => {
    const duplicate = await prisma.lead.create({
      data: { organizationId: orgId, name: "Lead Duplicado E2E", phone: "555-7000" },
    });

    await login(page);
    await page.goto(`/portal/leads/${duplicate.id}`);

    await expect(page.getByText(/posibles contactos duplicados/i)).toBeVisible();
    await expect(page.getByText("Lead Pipeline E2E")).toBeVisible();
  });
});
