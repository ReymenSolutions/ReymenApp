import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { cleanupOrg } from "../src/test/helpers";
import { randomUUID } from "crypto";
const db = new PrismaClient();
const suffix = randomUUID().slice(0, 8);
const email = `service-admin-${suffix}@example.test`;
const ownerEmail = `service-owner-${suffix}@example.test`;
const password = "Synthetic-browser-123!";
const key = `browser-auto-${suffix}`;
const name = `Browser Service ${suffix}`;
let adminId = "";
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  adminId = (await db.user.create({ data: { email, name: "Synthetic admin", role: "SUPER_ADMIN", language: "es", passwordHash: await bcrypt.hash(password, 10) } })).id;
});
test.afterAll(async () => {
  const org = await db.organization.findFirst({ where: { name } });
  if (org) await cleanupOrg(org.id);
  await db.auditLog.deleteMany({ where: { userId: adminId } });
  await db.user.deleteMany({ where: { id: adminId } });
  await db.plan.deleteMany({ where: { key } });
  await db.$disconnect();
});
async function login(page: import("@playwright/test").Page, account: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(account);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 60000 });
}
test("admin creates a customer with its product and searches the operations hub", async ({ page }) => {
  test.setTimeout(240000);
  await login(page, email);
  // Provision through the real action so the catalog cache is invalidated too.
  await page.goto("/admin/plans");
  await page.getByRole("button", { name: "Nuevo plan", exact: true }).click();
  const planDialog = page.getByRole("dialog");
  await planDialog.locator("#plan-key").fill(key);
  await planDialog.locator("#plan-name").fill(name);
  await planDialog.locator("#plan-price").fill("500");
  await planDialog.locator("#plan-ai").fill("0");
  await planDialog.getByRole("checkbox", { name: "CRM", exact: true }).uncheck();
  await planDialog.getByRole("checkbox", { name: "Automatizaciones", exact: true }).check();
  await planDialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(planDialog).not.toBeVisible({ timeout: 20000 });
  await page.goto("/admin/clients");
  await page.getByRole("button", { name: "Nuevo cliente", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('[name="orgName"]').fill(name);
  await dialog.locator('[name="userName"]').fill("Synthetic owner");
  await dialog.locator('[name="userEmail"]').fill(ownerEmail);
  await dialog.locator('[name="password"]').fill(password);
  await dialog.locator('#new-client-plan').selectOption(key);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).not.toBeVisible({ timeout: 20000 });
  const org = await db.organization.findFirstOrThrow({ where: { name }, include: { modules: true } });
  expect(org.modules.filter(m => m.status === "ACTIVE").map(m => m.module)).toEqual(["AUTOMATIONS"]);
  // Preserve main's multi-pipeline onboarding while provisioning only the purchased product.
  const pipeline = await db.pipeline.findFirstOrThrow({ where: { organizationId: org.id, isDefault: true }, include: { stages: true } });
  expect(pipeline.name).toBe("Ventas");
  expect(pipeline.stages).toHaveLength(6);
  await page.goto("/admin/automations");
  await expect(page.getByRole("heading", { name: "Centro de automatizaciones" })).toBeVisible();
  await page.locator('input[name="q"]').fill("no-such-automation");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page).toHaveURL(/q=no-such-automation/);
  await expect(page.getByRole("navigation", { name: "Paginación" })).toContainText("0 resultados");
});
test("owner sees purchased automation access, cannot open CRM appointments or chatbot", async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, ownerEmail);
  await page.goto("/portal/automations");
  await expect(page).toHaveURL(/\/portal\/automations/);
  for (const path of ["/portal/appointments", "/portal/conversations", "/portal/food", "/portal/leads"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/portal\/dashboard/, { timeout: 30000 });
  }
  await page.goto("/portal/automations");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("billing suspension retains billing/support and payment restores the purchased module", async ({ page, browser }) => {
  test.setTimeout(180000);
  const org = await db.organization.findFirstOrThrow({ where: { name } });
  await db.organization.update({ where: { id: org.id }, data: { billingPeriodEnd: new Date(Date.now() - 4 * 86400_000) } });
  await login(page, ownerEmail);
  await page.goto("/portal/automations");
  await expect(page).toHaveURL(/\/portal\/settings\?billing=overdue/);
  await expect(page.getByRole("alert").filter({ hasText: "Módulos suspendidos" })).toContainText("Módulos suspendidos");
  await expect(page.getByRole("alert").filter({ hasText: "Módulos suspendidos" })).toContainText("UTC");
  await page.goto("/portal/requests");
  await expect(page).toHaveURL(/\/portal\/requests/);
  const adminContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const adminPage = await adminContext.newPage();
    await login(adminPage, email);
    await adminPage.goto(`/admin/clients/${org.id}?tab=suscripcion`);
    await adminPage.getByLabel("Monto en MXN", { exact: true }).fill("500");
    await adminPage.getByPlaceholder("Referencia o folio (evita duplicar)").fill(`browser-${suffix}`);
    await adminPage.getByRole("button", { name: "Registrar pago", exact: true }).click();
    await expect.poll(() => db.billingPayment.count({ where: { organizationId: org.id, externalRef: `browser-${suffix}` } })).toBe(1);
  } finally { await adminContext.close(); }
  await page.goto("/portal/automations");
  await expect(page).toHaveURL(/\/portal\/automations/);
  await expect(page.getByRole("alert").filter({ hasText: "Módulos suspendidos" })).not.toBeVisible();
});
