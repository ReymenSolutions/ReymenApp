import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { mkdirSync, writeFileSync } from "fs";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-crm-ui@example.com";
const TEST_PASSWORD = "CrmUi12345";
const STATE = "test-results/crm-ui-auth.json";
// Estado vacío para que exista el archivo; beforeAll lo reemplaza con la sesión iniciada.
mkdirSync("test-results", { recursive: true });
writeFileSync(STATE, JSON.stringify({ cookies: [], origins: [] }));

test.describe("interfaz del CRM: pipeline, panel de detalle y movimiento", () => {
  test.describe.configure({ mode: "serial" });

  let orgId: string;
  let stageIds: Record<string, string> = {};

  // Se inicia sesión una sola vez y se reutiliza (el login tiene límite de intentos por IP).
  test.use({ storageState: STATE });

  test.beforeAll(async ({ browser }) => {
    const org = await prisma.organization.create({
      data: { name: `E2E CRM UI ${Date.now()}`, slug: `e2e-crm-ui-${Date.now()}`, n8nWebhookSecret: randomBytes(32).toString("hex") },
    });
    orgId = org.id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "CRM", status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.pipelineStage.createMany({
      data: [
        { organizationId: org.id, name: "Nuevo", order: 0 },
        { organizationId: org.id, name: "Propuesta", order: 1 },
        { organizationId: org.id, name: "Ganado", order: 2, isWon: true },
      ],
    });
    const stages = await prisma.pipelineStage.findMany({ where: { organizationId: org.id } });
    stageIds = Object.fromEntries(stages.map((s) => [s.name, s.id]));
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    const user = await prisma.user.create({ data: { email: TEST_EMAIL, name: "E2E CRM UI", role: "OWNER", organizationId: org.id, passwordHash } });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Cliente UI", phone: "555-8100", phoneKey: "5558100", email: "ui@example.com" } });
    await prisma.opportunity.createMany({
      data: [
        { organizationId: org.id, leadId: lead.id, pipelineStageId: stageIds["Nuevo"], title: "Trato Uno", amount: 1500, ownerId: user.id },
        { organizationId: org.id, leadId: lead.id, pipelineStageId: stageIds["Nuevo"], title: "Trato Dos", amount: 500, ownerId: user.id },
        { organizationId: org.id, leadId: lead.id, pipelineStageId: stageIds["Propuesta"], title: "Trato Tres", amount: 3000, ownerId: user.id },
      ],
    });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);
    await ctx.storageState({ path: STATE });
    await ctx.close();
  });

  test.afterAll(async () => {
    await prisma.opportunity.deleteMany({ where: { organizationId: orgId } });
    await prisma.note.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
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

  test("cada columna muestra su cantidad y su total", async ({ page }) => {
    await page.goto("/portal/pipeline");
    const nuevo = page.getByRole("region", { name: "Nuevo" });
    await expect(nuevo.getByText("Trato Uno")).toBeVisible();
    await expect(nuevo.getByText("2", { exact: true })).toBeVisible();
    await expect(nuevo.getByText("$2,000").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Ganado" }).getByText("Sin oportunidades")).toBeVisible();
  });

  test("arrastrar una tarjeta a otra columna la mueve y queda guardado", async ({ page }) => {
    await page.goto("/portal/pipeline");
    const card = page.getByRole("button", { name: /Abrir detalle: Trato Uno/ });
    const from = (await card.boundingBox())!;
    const to = (await page.getByRole("region", { name: "Propuesta" }).boundingBox())!;
    await page.mouse.move(from.x + 40, from.y + 20);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y + 30, { steps: 4 });
    await page.mouse.move(to.x + 100, to.y + 120, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole("region", { name: "Propuesta" }).getByText("Trato Uno")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Propuesta" }).getByText("Trato Uno")).toBeVisible();
    await expect(page.getByRole("region", { name: "Nuevo" }).getByText("Trato Uno")).toHaveCount(0);
  });

  test("también se puede cambiar de etapa sin arrastrar", async ({ page }) => {
    await page.goto("/portal/pipeline");
    await page.getByRole("button", { name: /Mover a… Trato Dos/ }).click();
    await page.getByRole("button", { name: "Ganado", exact: true }).click();
    await expect(page.getByRole("region", { name: "Ganado" }).getByText("Trato Dos")).toBeVisible();
  });

  test("el panel lateral se abre, guarda una nota al inicio y Escape lo cierra devolviendo el foco", async ({ page }) => {
    await page.goto("/portal/pipeline");
    const card = page.getByRole("button", { name: /Abrir detalle: Trato Tres/ });
    await card.focus();
    await card.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Cliente UI")).toBeVisible();
    const text = `Nota panel ${Date.now()}`;
    await dialog.getByPlaceholder("Agrega una nota…").fill(text);
    await dialog.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(dialog.getByRole("listitem").first()).toContainText(text);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Abrir detalle: Trato Tres/ })).toBeFocused();
    expect(await prisma.note.count({ where: { organizationId: orgId, content: text } })).toBe(1);
  });

  test("con movimiento reducido no hay animaciones de entrada", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/portal/pipeline");
    const name = await page.getByRole("region", { name: "Nuevo" }).evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe("none");
  });

  test("en el celular el cambio de etapa por menú funciona y no hay desborde horizontal de la página", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STATE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/portal/pipeline");
    await page.getByRole("button", { name: /Mover a… Trato Tres/ }).tap();
    await page.getByRole("button", { name: "Nuevo", exact: true }).tap();
    await expect(page.getByRole("region", { name: "Nuevo" }).getByText("Trato Tres")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await ctx.close();
  });
});
