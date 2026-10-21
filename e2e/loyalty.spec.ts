import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
const prisma = new PrismaClient();
const password = "LoyaltyLocalTest123!";
const email = `e2e-loyalty-${Date.now()}@example.test`;
let orgId: string, slug: string;
let loginCookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> | undefined;
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
  await prisma.foodSale.deleteMany({ where: { organizationId: orgId } });
  await prisma.customer.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.$disconnect();
});
async function login(page: import("@playwright/test").Page) {
  if (loginCookies) {
    await page.context().addCookies(loginCookies);
    await page.goto("/portal/dashboard");
    return;
  }
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/portal\//);
  loginCookies = await page.context().cookies();
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
test("business creates another program and a member chooses it from their card", async ({ page }) => {
  await login(page);
  await page.goto("/portal/loyalty/program?new=1");
  await page.locator("#p-name").fill("Segundo Club");
  await page.locator("#p-goal").fill("4");
  await page.locator("#p-rname").fill("Otra recompensa");
  await page.locator('form button[type="submit"]').first().click();
  await expect.poll(() => prisma.loyaltyProgram.count({ where: { organizationId: orgId } })).toBe(2);
  const second = await prisma.loyaltyProgram.findFirstOrThrow({ where: { organizationId: orgId, name: "Segundo Club" } });
  const first = await prisma.loyaltyMember.findFirstOrThrow({ where: { organizationId: orgId } });
  await page.goto(`/lealtad/${slug}/tarjeta/${first.publicToken}`);
  await page.locator("#member-program").selectOption(second.id);
  await page.getByRole("button", { name: /Elegir programa|Choose program/ }).click();
  await expect.poll(() => prisma.loyaltyMember.count({ where: { organizationId: orgId, programId: second.id, isSelected: true } })).toBe(1);
  await expect(page.getByText("Segundo Club", { exact: true }).last()).toBeVisible();
  expect((await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: first.id } })).isSelected).toBe(false);
});

test("admin browses historical programs without changing the customer's selected program", async ({ page }) => {
  await login(page);
  const programs = await prisma.loyaltyProgram.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } });
  const memberships = await prisma.loyaltyMember.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } });
  const old = memberships.find(m => m.programId === programs[0].id)!;
  const selected = memberships.find(m => m.isSelected)!;
  const before = await prisma.loyaltyMember.findMany({ where: { organizationId: orgId }, select: { id: true, isSelected: true, totalVisits: true }, orderBy: { id: "asc" } });
  await page.goto("/portal/loyalty/members");
  await page.getByLabel("Consultar clientes y visitas de").selectOption(selected.programId);
  await expect(page.getByRole("status").filter({ hasText: "Estás viendo" })).toContainText("Segundo Club");
  await page.goto(`/portal/loyalty/members/${old.id}`);
  await expect(page.getByText("Café de regalo", { exact: true })).toBeVisible();
  const choices = page.getByRole("region", { name: "Programas de este cliente" });
  await expect(choices.getByRole("link")).toHaveCount(2);
  await choices.getByRole("link", { name: /Segundo Club/ }).click();
  await expect(page).toHaveURL(new RegExp(`/members/${selected.id}$`));
  await expect(page.getByText("Otra recompensa", { exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Programas de este cliente" }).getByRole("link", { name: /Club E2E/ }).click();
  await expect(page).toHaveURL(new RegExp(`/members/${old.id}$`));
  await page.goto("/portal/loyalty/visits");
  await page.getByLabel("Consultar clientes y visitas de").selectOption(programs[0].id);
  await expect(page.getByRole("status").filter({ hasText: "Estás viendo" })).toContainText("Club E2E");
  expect(await prisma.loyaltyMember.findMany({ where: { organizationId: orgId }, select: { id: true, isSelected: true, totalVisits: true }, orderBy: { id: "asc" } })).toEqual(before);
  await page.goto("/portal/loyalty/members/nonexistent-other-organization-member");
  await expect(page.getByText("404")).toBeVisible();
});

test("owner recovers two legacy skipped POS purchases from a member profile only once", async ({ page }) => {
  const member = await prisma.loyaltyMember.findFirstOrThrow({ where: { organizationId: orgId, isSelected: true }, include: { program: true } });
  const at = new Date();
  const firstSale = await prisma.foodSale.create({ data: { organizationId: orgId, customerId: member.customerId, source: "POS", externalOrderId: "recovery-ui-first", grossAmount: 150, netAmount: 150 / 1.16, occurredAt: at } });
  await prisma.loyaltyVisit.create({ data: { organizationId: orgId, programId: member.programId, memberId: member.id, saleId: firstSale.id, saleAmount: 150, occurredAt: at, idempotencyKey: "pos:recovery-ui-first", programVersion: member.program.currentVersion, cycleNumber: 1 } });
  await prisma.loyaltyMember.update({ where: { id: member.id }, data: { totalVisits: 1, cycleVisits: 1, visitsWithAmount: 1, totalSpent: 150, firstVisitAt: at, lastVisitAt: at } });
  for (let n = 1; n <= 2; n++) {
    const occurredAt = new Date(at.getTime() + n * 1000);
    const sale = await prisma.foodSale.create({ data: { organizationId: orgId, customerId: member.customerId, source: "POS", externalOrderId: `recovery-ui-${n}`, grossAmount: 150, netAmount: 150 / 1.16, occurredAt } });
    const event = await prisma.domainEvent.create({ data: { organizationId: orgId, type: "sale.completed", subjectType: "sale", subjectId: sale.id, occurredAt, payload: { loyaltyMemberId: member.id, customerId: member.customerId }, dedupeKey: `recovery-ui-${n}`, status: "PROCESSED", processedAt: at } });
    await prisma.loyaltyEventReceipt.create({ data: { organizationId: orgId, eventId: event.id, eventType: event.type, saleId: sale.id, outcome: "cooldown" } });
  }
  await login(page);
  await page.goto(`/portal/loyalty/members/${member.id}`);
  await page.getByRole("button", { name: "Recuperar compras omitidas", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 visitas recuperadas" })).toBeVisible();
  await expect.poll(async () => (await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: member.id } })).totalVisits).toBe(3);
  await page.getByRole("button", { name: "Recuperar compras omitidas", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "0 visitas recuperadas" })).toBeVisible();
  expect((await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: member.id } })).totalVisits).toBe(3);
});

test("mobile dark English pages render real data without horizontal overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  // Use the real preference action, which invalidates the server session cache.
  // Updating the DB directly leaves an authenticated cached snapshot unchanged.
  const userMenu = page.locator("header > div").last().locator(":scope > button").last();
  await userMenu.click();
  await page.getByRole("button", { name: /^(Oscuro|Dark)$/, exact: true }).click();
  await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { email } })).theme).toBe("dark");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { email } })).language).toBe("en");
  await userMenu.click();
  for (const path of ["", "/members", "/visits", "/map", "/analytics", "/program"]) {
    await page.goto(`/portal/loyalty${path}`);
    await expect(page.getByRole("heading", { name: /REYMEN Loyalty/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("alert").filter({ hasText: /Unable to load|No se pudo cargar/ })).toHaveCount(0);
  }
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.screenshot({ path: testInfo.outputPath("loyalty-mobile-dark.png"), fullPage: true });
});
test("mobile navigation reserves the back gesture and remains visible across repeated tab changes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/portal/loyalty");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: /^(menu|menú)$/i }).click();
    await expect(page.locator("aside")).toHaveClass(/translate-x-0/);
    await page.locator('aside a[href="/portal/loyalty"]').click();
    await expect(page.locator("aside")).toHaveClass(/-translate-x-full/);
    await page.locator('nav a[href="/portal/loyalty/program"]').click();
    await expect(page.locator("#p-name")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: /REYMEN Loyalty/i })).toBeVisible();
    await expect(page.locator("aside")).toHaveClass(/-translate-x-full/);
  }
  await page.evaluate(() => {
    for (const [type, x] of [["touchstart", 10], ["touchmove", 160], ["touchend", 160]] as const) {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ clientX: x, clientY: 300 }] });
      document.dispatchEvent(event);
    }
  });
  await expect(page.locator("aside")).toHaveClass(/-translate-x-full/);
  // Delay RSC navigation to exercise loading while the module shell stays present.
  await page.route("**/portal/loyalty/**", async route => {
    if (route.request().headers()["rsc"]) await new Promise(resolve => setTimeout(resolve, 500));
    await route.continue();
  });
  for (const path of ["members", "program", "map", "analytics", "visits"]) {
    await page.locator(`nav a[href="/portal/loyalty/${path}"]`).click();
    await expect(page.getByRole("heading", { name: /REYMEN Loyalty/i })).toBeVisible();
    await expect(page.locator("main")).not.toHaveText("");
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: /REYMEN Loyalty/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("suspension hides navigation, blocks routes and public cards, preserves members", async ({ page }) => {
  const previousMembers = await prisma.loyaltyMember.findMany({ where: { organizationId: orgId }, select: { id: true }, orderBy: { id: "asc" } });
  await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: orgId, module: "LOYALTY" } }, data: { status: "SUSPENDED" } });
  await login(page);
  await expect(page.locator('a[href="/portal/loyalty"]')).toHaveCount(0);
  await page.goto("/portal/loyalty/members"); await expect(page).toHaveURL(/\/portal\/dashboard/);
  const member = await prisma.loyaltyMember.findFirstOrThrow({ where: { organizationId: orgId } });
  await page.goto(`/lealtad/${slug}/tarjeta/${member.publicToken}`);
  await expect(page.getByText("Hola, Ana")).toHaveCount(0);
  expect(await prisma.loyaltyMember.findMany({ where: { organizationId: orgId }, select: { id: true }, orderBy: { id: "asc" } })).toEqual(previousMembers);
});
