import { test, expect, type Cookie } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHmac, randomBytes } from "node:crypto";
const p = new PrismaClient(), stamp = Date.now(), password = "Phase3Fixture12345";
const owner = `phase3-owner-${stamp}@example.com`, staff = `phase3-staff-${stamp}@example.com`;
let organizationId: string, secret: string, agentId: string, cookies: Cookie[];
async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login"); await page.locator('input[type="email"]').fill(email); await page.locator('input[type="password"]').fill(password); await page.locator('button[type="submit"]').click(); await page.waitForURL(url => !url.pathname.startsWith("/login"));
}
test.beforeAll(async ({ browser }) => {
  secret = randomBytes(32).toString("hex");
  const org = await p.organization.create({ data: { name: "Phase3 account fixture", slug: `phase3-e2e-${stamp}`, n8nWebhookSecret: secret } }); organizationId = org.id;
  await p.organizationModule.createMany({ data: ["CRM", "AI_WHATSAPP"].map(module => ({ organizationId, module: module as "CRM" | "AI_WHATSAPP", status: "ACTIVE" })) });
  const passwordHash = await bcrypt.hash(password, 12);
  await p.user.createMany({ data: [{ email: owner, role: "OWNER", organizationId, passwordHash }, { email: staff, role: "AGENT", organizationId, passwordHash }] });
  const assistant = await p.whatsAppAssistant.create({ data: { organizationId, name: "Asistente conservado", capabilities: [] } });
  await p.agentDefinition.upsert({ where: { key_version: { key: "legacy-assistant", version: 1 } }, create: { key: "legacy-assistant", version: 1, displayName: "Asistente existente", specialty: "legacy", manifest: { runtime: "phase0", effectsOwner: "legacy", tools: [], commercialUnit: "channel", schemaVersion: 1 } }, update: {} });
  const agent = await p.agentInstance.create({ data: { organizationId, definitionKey: "legacy-assistant", definitionVersion: 1, publicName: assistant.name, legacyAssistantId: assistant.id } }); agentId = agent.id;
  await p.agentConfigRevision.create({ data: { organizationId, agentInstanceId: agent.id, version: 1, sourceHash: "fixture", snapshot: {} } });
  const context = await browser.newContext(); const page = await context.newPage(); await login(page, owner); cookies = await context.cookies(); await context.close();
});
test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });
test.afterAll(async () => {
  await p.channelRouting.deleteMany({ where: { organizationId } }); await p.channelConnection.deleteMany({ where: { organizationId } });
  await p.webhookEvent.deleteMany({ where: { organizationId } }); await p.agentConfigRevision.deleteMany({ where: { organizationId } }); await p.agentInstance.deleteMany({ where: { organizationId } });
  await p.whatsAppAssistant.deleteMany({ where: { organizationId } }); await p.auditLog.deleteMany({ where: { organizationId } });
  await p.organizationModule.deleteMany({ where: { organizationId } }); await p.user.deleteMany({ where: { organizationId } }); await p.organization.delete({ where: { id: organizationId } }); await p.$disconnect();
});
test("registers without activating, enables only after signed verification and permits manual routing/pause", async ({ page, request }) => {
  await page.goto("/portal/ai-channels");
  await page.getByLabel("Nombre para identificar la cuenta").fill("WhatsApp de prueba");
  await page.getByLabel("Identificador de cuenta del proveedor").fill("fixture-account");
  await page.getByRole("button", { name: "Registrar sin activar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "WhatsApp de prueba", exact: true })).toBeVisible();
  const enable = page.getByRole("button", { name: "Habilitar cuenta verificada", exact: true }); await expect(enable).toBeDisabled();
  const row = await p.channelConnection.findFirstOrThrow({ where: { organizationId } }); expect(row).toMatchObject({ enabled: false, state: "UNVERIFIED" });
  const body = JSON.stringify({ version: 1, type: "health", connectionId: row.id, externalAccountKey: "fixture-account", generation: 1, eventId: "health-1", sequence: 1, observedAt: new Date().toISOString(), state: "HEALTHY", providerVerified: true, canReceive: true, canSend: true, outboundContractVersion: 1 });
  const timestamp = String(Date.now()), signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  expect((await request.post("/api/webhooks/n8n/channels", { data: body, headers: { "content-type": "application/json", "x-reymen-orgid": organizationId, "x-reymen-timestamp": timestamp, "x-reymen-signature": signature } })).status()).toBe(200);
  await page.getByRole("button", { name: "Actualizar estado", exact: true }).click(); await expect(enable).toBeEnabled(); await enable.click();
  await expect(page.getByText("Disponible según el conector", { exact: true })).toBeVisible();
  const select = page.getByLabel("Asistente que atiende", { exact: true }); await select.selectOption(agentId);
  await expect.poll(async () => (await p.channelRouting.findUnique({ where: { connectionId: row.id } }))?.agentInstanceId).toBe(agentId);
  await expect(select).toBeEnabled(); await select.selectOption("");
  await expect.poll(async () => (await p.channelRouting.findUnique({ where: { connectionId: row.id } }))?.enabled).toBe(false);
  await expect(page.getByRole("button", { name: "Pausar cuenta", exact: true })).toBeEnabled(); await page.getByRole("button", { name: "Pausar cuenta", exact: true }).click();
  await expect(enable).toBeDisabled(); expect(await p.channelConnection.findUnique({ where: { id: row.id } })).toMatchObject({ enabled: false, generation: 2 });
  await page.route("**/portal/ai-channels**", route => route.request().method() === "POST" ? route.fulfill({ status: 500, body: "failure" }) : route.continue());
  await page.getByLabel("Nombre para identificar la cuenta").fill("Texto conservado"); await page.getByLabel("Identificador de cuenta del proveedor").fill("another-fixture"); await page.getByRole("button", { name: "Registrar sin activar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo guardar" })).toBeVisible(); await expect(page.getByLabel("Nombre para identificar la cuenta")).toHaveValue("Texto conservado");
});
test("account controls remain readable on small screens and unavailable to read-only staff", async ({ page, context }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto("/portal/ai-channels");
    await expect(page.getByRole("heading", { name: "Cuentas de canal", exact: true })).toBeVisible();
    expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(async () => page.locator("aside.sidebar").evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(1); await page.screenshot({ path: "/tmp/reymen-phase3-accounts-mobile.png", fullPage: true });
  await context.clearCookies(); await login(page, staff); await page.goto("/portal/ai-channels");
  await expect(page.getByRole("button", { name: "Registrar sin activar", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Asistente que atiende", { exact: true })).toHaveCount(0);
});
