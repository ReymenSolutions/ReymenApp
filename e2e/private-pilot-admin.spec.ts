import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

const p = new PrismaClient(), stamp = randomUUID(), password = "PrivatePilotFixture12345";
const admin = `pilot-admin-${stamp}@example.test`, owner = `pilot-owner-${stamp}@example.test`;
let organizationId: string;
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.startsWith("/login"));
}
test.beforeAll(async () => {
  const org = await p.organization.create({ data: { name: "Private pilot browser fixture", slug: `pilot-admin-${stamp}`, n8nWebhookSecret: randomUUID() } });
  organizationId = org.id;
  await p.organizationModule.create({ data: { organizationId, module: "AI_WHATSAPP", status: "ACTIVE" } });
  const passwordHash = await bcrypt.hash(password, 12);
  await p.user.createMany({ data: [{ email: admin, name: "Pilot admin", role: "SUPER_ADMIN", passwordHash }, { email: owner, name: "Pilot owner", role: "OWNER", organizationId, passwordHash }] });
});
test.afterAll(async () => {
  if (organizationId) {
    await p.agentConfigRevision.deleteMany({ where: { organizationId } });
    await p.agentInstance.deleteMany({ where: { organizationId } });
    await p.aiPilotBudgetPolicy.deleteMany({ where: { organizationId } });
    await p.auditLog.deleteMany({ where: { organizationId } });
    await p.organizationModule.deleteMany({ where: { organizationId } });
    await p.user.deleteMany({ where: { email: { in: [admin, owner] } } });
    await p.organization.delete({ where: { id: organizationId } });
  }
  await p.$disconnect();
});
test("private administrative controls remain unavailable outside staging", async ({ page }) => {
  test.skip(process.env.REYMEN_STAGING === "true", "Verified by the non-staging CI scenario");
  await login(page, admin);
  await page.goto(`/admin/ai-pilot?organization=${organizationId}`);
  // App Router can stream the shell with HTTP 200 before rendering notFound().
  await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Preparar Mark pausado|Prepare paused Mark/ })).toHaveCount(0);
  expect(await p.agentInstance.count({ where: { organizationId } })).toBe(0);
});
test("admin prepares Mark once without a provider call, delivery or budget activation", async ({ page }) => {
  test.skip(process.env.REYMEN_STAGING !== "true", "Requires the isolated staging CI scenario");
  await login(page, admin);
  await page.goto(`/admin/ai-pilot?organization=${organizationId}`);
  await page.getByRole("button", { name: /Preparar Mark pausado|Prepare paused Mark/ }).click();
  await expect(page.getByRole("button", { name: /^Mark preparado$|^Mark prepared$/ })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Mark preparado$|^Mark prepared$/ })).toBeDisabled();
  const instance = await p.agentInstance.findUniqueOrThrow({ where: { organizationId_definitionKey: { organizationId, definitionKey: "mark" } }, include: { channelRoutes: true } });
  expect(instance.status).toBe("PAUSED"); expect(instance.channelRoutes).toEqual([]);
  expect((await p.aiPilotBudgetPolicy.findUniqueOrThrow({ where: { organizationId } })).enabled).toBe(false);
  expect(await p.aiUsage.count({ where: { organizationId } })).toBe(0);
  expect(await p.auditLog.count({ where: { organizationId, action: "ai.private_pilot.prepare" } })).toBe(1);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
});
test("business owners cannot open the platform pilot controls", async ({ page }) => {
  test.skip(process.env.REYMEN_STAGING !== "true", "Requires the isolated staging CI scenario");
  await login(page, owner);
  await page.goto(`/admin/ai-pilot?organization=${organizationId}`);
  await expect(page).toHaveURL(/\/portal\//);
  await expect(page.getByRole("button", { name: /Preparar Mark pausado|Prepare paused Mark/ })).toHaveCount(0);
});
