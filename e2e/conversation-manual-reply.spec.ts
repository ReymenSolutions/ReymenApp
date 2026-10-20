import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = `e2e-conversation-manual-reply-${Date.now()}@example.com`;
const TEST_PASSWORD = "ConversationManualReply123";

test.describe("manual WhatsApp reply, take/release control, and assignment", () => {
  test.describe.configure({ mode: "serial" });

  let orgId: string;
  let conversationId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `E2E Conversation Manual Reply ${Date.now()}`,
        slug: `e2e-conversation-manual-reply-${Date.now()}`,
        n8nWebhookSecret: randomBytes(32).toString("hex"),
      },
    });
    orgId = org.id;

    await prisma.organizationModule.create({
      data: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE", source: "SUBSCRIBED" },
    });

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Owner", role: "OWNER", organizationId: org.id, passwordHash },
    });

    const conv = await prisma.conversation.create({
      data: { organizationId: org.id, channel: "whatsapp", contactName: "Cliente E2E", contactPhone: "+15559990000" },
    });
    conversationId = conv.id;
    await prisma.message.create({
      data: { conversationId: conv.id, role: "USER", content: "Hola, necesito ayuda" },
    });
  });

  test.afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversation: { organizationId: orgId } } });
    await prisma.conversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  async function login(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  }

  test("conversation starts AI-handled with a 'Take control' button", async ({ page }) => {
    await login(page);
    await page.goto(`/portal/conversations/${conversationId}`);
    await expect(page.getByRole("button", { name: /tomar control/i })).toBeVisible();
  });

  test("taking control flips the conversation to human mode and reveals the composer", async ({ page }) => {
    await login(page);
    await page.goto(`/portal/conversations/${conversationId}`);
    await page.getByRole("button", { name: /tomar control/i }).click();
    await expect(page.getByRole("button", { name: /devolver a ia/i })).toBeVisible({ timeout: 10_000 });

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.aiHandled).toBe(false);
    expect(conv.assignedToId).not.toBeNull();
  });

  test("sending a manual reply creates an AGENT message visible in the thread", async ({ page }) => {
    await login(page);
    await page.goto(`/portal/conversations/${conversationId}`);
    await page.locator("textarea").last().fill("Claro, con gusto te ayudo");

    // Wait for the Server Action's own request/response round trip (not just
    // a UI poll) — the outbound trigger to n8n, unreachable in this test
    // environment, has its own bounded timeout before the action resolves,
    // so the response can take a few seconds to land.
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/portal/conversations/${conversationId}`) && res.request().method() === "POST" && !!res.request().postData()?.includes("Claro, con gusto te ayudo"), { timeout: 15_000 }),
      page.keyboard.press("Enter"),
    ]);
    expect(response.ok()).toBe(true);

    await expect(page.getByText("Claro, con gusto te ayudo")).toBeVisible();

    await expect.poll(async () => (await prisma.message.findFirst({ where: { conversationId, role: "AGENT" } }))?.content, { timeout: 10_000 }).toBe("Claro, con gusto te ayudo");
  });

  test("releasing to AI clears the assignment and flips aiHandled back on", async ({ page }) => {
    await login(page);
    await page.goto(`/portal/conversations/${conversationId}`);
    await page.getByRole("button", { name: /devolver a ia/i }).click();
    await expect(page.getByRole("button", { name: /tomar control/i })).toBeVisible({ timeout: 10_000 });

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.aiHandled).toBe(true);
    expect(conv.assignedToId).toBeNull();
  });
});
