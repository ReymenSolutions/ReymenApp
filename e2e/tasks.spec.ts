import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = `e2e-tasks-${randomBytes(8).toString("hex")}@example.com`;
const TEST_PASSWORD = "TasksE2E123";

test.describe("tareas y pendientes", () => {
  test.describe.configure({ mode: "serial" });
  let orgId: string;
  let leadId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `E2E Tasks ${Date.now()}`, slug: `e2e-tasks-${Date.now()}`, n8nWebhookSecret: randomBytes(32).toString("hex"), plan: "professional" },
    });
    orgId = org.id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "CRM", status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Tasks Owner", role: "OWNER", organizationId: org.id, passwordHash: await bcrypt.hash(TEST_PASSWORD, 12), language: "es" },
    });
    leadId = (await prisma.lead.create({ data: { organizationId: org.id, name: "Laura Prospecto", phone: "+525511223344" } })).id;
  });

  test.afterAll(async () => {
    if (!orgId) return;
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  test("crea una tarea desde la ficha del contacto, aparece en Tareas y se marca como hecha", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    await page.goto(`/portal/leads/${leadId}`);
    const section = page.getByTestId("lead-tasks");
    await expect(section).toContainText(/sin tareas/i);
    await page.getByRole("button", { name: /nueva tarea/i }).click();
    await page.getByLabel(/qué hay que hacer/i).fill("Llamar a Laura para cotizar");
    await page.getByLabel(/^vence/i).fill("2030-01-15T10:30");
    await page.getByRole("button", { name: /crear tarea/i }).click();
    await expect(section.getByTestId("task-row")).toContainText("Llamar a Laura para cotizar");

    await page.goto("/portal/tasks");
    await expect(page.getByRole("link", { name: "Tareas", exact: true })).toBeVisible();
    const upcoming = page.getByTestId("tasks-upcoming");
    await expect(upcoming).toContainText("Llamar a Laura para cotizar");
    await expect(upcoming).toContainText("Laura Prospecto");

    await upcoming.getByRole("button", { name: /marcar como hecha/i }).click();
    await expect(page.getByTestId("tasks-done")).toContainText("Llamar a Laura para cotizar");
    const task = await prisma.task.findFirstOrThrow({ where: { organizationId: orgId } });
    expect(task.status).toBe("DONE");
    expect(task.remindAt?.toISOString()).toBe(new Date(task.dueAt!.getTime() - 15 * 60_000).toISOString());
  });
});
