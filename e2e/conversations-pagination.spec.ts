import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-conversations-pagination@example.com";
const TEST_PASSWORD = "ConvPagination123";

test.describe("conversations list pagination and message thread load-older", () => {
  // Both tests share one beforeAll-seeded org/user — force them into the
  // same worker so beforeAll runs exactly once (see leads-pagination.spec.ts
  // for why).
  test.describe.configure({ mode: "serial" });

  let orgId: string;
  let longConversationId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: `E2E Conversations Pagination ${Date.now()}`,
        slug: `e2e-conv-pagination-${Date.now()}`,
        n8nWebhookSecret: randomBytes(32).toString("hex"),
      },
    });
    orgId = org.id;

    // New orgs start with zero modules enabled (see OrganizationModule) —
    // grant AI_WHATSAPP so this org can actually reach /portal/conversations.
    await prisma.organizationModule.create({
      data: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE", source: "SUBSCRIBED" },
    });

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Conv Pagination", role: "OWNER", organizationId: org.id, passwordHash },
    });

    // 55 conversations: enough for a 50-per-page listing to span two pages.
    for (let i = 0; i < 55; i++) {
      const conv = await prisma.conversation.create({
        data: {
          organizationId: org.id,
          channel: "whatsapp",
          contactName: `Conv Pagination Contact ${i}`,
          updatedAt: new Date(Date.now() - i * 1000),
        },
      });
      if (i === 0) longConversationId = conv.id;
    }

    // Give one conversation 75 messages so "load older" has something to page through.
    await prisma.message.createMany({
      data: Array.from({ length: 75 }, (_, m) => ({
        conversationId: longConversationId,
        role: m % 2 === 0 ? "USER" : "ASSISTANT",
        content: `Test message ${m}`,
        createdAt: new Date(Date.now() - (75 - m) * 1000),
      })),
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

  test("shows one page of conversations with a working Siguiente link", async ({ page }) => {
    await login(page);
    await page.goto("/portal/conversations");
    await expect(page.locator("table tbody tr")).toHaveCount(50);
    await expect(page.getByText("Mostrando 1–50 de 55")).toBeVisible();

    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.waitForURL(/page=2/);
    await expect(page.locator("table tbody tr")).toHaveCount(5);
  });

  test("a long conversation shows only the latest 50 messages, with a working load-older button", async ({ page }) => {
    await login(page);
    await page.goto(`/portal/conversations/${longConversationId}`);

    const loadOlderButton = page.getByRole("button", { name: /Cargar mensajes anteriores/ });
    await expect(loadOlderButton).toBeVisible();

    // 75 total messages, latest 50 shown initially.
    const messageBubbles = page.locator("p.whitespace-pre-wrap");
    await expect(messageBubbles).toHaveCount(50);
    await expect(page.getByText("Test message 25")).toBeVisible(); // oldest of the initial 50
    await expect(page.getByText("Test message 0")).not.toBeVisible();

    await loadOlderButton.click();
    await expect(messageBubbles).toHaveCount(75, { timeout: 5_000 });
    await expect(page.getByText("Test message 0")).toBeVisible();
    // All 75 loaded now, so the button should be gone.
    await expect(loadOlderButton).not.toBeVisible();
  });
});
