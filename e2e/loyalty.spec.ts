import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
const prisma = new PrismaClient();
const password = "LoyaltyLocalTest123!";
const email = `e2e-loyalty-${Date.now()}@example.test`;
let orgId: string, slug: string;
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);
test.beforeAll(async () => {
  slug = `e2e-loyalty-${Date.now()}`;
  const org = await prisma.organization.create({ data: { name: "E2E Loyalty", slug, n8nWebhookSecret: randomBytes(32).toString("hex") } });
  orgId = org.id;
  await prisma.user.create({ data: { email, name: "Loyalty Owner", organizationId: orgId, role: "OWNER", passwordHash: await bcrypt.hash(password, 10) } });
});
test.afterAll(async () => {
  if (!orgId) return;
  await prisma.loyaltyProgram.deleteMany({ where: { organizationId: orgId } });
  await prisma.customer.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.$disconnect();
});
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/portal\//);
}
test("entitlement gates navigation and direct route", async ({ page }) => {
  await login(page);
  await expect(page.locator('a[href="/portal/loyalty"]')).toHaveCount(0);
  await page.goto("/portal/loyalty");
  await expect(page).toHaveURL(/\/portal\/dashboard/);
});
test("owner configures real program through native navigation", async ({ page }) => {
  await prisma.organizationModule.create({ data: { organizationId: orgId, module: "LOYALTY" } });
  await login(page);
  await page.locator('a[href="/portal/loyalty"]').click();
  await expect(page.getByRole("heading", { name: /REYMEN Loyalty/i })).toBeVisible();
  await page.goto("/portal/loyalty/program");
  await page.locator("#p-name").fill("Club E2E");
  await page.locator("#p-goal").fill("3");
  await page.locator("#p-rname").fill("Café de regalo");
  await page.locator('form button[type="submit"]').first().click();
  await expect.poll(() => prisma.loyaltyProgram.count({ where: { organizationId: orgId, name: "Club E2E" } })).toBe(1);
  await expect(page.getByText("Club E2E", { exact: true }).first()).toBeVisible();
});
test("public signup creates a Customer-linked opaque card with no marketing consent", async ({ page }) => {
  await page.goto(`/lealtad/${slug}`);
  await page.getByLabel("Nombre", { exact: true }).fill("Ana Prueba");
  await page.getByLabel("WhatsApp", { exact: true }).fill("8155510099");
  await page.getByLabel("Código postal", { exact: true }).fill("64610");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Obtener mi tarjeta" }).click();
  await expect(page).toHaveURL(/\/tarjeta\/[A-Za-z0-9_-]{24}$/);
  await expect(page.getByText("Hola, Ana", { exact: true })).toBeVisible();
  await expect(page.getByText("8155510099")).toHaveCount(0);
  const member = await prisma.loyaltyMember.findFirstOrThrow({ where: { organizationId: orgId }, include: { customer: true } });
  expect(member.customerId).toBeTruthy(); expect(member.customer?.consentAccepted).toBe(false);
});
test("mobile dark English pages render real data without horizontal overflow", async ({ page, context }) => {
  await prisma.user.update({ where: { email }, data: { theme: "dark", language: "en" } });
  await context.addCookies([{ name: "reymen-theme", value: "dark", url: "http://127.0.0.1:3000" }, { name: "reymen-lang", value: "en", url: "http://127.0.0.1:3000" }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  // Authenticated preferences are supplied by the existing session; cookies also
  // exercise the server translations used by Loyalty's public pages.
  await context.addCookies([{ name: "reymen-theme", value: "dark", url: "http://127.0.0.1:3000" }, { name: "reymen-lang", value: "en", url: "http://127.0.0.1:3000" }]);
  for (const path of ["", "/members", "/visits", "/map", "/analytics", "/program"]) {
    await page.goto(`/portal/loyalty${path}`);
    await expect(page.getByRole("heading", { name: /REYMEN Loyalty/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("alert").filter({ hasText: /Unable to load|No se pudo cargar/ })).toHaveCount(0);
  }
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.screenshot({ path: "/workspace/.onboarding/logs/loyalty-mobile-dark.png", fullPage: true });
});
test("suspension hides navigation, blocks routes and public cards, preserves members", async ({ page }) => {
  await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: orgId, module: "LOYALTY" } }, data: { status: "SUSPENDED" } });
  await login(page);
  await expect(page.locator('a[href="/portal/loyalty"]')).toHaveCount(0);
  await page.goto("/portal/loyalty/members"); await expect(page).toHaveURL(/\/portal\/dashboard/);
  const member = await prisma.loyaltyMember.findFirstOrThrow({ where: { organizationId: orgId } });
  await page.goto(`/lealtad/${slug}/tarjeta/${member.publicToken}`);
  await expect(page.getByText("Hola, Ana")).toHaveCount(0);
  expect(await prisma.loyaltyMember.count({ where: { organizationId: orgId } })).toBe(1);
});
