import { test, expect, type Cookie } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
const p = new PrismaClient(), stamp = Date.now(), password = "Phase5Fixture12345";
const owner = `phase5-owner-${stamp}@example.com`, viewer = `phase5-viewer-${stamp}@example.com`;
let organizationId: string, cookies: Cookie[];
async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login"); await page.locator('input[type="email"]').fill(email); await page.locator('input[type="password"]').fill(password); await page.locator('button[type="submit"]').click(); await page.waitForURL(url => !url.pathname.startsWith("/login"));
}
test.beforeAll(async ({ browser }) => {
  const org = await p.organization.create({ data: { name: "Phase5 Mark fixture", slug: `mark-e2e-${stamp}`, n8nWebhookSecret: randomBytes(32).toString("hex") } }); organizationId = org.id;
  await p.organizationModule.createMany({ data: ["CRM", "AI_WHATSAPP"].map(module => ({ organizationId, module: module as "CRM" | "AI_WHATSAPP", status: "ACTIVE" })) });
  const passwordHash = await bcrypt.hash(password, 12);
  await p.user.createMany({ data: [{ email: owner, role: "OWNER", organizationId, passwordHash }, { email: viewer, role: "VIEWER", organizationId, passwordHash }] });
  const context = await browser.newContext(); const page = await context.newPage(); await login(page, owner); cookies = await context.cookies(); await context.close();
});
test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });
test.afterAll(async () => {
  if (organizationId) {
    await p.agentSandboxRun.deleteMany({ where: { organizationId } }); await p.auditLog.deleteMany({ where: { organizationId } }); await p.organizationModule.deleteMany({ where: { organizationId } }); await p.user.deleteMany({ where: { organizationId } }); await p.organization.delete({ where: { id: organizationId } });
  }
  await p.$disconnect();
});
test("Mark uses fictional data, respects the read permission and stores a receipt without input text", async ({ page }) => {
  await page.goto("/portal/ai-lab"); const panel = page.getByRole("region", { name: "Lía · pruebas con datos de ejemplo", exact: true });
  await expect(panel.getByText(/No evalúa un modelo ni una conexión real/)).toBeVisible();
  const result = panel.getByRole("status", { name: "Resultado de prueba de Lía", exact: true });
  await panel.getByRole("button", { name: "Probar Lía", exact: true }).click(); await expect(result).toContainText("de lunes a viernes de 9:00 a 18:00");
  await panel.getByLabel("Pregunta de prueba", { exact: true }).fill("mis visitas"); await panel.getByRole("button", { name: "Probar Lía", exact: true }).click(); await expect(result).toContainText("La consulta no tiene permiso");
  await panel.getByLabel("Consultar compras del cliente ficticio", { exact: true }).check(); await panel.getByRole("button", { name: "Probar Lía", exact: true }).click(); await expect(result).toContainText("2 visitas y $150");
  await panel.getByRole("button", { name: "Detener y limpiar", exact: true }).click(); await expect(result).toHaveCount(0);
  await panel.getByLabel("Pregunta de prueba", { exact: true }).fill("hablar con una persona"); await panel.getByRole("button", { name: "Probar Lía", exact: true }).click(); await expect(result).toContainText("El cliente pidió ayuda");
  const privateInput = "no_guarden_este_8112345678";
  await panel.getByLabel("Pregunta de prueba", { exact: true }).fill(privateInput); await panel.getByRole("button", { name: "Probar Lía", exact: true }).click(); await expect(result).toContainText("Falta información");
  const runs = await p.agentSandboxRun.findMany({ where: { organizationId } }); expect(runs).toHaveLength(5); expect(JSON.stringify(runs)).not.toContain(privateInput);
  expect(await p.aiUsage.count({ where: { organizationId } })).toBe(0); expect(await p.conversation.count({ where: { organizationId } })).toBe(0); expect(await p.customer.count({ where: { organizationId } })).toBe(0); expect(await p.agentInstance.count({ where: { organizationId } })).toBe(0);
});
test("transport errors preserve input and never claim that a response was sent", async ({ page }) => {
  await page.goto("/portal/ai-lab"); const panel = page.getByRole("region", { name: "Lía · pruebas con datos de ejemplo", exact: true });
  await page.route("**/portal/ai-lab**", route => route.request().method() === "POST" ? route.fulfill({ status: 500, body: "failure" }) : route.continue());
  await panel.getByLabel("Pregunta de prueba", { exact: true }).fill("Pregunta conservada"); await panel.getByRole("button", { name: "Probar Lía", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("No se pudo completar la prueba"); await expect(panel.getByLabel("Pregunta de prueba", { exact: true })).toHaveValue("Pregunta conservada");
  await expect(panel.getByRole("status", { name: "Resultado de prueba de Lía", exact: true })).toHaveCount(0);
});
test("Mark test controls remain responsive, localized and unavailable to a viewer", async ({ page, context }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto("/portal/ai-lab"); await expect(page.getByRole("heading", { name: "Lía · pruebas con datos de ejemplo", exact: true })).toBeVisible();
    expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(async () => page.locator("aside.sidebar").evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(1); await page.getByLabel("Pregunta de prueba", { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: "/tmp/reymen-phase5-mark-mobile.png" });
  const menu = page.locator("header > div").last().locator(":scope > button").last(); await menu.click(); await page.getByRole("button", { name: "EN", exact: true }).click(); await menu.click(); await page.goto("/portal/ai-lab");
  await expect(page.getByRole("heading", { name: "Lía · tests with sample data", exact: true })).toBeVisible();
  await context.clearCookies(); await login(page, viewer); await page.goto("/portal/ai-lab"); await expect(page).toHaveURL(/\/portal\/dashboard/); await expect(page.getByRole("heading", { name: /Lía ·/ })).toHaveCount(0);
});
