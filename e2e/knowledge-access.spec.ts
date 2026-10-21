import { test, expect, type Cookie } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
const p = new PrismaClient(), stamp = Date.now(), password = "Phase4Fixture12345";
const owner = `phase4-owner-${stamp}@example.com`, viewer = `phase4-viewer-${stamp}@example.com`;
let organizationId: string, sourceId: string, cookies: Cookie[];
async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login"); await page.locator('input[type="email"]').fill(email); await page.locator('input[type="password"]').fill(password); await page.locator('button[type="submit"]').click(); await page.waitForURL(url => !url.pathname.startsWith("/login"));
}
test.beforeAll(async ({ browser }) => {
  const org = await p.organization.create({ data: { name: "Phase4 knowledge fixture", slug: `phase4-e2e-${stamp}`, n8nWebhookSecret: randomBytes(32).toString("hex") } }); organizationId = org.id;
  await p.organizationModule.createMany({ data: ["CRM", "AI_WHATSAPP"].map(module => ({ organizationId, module: module as "CRM" | "AI_WHATSAPP", status: "ACTIVE" })) });
  const passwordHash = await bcrypt.hash(password, 12);
  await p.user.createMany({ data: [{ email: owner, role: "OWNER", organizationId, passwordHash }, { email: viewer, role: "VIEWER", organizationId, passwordHash }] });
  const assistant = await p.whatsAppAssistant.create({ data: { organizationId, name: "Asistente de prueba", capabilities: [] } });
  await p.agentDefinition.upsert({ where: { key_version: { key: "legacy-assistant", version: 1 } }, create: { key: "legacy-assistant", version: 1, displayName: "Asistente existente", specialty: "legacy", manifest: { runtime: "phase0", effectsOwner: "legacy", tools: [], commercialUnit: "channel", schemaVersion: 1 } }, update: {} });
  await p.agentInstance.create({ data: { organizationId, definitionKey: "legacy-assistant", definitionVersion: 1, publicName: assistant.name, legacyAssistantId: assistant.id } });
  const source = await p.knowledgeBase.create({ data: { organizationId, title: "Horario de atención", content: "Abrimos sábados de 9 a 2.", tags: ["visita"], category: "FAQ" } }); sourceId = source.id;
  const context = await browser.newContext(); const page = await context.newPage(); await login(page, owner); cookies = await context.cookies(); await context.close();
});
test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });
test.afterAll(async () => {
  if (organizationId) {
    await p.knowledgeGrant.deleteMany({ where: { organizationId } }); await p.knowledgeRevision.deleteMany({ where: { organizationId } }); await p.knowledgeAccessPolicy.deleteMany({ where: { organizationId } });
    await p.agentInstance.deleteMany({ where: { organizationId } }); await p.knowledgeBase.deleteMany({ where: { organizationId } }); await p.whatsAppAssistant.deleteMany({ where: { organizationId } });
    await p.auditLog.deleteMany({ where: { organizationId } }); await p.organizationModule.deleteMany({ where: { organizationId } }); await p.user.deleteMany({ where: { organizationId } }); await p.organization.delete({ where: { id: organizationId } });
  }
  await p.$disconnect();
});
test("review, publication, assignment, preview and recoverable removal use real server actions", async ({ page }) => {
  await page.goto("/portal/knowledge-base"); await expect(page.getByText("Usando lector anterior: 8 artículos activos recientes", { exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: "Publicación y acceso" }).click();
  const review = page.getByRole("button", { name: "Revisar versión actual", exact: true }); await review.click();
  await expect(page.getByRole("dialog")).toContainText("Abrimos sábados de 9 a 2."); await page.keyboard.press("Escape"); await expect(review).toBeFocused();
  await review.click(); await page.getByRole("button", { name: "Confirmar revisión y publicar", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const published = page.getByLabel("Versión publicada", { exact: true }); await expect(published.locator("option", { hasText: "v1" })).toHaveCount(1); await published.selectOption("1");
  await page.getByRole("button", { name: "Asignar versión", exact: true }).click(); await expect(page.getByText("Versión asignada: v1", { exact: true })).toBeVisible();
  await page.getByLabel("Probar una pregunta sin enviar respuestas", { exact: true }).fill("horario"); await page.getByRole("button", { name: "Ver fuentes", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publicadas y asignadas" })).toContainText("Seleccionadas: 1");
  await page.getByRole("button", { name: "Activar fuentes autorizadas", exact: true }).click(); await expect(page.getByText("Usando solo versiones publicadas y asignadas", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar artículo: Horario de atención", exact: true }).click(); await page.getByLabel("Contenido *", { exact: true }).fill("Borrador aún no publicado"); await page.getByRole("button", { name: "Guardar cambios", exact: true }).click(); await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(async () => (await p.knowledgeBase.findUniqueOrThrow({ where: { id: sourceId } })).knowledgeVersion).toBe(2);
  expect((await p.knowledgeBase.findUniqueOrThrow({ where: { id: sourceId } })).tags).toEqual(["visita"]);
  await page.getByRole("button", { name: "Ver fuentes", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Publicadas y asignadas" })).toContainText("Seleccionadas: 1");
  await page.getByRole("button", { name: "Retirar acceso", exact: true }).click(); await expect(page.getByText("Sin acceso", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver fuentes", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Publicadas y asignadas" })).toContainText("Seleccionadas: 0");
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Desactivar artículo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reactivar artículo", exact: true })).toBeVisible();
  expect(await p.knowledgeRevision.count({ where: { articleId: sourceId } })).toBe(2);
  await page.getByRole("button", { name: "Reactivar artículo", exact: true }).click(); await expect(page.getByRole("button", { name: "Reactivar artículo", exact: true })).toBeHidden();
  await page.route("**/portal/knowledge-base**", route => route.request().method() === "POST" ? route.fulfill({ status: 500, body: "failure" }) : route.continue());
  await page.getByLabel("Probar una pregunta sin enviar respuestas", { exact: true }).fill("Pregunta conservada"); await page.getByRole("button", { name: "Ver fuentes", exact: true }).click();
  await expect(page.getByText("No se pudo guardar. Actualiza y revisa de nuevo; tus datos siguen aquí.", { exact: true })).toBeVisible(); await expect(page.getByLabel("Probar una pregunta sin enviar respuestas", { exact: true })).toHaveValue("Pregunta conservada");
});
test("knowledge access stays responsive, localized and hidden from read-only staff", async ({ page, context }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto("/portal/knowledge-base"); await expect(page.getByRole("heading", { name: "Fuentes autorizadas", exact: true })).toBeVisible();
    await page.locator("summary").filter({ hasText: "Publicación y acceso" }).click();
    expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(async () => page.locator("aside.sidebar").evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(1); await page.screenshot({ path: "/tmp/reymen-phase4-knowledge-mobile.png", fullPage: true });
  await page.getByRole("heading", { name: "Horario de atención", exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: "/tmp/reymen-phase4-source-mobile.png" });
  const menu = page.locator("header > div").last().locator(":scope > button").last(); await menu.click(); await page.getByRole("button", { name: "EN", exact: true }).click(); await menu.click(); await page.goto("/portal/knowledge-base");
  await expect(page.getByRole("heading", { name: "Authorized sources", exact: true })).toBeVisible();
  await context.clearCookies(); await login(page, viewer); await page.goto("/portal/knowledge-base");
  await expect(page.getByRole("button", { name: "Revisar versión actual", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Ver fuentes", exact: true })).toHaveCount(0);
});
