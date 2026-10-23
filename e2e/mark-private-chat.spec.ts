import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
const p = new PrismaClient(), stamp = randomUUID(), password = "PrivateChatBrowser12345";
const email = `chat-owner-${stamp}@example.test`;
let organizationId: string;
async function login(page: Page) {
  await page.goto("/login"); await page.locator('input[type="email"]').fill(email); await page.locator('input[type="password"]').fill(password); await page.locator('button[type="submit"]').click(); await page.waitForURL(url => !url.pathname.startsWith("/login"));
}
test.beforeAll(async () => {
  const org = await p.organization.create({ data: { name: "Private chat browser fixture", slug: `chat-browser-${stamp}`, n8nWebhookSecret: randomUUID() } }); organizationId = org.id;
  await p.organizationModule.create({ data: { organizationId, module: "AI_WHATSAPP", status: "ACTIVE" } });
  await p.user.create({ data: { email, name: "Chat owner", organizationId, role: "OWNER", passwordHash: await bcrypt.hash(password, 12) } });
});
test.afterAll(async () => {
  if (organizationId) {
    await p.markChatTurn.deleteMany({ where: { organizationId } }); await p.markChatPilot.deleteMany({ where: { organizationId } });
    await p.message.deleteMany({ where: { conversation: { organizationId } } }); await p.conversation.deleteMany({ where: { organizationId } });
    await p.auditLog.deleteMany({ where: { organizationId } }); await p.organizationModule.deleteMany({ where: { organizationId } });
    await p.user.deleteMany({ where: { organizationId } }); await p.organization.delete({ where: { id: organizationId } });
  }
  await p.$disconnect();
});
test("private chat remains absent with its feature disabled", async ({ page }) => {
  test.skip(process.env.REYMEN_STAGING === "true" && process.env.AI_MARK_PRIVATE_CHAT_ENABLED === "true", "Enabled scenario");
  await login(page); await page.goto("/portal/mark-chat-pilot"); await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  expect((await page.request.get("/api/mark-chat")).status()).toBe(404);
});
test("visitor requests human support, operator responds, and revocation preserves history without a paid call", async ({ page, browser }) => {
  test.skip(process.env.REYMEN_STAGING !== "true" || process.env.AI_MARK_PRIVATE_CHAT_ENABLED !== "true", "Private chat flag only");
  await login(page); await page.goto("/portal/mark-chat-pilot");
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Crear conversación privada" }).click();
  const visitorUrl = await page.getByRole("link", { name: /Abrir.*visitante/ }).getAttribute("href");
  const operatorUrl = await page.getByRole("link", { name: /Abrir.*conversación|Revisar.*conversación/ }).getAttribute("href");
  expect(visitorUrl).toContain("#token="); expect(operatorUrl).toContain("/portal/conversations/");
  const visitorContext = await browser.newContext(), visitor = await visitorContext.newPage();
  try {
    await visitor.goto(visitorUrl!); await visitor.getByRole("textbox").fill("Quiero hablar con una persona"); await visitor.getByRole("button", { name: "Enviar mensaje", exact: true }).click();
    await expect(visitor.getByText(/equipo|persona|humano/).first()).toBeVisible();
    await page.goto(operatorUrl!); await expect(page.getByRole("region", { name: "Revisión de Lía en conversación privada" })).toContainText("ESCALATED");
    await expect(page.getByRole("button", { name: "Generar borrador de Lía" })).toHaveCount(0);
    await page.getByText("Escribir una respuesta humana", { exact: true }).click(); await page.getByLabel("Respuesta humana", { exact: true }).fill("Hola, soy la persona que te atenderá.");
    await page.getByRole("checkbox", { name: /Revisé el texto/ }).check(); await page.getByRole("button", { name: "Enviar respuesta humana", exact: true }).click();
    await expect(visitor.getByText("Hola, soy la persona que te atenderá.", { exact: true })).toBeVisible();
    for (const width of [320, 390, 768]) { await page.setViewportSize({ width, height: 900 }); expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true); }
    await page.getByText("Enlace privado y recuperación", { exact: true }).click(); await page.getByRole("button", { name: "Revocar enlace y cerrar piloto" }).click();
    await expect(visitor.getByRole("alert")).toBeVisible();
    expect(await p.aiUsage.count({ where: { organizationId } })).toBe(0); expect(await p.aiPilotBudgetRoot.count({ where: { organizationId } })).toBe(0);
    expect(await p.message.count({ where: { conversation: { organizationId } } })).toBe(2);
  } finally { await visitorContext.close(); }
});
