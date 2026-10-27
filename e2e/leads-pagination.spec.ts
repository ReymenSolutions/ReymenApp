import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-leads-pagination@example.com";
const TEST_PASSWORD = "LeadsPagination123";

test.describe("leads pagination and server-side search", () => {
  // Both tests share one beforeAll-seeded org/user — force them into the same
  // worker so beforeAll runs exactly once (fullyParallel can otherwise split
  // a file's tests across workers, each re-running beforeAll and colliding
  // on the fixed test user's unique email).
  test.describe.configure({ mode: "serial" });

  let orgId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `E2E Leads Pagination ${Date.now()}`,
        slug: `e2e-leads-pagination-${Date.now()}`,
        n8nWebhookSecret: randomBytes(32).toString("hex"),
      },
    });
    orgId = org.id;

    // New orgs start with zero modules enabled (see OrganizationModule) —
    // grant CRM so this org can actually reach /portal/leads.
    await prisma.organizationModule.create({
      data: { organizationId: org.id, module: "CRM", status: "ACTIVE", source: "SUBSCRIBED" },
    });

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Leads Pagination", role: "OWNER", organizationId: org.id, passwordHash },
    });

    // 62 leads: enough for a 50-per-page listing to span two pages.
    await prisma.lead.createMany({
      data: Array.from({ length: 62 }, (_, i) => ({
        organizationId: org.id,
        name: `Pagination Lead ${i}`,
        source: "manual",
        createdAt: new Date(Date.now() - i * 1000),
      })),
    });
  });

  test.afterAll(async () => {
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  test("shows exactly one page of leads and a working Siguiente/Anterior control", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    await page.goto("/portal/leads");
    await expect(page.locator("table tbody tr")).toHaveCount(50);
    await expect(page.getByText("Mostrando 1–50 de 62")).toBeVisible();

    // El botón puede pintarse antes de que la página termine de cargar su
    // código (en CI es lento): si el clic cae antes, no navega. Se reintenta
    // el clic hasta que la URL cambie.
    await expect(async () => {
      await page.getByRole("button", { name: "Siguiente" }).click();
      await page.waitForURL(/page=2/, { timeout: 5_000 });
    }).toPass({ timeout: 25_000 });
    await expect(page.locator("table tbody tr")).toHaveCount(12);

    await page.getByRole("button", { name: "Anterior" }).click();
    await page.waitForURL((url) => !url.search.includes("page=2"));
    await expect(page.locator("table tbody tr")).toHaveCount(50);
  });

  test("search finds a lead that isn't on the currently loaded page", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    // "Pagination Lead 60" is one of the oldest, so it's on page 2 by default —
    // searching from page 1 must still find it via a server round trip.
    await page.goto("/portal/leads");
    await page.fill('input[placeholder*="nombre"]', "Pagination Lead 60");
    await expect(page.getByText("Pagination Lead 60", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("table tbody tr")).toHaveCount(1);
  });
});
