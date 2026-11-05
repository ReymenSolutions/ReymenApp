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
  await db.plan.create({ data: { key, name, nameEn: name, sortOrder: 999, priceMxn: 500, aiBudgetMxn: 0, maxAutomations: 2, modules: ["AUTOMATIONS"] } });
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
