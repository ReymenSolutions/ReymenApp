import { test, expect } from "@playwright/test";
import type { Cookie } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const stamp = Date.now(), password = "Phase2Fixture12345";
const ownerEmail = `phase2-owner-${stamp}@example.com`, agentEmail = `phase2-agent-${stamp}@example.com`;
let organizationId: string, cookies: Cookie[], instanceId: string;
async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login"); await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.locator('input[type="password"]').fill(password); await page.locator('button[type="submit"]').click();
  await page.waitForURL(url => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

async function appearance(page: import("@playwright/test").Page, theme: "light" | "dark", language: "es" | "en") {
  const userMenu = page.locator("header > div").last().locator(":scope > button").last();
  await userMenu.click();
  await page.getByRole("button", { name: theme === "dark" ? /^(Oscuro|Dark)$/ : /^(Claro|Light)$/, exact: true }).click();
  await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } })).theme).toBe(theme);
  await page.getByRole("button", { name: language.toUpperCase(), exact: true }).click();
  await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } })).language).toBe(language);
  await userMenu.click();
}

test.describe("Phase 2 responsive AI Center", () => {
  test.describe.configure({ mode: "default" });
  test.beforeAll(async ({ browser }) => {
    const org = await prisma.organization.create({ data: { name: `Phase2 E2E ${stamp}`, slug: `phase2-e2e-${stamp}`, n8nWebhookSecret: randomBytes(32).toString("hex") } }); organizationId = org.id;
    await prisma.organizationModule.createMany({ data: ["CRM", "AI_WHATSAPP"].map(module => ({ organizationId, module: module as "CRM" | "AI_WHATSAPP", status: "ACTIVE" })) });
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.createMany({ data: [{ email: ownerEmail, name: "Owner", role: "OWNER", organizationId, passwordHash }, { email: agentEmail, name: "Agent", role: "AGENT", organizationId, passwordHash }] });
    await prisma.whatsAppAssistant.create({ data: { organizationId, name: "Sofía del negocio", capabilities: [], phoneNumber: "8112345678" } });
    await prisma.agentChannelSetting.createMany({ data: ["whatsapp", "instagram", "messenger", "webchat", "email", "enquiry"].map(channel => ({ organizationId, channel, mode: channel === "whatsapp" ? "SUGGEST" : "OFF" })) });
    await prisma.knowledgeBase.createMany({ data: Array.from({ length: 23 }, (_, i) => ({ organizationId, title: `Artículo ${String(i).padStart(2, "0")}`, content: `Contenido breve ${i}`, category: i % 2 ? "Servicios" : "Horario", tags: [] })) });
    for (let i = 0; i < 12; i++) {
      const conv = await prisma.conversation.create({ data: { organizationId, channel: i % 2 ? "whatsapp" : "instagram", contactName: `Cliente ${i}`, lastMessageRole: "USER" } });
      await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content: "Horario?" } });
    }
    await prisma.agentDefinition.upsert({ where: { key_version: { key: "legacy-assistant", version: 1 } }, create: { key: "legacy-assistant", version: 1, displayName: "Asistente existente", specialty: "legacy", manifest: { runtime: "phase0", effectsOwner: "legacy", tools: [], commercialUnit: "channel", schemaVersion: 1 } }, update: {} });
    const assistant = await prisma.whatsAppAssistant.findUniqueOrThrow({ where: { organizationId } });
    const instance = await prisma.agentInstance.create({ data: { organizationId, definitionKey: "legacy-assistant", definitionVersion: 1, publicName: assistant.name, legacyAssistantId: assistant.id } }); instanceId = instance.id;
    await prisma.agentConfigRevision.create({ data: { organizationId, agentInstanceId: instanceId, version: 1, sourceHash: "fixture", snapshot: { private: "private-configuration-not-for-traces" } } });
    await prisma.agentExecution.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ organizationId, agentInstanceId: instanceId, configVersion: 1, conversationId: "fixture", messageId: `fixture-${i}`, operation: "ai.auto_reply", legacyJobId: `fixture-${stamp}-${i}`, status: i === 0 ? "WAITING_HANDOFF" : "SUCCEEDED" })) });
    const context = await browser.newContext(); const page = await context.newPage(); await login(page, ownerEmail); cookies = await context.cookies(); await context.close();
  });
  test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });
  test.afterAll(async () => {
    if (organizationId) {
      await prisma.knowledgeGrant.deleteMany({ where: { organizationId } });
      await prisma.knowledgeRevision.deleteMany({ where: { organizationId } });
      await prisma.knowledgeAccessPolicy.deleteMany({ where: { organizationId } });
      await prisma.agentExecutionStep.deleteMany({ where: { organizationId } }); await prisma.agentExecution.deleteMany({ where: { organizationId } });
      await prisma.agentConfigRevision.deleteMany({ where: { organizationId } }); await prisma.agentInstance.deleteMany({ where: { organizationId } });
      await prisma.agentModelRollout.deleteMany({ where: { organizationId } });
      await prisma.message.deleteMany({ where: { conversation: { organizationId } } }); await prisma.conversation.deleteMany({ where: { organizationId } });
      await prisma.knowledgeBase.deleteMany({ where: { organizationId } }); await prisma.whatsAppAssistant.deleteMany({ where: { organizationId } });
      await prisma.businessRulebook.deleteMany({ where: { organizationId } }); await prisma.agentChannelSetting.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } }); await prisma.organizationModule.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } }); await prisma.organization.delete({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
  });
  test("overview distinguishes total counters from five recent rows and uses real navigation", async ({ page }) => {
    await page.goto("/portal/whatsapp");
    await expect(page.getByRole("heading", { name: "Centro de asistentes IA" })).toBeVisible();
    const metrics = page.getByRole("region", { name: "Resumen", exact: true });
    await expect(metrics.locator('span[aria-hidden="true"]').filter({ hasText: /^12$/ })).toHaveCount(2);
    await expect(page.getByRole("link", { name: /^Cliente / })).toHaveCount(5);
    await page.getByRole("link", { name: "Mis asistentes", exact: true }).click();
    await expect(page.getByRole("link", { name: "Configurar", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mis asistentes", exact: true })).toHaveAttribute("aria-current", "page");
  });
  test("profile saves through the versioned contract, preserves failed edits and paginates activity", async ({ page }) => {
    await page.goto("/portal/ai-agents/assistant");
    await expect(page.getByRole("button", { name: "Ver detalle", exact: true })).toHaveCount(10);
    await page.getByRole("button", { name: "Ver detalle", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toContainText("Configuración observada");
    await expect(page.getByRole("dialog")).not.toContainText("private-configuration");
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ver detalle", exact: true }).first()).toBeFocused();
    await page.getByRole("link", { name: "Siguiente", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ver detalle", exact: true })).toHaveCount(2);
    await page.getByLabel("Nombre que verá tu cliente").fill("Sofía renovada");
    await page.getByRole("button", { name: "Guardar nombre", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Nombre guardado" })).toBeVisible();
    expect(await prisma.agentInstance.findUnique({ where: { id: instanceId } })).toMatchObject({ publicName: "Sofía renovada", configVersion: 2 });
    await page.route("**/portal/ai-agents/assistant**", route => route.request().method() === "POST" ? route.fulfill({ status: 500, body: "failure" }) : route.continue());
    await page.getByLabel("Nombre que verá tu cliente").fill("Edición preservada"); await page.getByRole("button", { name: "Guardar nombre", exact: true }).click();
    await expect(page.getByRole("alert", { name: "No se pudo guardar. Conservamos lo que escribiste." })).toBeVisible(); await expect(page.getByLabel("Nombre que verá tu cliente")).toHaveValue("Edición preservada");
  });
  test("knowledge supports ten-row pages, search, categories and collapsed content", async ({ page }) => {
    await page.goto("/portal/knowledge-base"); await expect(page.getByText("Ver contenido", { exact: true })).toHaveCount(10);
    await page.getByRole("link", { name: "Siguiente", exact: true }).click(); await expect(page).toHaveURL(/page=2/);
    await page.getByLabel("Buscar artículos", { exact: true }).fill("Artículo 22"); await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Artículo 22", exact: true })).toBeVisible(); await expect(page.getByText("Ver contenido", { exact: true })).toHaveCount(1);
    await page.locator("summary").filter({ hasText: "Ver contenido" }).click(); await expect(page.getByText("Contenido breve 22", { exact: true })).toBeVisible();
    await page.getByLabel("Buscar artículos", { exact: true }).fill("No existe"); await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByText("No hay artículos para esta búsqueda", { exact: true })).toBeVisible();
  });
  test("channel modes do not claim verified health; automatic mode requires accessible confirmation", async ({ page }) => {
    await page.goto("/portal/ai-channels"); await expect(page.getByText("Conexión sin verificar", { exact: true })).toHaveCount(6);
    const group = page.getByRole("radiogroup", { name: "WhatsApp", exact: true }); await group.getByRole("radio", { name: "Con aprobación", exact: true }).focus();
    await page.keyboard.press("ArrowRight"); await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
    await expect(group.getByRole("radio", { name: "Autónomo", exact: true })).toBeFocused();
    expect(await prisma.agentChannelSetting.findUnique({ where: { organizationId_channel: { organizationId, channel: "whatsapp" } } })).toMatchObject({ mode: "SUGGEST" });
    await expect(page.getByText(/ANTHROPIC_API_KEY|n8n/)).toHaveCount(0);
  });
  test("mobile light/dark, desktop, zoom and English avoid horizontal page overflow", async ({ page }) => {
    test.setTimeout(240000);
    page.setDefaultTimeout(15000);
    for (const width of [320, 360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ["light", "dark"]) {
        await page.goto("/portal/whatsapp"); await appearance(page, theme as "light" | "dark", "es");
        for (const path of ["whatsapp", "ai-agents", "ai-agents/assistant", "ai-channels", "knowledge-base", "ai-lab", "ai-usage"]) {
          await page.goto(`/portal/${path}`); await expect(page.locator("main h1")).toBeVisible();
          expect(await page.locator("html").evaluate(el => el.classList.contains("dark")), `${width}/${theme}/${path}`).toBe(theme === "dark");
          expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${width}/${theme}/${path}`).toBe(true);
          expect(await page.locator("html").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        }
      }
    }
    await appearance(page, "light", "en"); await page.goto("/portal/whatsapp");
    await expect(page.getByRole("heading", { name: "AI Assistant Center", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 640, height: 900 }); await page.locator("html").evaluate(el => { el.style.zoom = "2"; });
    expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.locator("html").evaluate(el => { el.style.zoom = ""; });
    await appearance(page, "dark", "es");
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/portal/whatsapp");
    await page.screenshot({ path: "/tmp/reymen-phase2-mobile-dark.png", fullPage: true });
    await appearance(page, "light", "en");
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto("/portal/ai-agents/assistant");
    await page.screenshot({ path: "/tmp/reymen-phase2-desktop-light.png", fullPage: true });
  });
  test("single remaining metric fills a row for one through nine items and one through four columns", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto("/portal/whatsapp");
    const failures = await page.evaluate(() => {
      const failures: string[] = [];
      for (const [columns, width] of [[1, 200], [2, 400], [3, 650], [4, 820]]) {
        for (let n = 1; n <= 9; n++) {
          const container = document.createElement("div"); container.className = "metric-grid-container"; container.style.width = `${width}px`;
          const grid = document.createElement("div"); grid.className = "metric-grid"; grid.dataset.columns = String(Math.max(2, columns));
          for (let i = 0; i < n; i++) grid.appendChild(document.createElement("div")); container.appendChild(grid); document.body.appendChild(container);
          const last = grid.lastElementChild as HTMLElement;
          if (n % columns === 1 || columns === 1) { if (Math.abs(last.getBoundingClientRect().width - grid.getBoundingClientRect().width) > 1) failures.push(`${columns}/${n}`); }
          container.remove();
        }
      }
      return failures;
    }); expect(failures).toEqual([]);
  });
  test("read-only staff cannot access edit/test/usage controls", async ({ page, context }) => {
    await context.clearCookies(); await login(page, agentEmail); await page.goto("/portal/ai-agents/assistant");
    await expect(page.getByRole("button", { name: "Guardar nombre", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ver detalle", exact: true })).toHaveCount(0);
    await page.goto("/portal/knowledge-base"); await expect(page.getByRole("button", { name: "Nuevo artículo", exact: true })).toHaveCount(0);
    await page.goto("/portal/ai-lab"); await expect(page).toHaveURL(/portal\/dashboard/);
    await page.goto("/portal/ai-usage"); await expect(page).toHaveURL(/portal\/dashboard/);
  });
});
