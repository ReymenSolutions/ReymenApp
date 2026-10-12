import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { mkdirSync, writeFileSync } from "fs";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-inbox@example.com";
const TEST_PASSWORD = "Inbox12345";
const STATE = "test-results/inbox-auth.json";
// Se inicia sesión una vez y se reutiliza (el login tiene límite de intentos por IP).
mkdirSync("test-results", { recursive: true });
writeFileSync(STATE, JSON.stringify({ cookies: [], origins: [] }));

test.describe("inbox unificado", () => {
  test.describe.configure({ mode: "serial" });
  let orgId: string;
  let igId: string;

  test.use({ storageState: STATE });

  test.beforeAll(async ({ browser }) => {
    const org = await prisma.organization.create({
      data: { name: `E2E Inbox ${Date.now()}`, slug: `e2e-inbox-${Date.now()}`, n8nWebhookSecret: randomBytes(32).toString("hex") },
    });
    orgId = org.id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "CRM", status: "ACTIVE", source: "SUBSCRIBED" } });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    await prisma.user.create({ data: { email: TEST_EMAIL, name: "E2E Inbox", role: "OWNER", organizationId: org.id, passwordHash } });
    const mk = async (data: Record<string, unknown>, content: string) => {
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, lastMessagePreview: content, lastMessageRole: "USER", unreadCount: 1, ...data } as never });
      await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content } });
      return conv;
    };
    igId = (await mk({ channel: "instagram", contactHandle: "@casey", contactName: "Casey Instagram" }, "¿Cuánto cuesta el cajón?")).id;
    await mk({ channel: "email", contactEmail: "shannon@correo.com", contactName: "Shannon Correo", subject: "Cotización Y62" }, "Quiero cotizar un refrigerador");
    await mk({ channel: "webchat", contactHandle: "v-1", contactName: "Tahlia Chat" }, "¿Abren los sábados?");
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    await ctx.storageState({ path: STATE });
    await ctx.close();
  });

  test.afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversation: { organizationId: orgId } } });
    await prisma.conversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  test("lista todos los canales, filtra por pestaña y muestra los pendientes", async ({ page }) => {
    await page.goto("/portal/dashboard");
    await page.getByRole("link", { name: /^Inbox/ }).click();
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    for (const name of ["Casey Instagram", "Shannon Correo", "Tahlia Chat"]) await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();

    await page.getByRole("tab", { name: /Instagram/ }).click();
    await expect(page.getByRole("button", { name: /Casey Instagram/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Shannon Correo/ })).toHaveCount(0);

    await page.getByRole("tab", { name: /Correo y consultas/ }).click();
    await expect(page.getByRole("button", { name: /Shannon Correo/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Cotización Y62/ })).toBeVisible();
  });

  test("abrir un hilo lo marca como leído y se puede archivar y recuperar", async ({ page }) => {
    await page.goto(`/portal/inbox?c=${igId}`);
    await expect(page.getByRole("heading", { name: "Casey Instagram" })).toBeVisible();
    await expect.poll(async () => (await prisma.conversation.findUniqueOrThrow({ where: { id: igId } })).unreadCount).toBe(0);

    await page.getByRole("button", { name: "Archivar" }).click();
    await expect(page.getByText("Conversación archivada")).toBeVisible();
    await page.goto("/portal/inbox");
    await expect(page.getByRole("button", { name: /Casey Instagram/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Archivadas" }).click();
    await expect(page.getByRole("button", { name: /Casey Instagram/ })).toBeVisible();
  });

  test("la búsqueda encuentra por nombre o mensaje", async ({ page }) => {
    await page.goto("/portal/inbox?folder=all");
    await page.getByPlaceholder(/Buscar por nombre/).fill("sábados");
    await expect(page.getByRole("button", { name: /Tahlia Chat/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Shannon Correo/ })).toHaveCount(0);
  });
});
