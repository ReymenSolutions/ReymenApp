import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = `e2e-customers-${randomBytes(8).toString("hex")}@example.com`;
const TEST_PASSWORD = "CustomersE2E123";

test.describe("clientes del negocio", () => {
  test.describe.configure({ mode: "serial" });
  let orgId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `E2E Customers ${Date.now()}`, slug: `e2e-customers-${Date.now()}`, n8nWebhookSecret: randomBytes(32).toString("hex"), plan: "professional" },
    });
    orgId = org.id;
    for (const mod of ["FOOD_OPS", "CRM"] as const) await prisma.organizationModule.create({ data: { organizationId: org.id, module: mod, status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Customers Owner", role: "OWNER", organizationId: org.id, passwordHash: await bcrypt.hash(TEST_PASSWORD, 12), language: "es" },
    });
    await prisma.customer.create({
      data: { organizationId: org.id, phone: "+525599990001", phoneKey: "5599990001", name: "Marta Compradora", consentAccepted: true, visitCount: 3, totalSpent: 1250, lastVisitAt: new Date() },
    });
  });

  test.afterAll(async () => {
    if (!orgId) return;
    await prisma.foodSale.deleteMany({ where: { organizationId: orgId } });
    await prisma.loyaltyProgram.deleteMany({ where: { organizationId: orgId } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.customer.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  test("lista clientes y los convierte en contacto del CRM", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    await page.goto("/portal/customers");
    await expect(page.getByText("Marta Compradora")).toBeVisible();
    // Cada cliente es una tarjeta: nombre, compras y visitas.
    await expect(page.getByRole("listitem").filter({ hasText: "Marta Compradora" })).toContainText(/Visitas\s*3/);

    await page.getByPlaceholder(/buscar por nombre/i).fill("zzz");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main").getByRole("heading", { name: /ningún cliente coincide/i })).toBeVisible();
    await page.goto("/portal/customers");

    await page.getByRole("button", { name: /crear contacto/i }).click();
    await expect(page).toHaveURL(/\/portal\/leads\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByText("Marta Compradora").first()).toBeVisible();

    await page.goto("/portal/customers");
    await expect(page.getByRole("link", { name: /ver contacto/i })).toBeVisible();
  });
  test("shows manual Loyalty amounts separately from POS spending and respects module suspension", async ({ page }) => {
    await prisma.organizationModule.create({ data: { organizationId: orgId, module: "LOYALTY", status: "ACTIVE" } });
    const customer = await prisma.customer.findFirstOrThrow({ where: { organizationId: orgId } });
    const program = await prisma.loyaltyProgram.create({ data: { organizationId: orgId, name: "Club de prueba" } });
    const member = await prisma.loyaltyMember.create({ data: {
      organizationId: orgId, programId: program.id, customerId: customer.id,
      name: customer.name!, whatsapp: customer.phone, whatsappKey: customer.phoneKey,
      postalCode: "64000", publicToken: randomBytes(18).toString("base64url"),
      consentTextVersion: "v2", consentAt: new Date(), totalVisits: 1, visitsWithAmount: 1, totalSpent: 150,
    } });
    await prisma.loyaltyVisit.createMany({ data: [
      { organizationId: orgId, programId: program.id, memberId: member.id, saleAmount: 150, idempotencyKey: "manual:customer-history", programVersion: 1, cycleNumber: 1 },
      { organizationId: orgId, programId: program.id, memberId: member.id, saleAmount: 50, idempotencyKey: "manual:customer-voided", programVersion: 1, cycleNumber: 1, status: "VOIDED" },
    ] });
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    await page.goto("/portal/customers");
    await page.getByRole("link", { name: "Ver compras y recompensas" }).click();
    const activity = page.locator("details").filter({ hasText: "Actividad de Lealtad" });
    await expect(activity.locator("summary")).toContainText("1 visita confirmada");
    await expect(activity.locator("summary")).toContainText("150.00");
    await activity.locator("summary").click();
    await expect(activity.getByText("Registro manual", { exact: true })).toHaveCount(2);
    await expect(activity.getByText("Anulada", { exact: true })).toBeVisible();
    await expect(activity.getByText("Confirmada", { exact: true })).toBeVisible();
    await expect(page.getByText("Visitas registradas en caja")).toBeVisible();
    const unchanged = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(Number(unchanged.totalSpent)).toBe(1250);
    expect(unchanged.visitCount).toBe(3);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: orgId, module: "LOYALTY" } }, data: { status: "SUSPENDED" } });
    await page.reload();
    await expect(page.locator("details")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /ver lealtad/i })).toHaveCount(0);
  });

  test("customer profile shows only this customer’s purchases and works on mobile", async ({ page }) => {
    const customer = await prisma.customer.findFirstOrThrow({ where: { organizationId: orgId, phoneKey: "5599990001" } });
    const other = await prisma.customer.create({ data: { organizationId: orgId, name: "Otro cliente", phone: "+525599990002", phoneKey: "5599990002" } });
    await prisma.foodSale.createMany({ data: [
      { organizationId: orgId, customerId: customer.id, grossAmount: 250, netAmount: 250, externalOrderId: "customer-purchase" },
      { organizationId: orgId, customerId: customer.id, grossAmount: -50, netAmount: -50, isCancellation: true },
      { organizationId: orgId, customerId: other.id, grossAmount: 777, netAmount: 777 },
      ...[1, 2, 3, 4, 5].map(n => ({ organizationId: orgId, customerId: customer.id, grossAmount: 100 + n, netAmount: 100 + n, occurredAt: new Date(Date.now() - (40 + n) * 86400000) })),
    ] });
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/portal\//);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/portal/customers/${customer.id}`);
    await expect(page.getByRole("heading", { name: "Marta Compradora" })).toBeVisible();
    await expect(page.locator("#purchases")).toContainText("250.00");
    await expect(page.locator("#purchases")).toContainText("Devolución / cancelación");
    await expect(page.locator("#purchases")).not.toContainText("777.00");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator("#purchases li").count()).toBe(5);
    await page.getByRole("link", { name: "Siguientes →" }).click();
    await expect(page.locator("#purchases")).toContainText("105.00");
    expect(await prisma.foodSale.count({ where: { organizationId: orgId, customerId: customer.id } })).toBe(7);
    await page.goto("/portal/customers/not-a-customer");
    await expect(page.getByRole("heading", { name: "Marta Compradora" })).toHaveCount(0);
  });

});
