import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
const p = new PrismaClient(), stamp = randomUUID(), password = "ReviewBrowserFixture12345";
const admin = `review-admin-${stamp}@example.test`, owner = `review-owner-${stamp}@example.test`;
let organizationId: string;
async function login(page: Page, email: string) {
  await page.goto("/login"); await page.locator('input[type="email"]').fill(email); await page.locator('input[type="password"]').fill(password); await page.locator('button[type="submit"]').click(); await page.waitForURL(url => !url.pathname.startsWith("/login"));
}
test.beforeAll(async () => {
  const org = await p.organization.create({ data: { name: "Private review browser fixture", slug: `review-browser-${stamp}`, n8nWebhookSecret: randomUUID() } }); organizationId = org.id;
  await p.organizationModule.create({ data: { organizationId, module: "AI_WHATSAPP", status: "ACTIVE" } });
  const passwordHash = await bcrypt.hash(password, 12);
  await p.user.createMany({ data: [{ email: admin, name: "Review admin", role: "SUPER_ADMIN", passwordHash }, { email: owner, name: "Review owner", organizationId, role: "OWNER", passwordHash }] });
  const source = await p.knowledgeBase.create({ data: { organizationId, title: "Horario ficticio", content: "Horario ficticio de 9 a 18", tags: [], knowledgeVersion: 1 } });
  await p.knowledgeRevision.create({ data: { organizationId, articleId: source.id, version: 1, title: source.title, content: source.content, tags: [], sourceHash: "fixture", publishedAt: new Date() } });
});
test.afterAll(async () => {
  if (organizationId) {
    await p.knowledgeGrant.deleteMany({ where: { organizationId } }); await p.knowledgeRevision.deleteMany({ where: { organizationId } }); await p.knowledgeBase.deleteMany({ where: { organizationId } }); await p.knowledgeAccessPolicy.deleteMany({ where: { organizationId } });
    await p.agentConfigRevision.deleteMany({ where: { organizationId } }); await p.agentInstance.deleteMany({ where: { organizationId } }); await p.aiPilotBudgetPolicy.deleteMany({ where: { organizationId } }); await p.auditLog.deleteMany({ where: { organizationId } });
    await p.organizationModule.deleteMany({ where: { organizationId } }); await p.user.deleteMany({ where: { email: { in: [admin, owner] } } }); await p.organization.delete({ where: { id: organizationId } });
  }
  await p.$disconnect();
});
test("paid-review page is absent unless staging and the dedicated review flag are enabled", async ({ page }) => {
  test.skip(process.env.REYMEN_STAGING === "true" && process.env.AI_MARK_PRIVATE_REVIEW_ENABLED === "true", "Covered by the enabled scenario");
  await login(page, owner); await page.goto("/portal/mark-pilot"); await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
});
test("explicit published-source assignment and an unmatched question cause no paid call", async ({ page, context }) => {
  test.skip(process.env.REYMEN_STAGING !== "true" || process.env.AI_MARK_PRIVATE_REVIEW_ENABLED !== "true", "Dedicated private-review scenario only");
  await login(page, admin); await page.goto(`/admin/ai-pilot?organization=${organizationId}`);
  await page.getByRole("button", { name: /Preparar Lía en pausa|Prepare paused Lía/ }).click();
  await expect(page.getByRole("button", { name: /^Lía preparada$|^Lía prepared$/ })).toBeDisabled();
  await page.getByLabel("Fuente publicada para Lía").selectOption("0"); await page.getByRole("button", { name: "Asignar versión a Lía" }).click();
  await expect(page.getByText(/Fuentes activas para Lía: 1/)).toBeVisible();
  await context.clearCookies(); await login(page, owner); await page.goto("/portal/mark-pilot");
  await page.getByLabel("Pregunta ficticia", { exact: true }).fill("zqxvnotmatching");
  await page.getByRole("checkbox").nth(0).check(); await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Probar con Anthropic" }).click();
  await expect(page.getByRole("status")).toContainText("No se llamó a Anthropic");
  expect(await p.aiUsage.count({ where: { organizationId } })).toBe(0); expect(await p.aiPilotBudgetRoot.count({ where: { organizationId } })).toBe(0);
  for (const width of [320, 390, 768]) { await page.setViewportSize({ width, height: 900 }); expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true); }
});
