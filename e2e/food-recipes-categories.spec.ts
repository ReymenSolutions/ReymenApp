import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();
const TEST_EMAIL = "e2e-food-recipes-cat@example.com";
const TEST_PASSWORD = "FoodRecipesCat123";

test.describe("recetas: platillos por categoría", () => {
  test.describe.configure({ mode: "serial" });
  let orgId: string;

  test.beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `E2E Recipes Cat ${Date.now()}`, slug: `e2e-recipes-cat-${Date.now()}`, n8nWebhookSecret: randomBytes(32).toString("hex"), plan: "professional" },
    });
    orgId = org.id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.user.create({
      data: { email: TEST_EMAIL, name: "E2E Recipes Owner", role: "OWNER", organizationId: org.id, passwordHash: await bcrypt.hash(TEST_PASSWORD, 12), language: "es" },
    });
    const bebidas = await prisma.foodDishCategory.create({ data: { organizationId: org.id, name: "Bebidas E2E" } });
    const postres = await prisma.foodDishCategory.create({ data: { organizationId: org.id, name: "Postres E2E" } });
    const mk = (name: string, categoryId: string | null) =>
      prisma.foodDish.create({ data: { organizationId: org.id, name, categoryId, variants: { create: [{ organizationId: org.id, label: "Único", price: 50 }] } } });
    for (let i = 1; i <= 9; i++) await mk(`Bebida ${i}`, bebidas.id);
    for (let i = 1; i <= 4; i++) await mk(`Postre ${i}`, postres.id);
    await mk("Platillo suelto", null);
  });

  test.afterAll(async () => {
    await prisma.foodDish.deleteMany({ where: { organizationId: orgId } });
    await prisma.foodDishCategory.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
  });

  test("agrupa por categoría, y un clic en cualquier parte del platillo abre su edición", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
    await page.goto("/portal/food/recipes");

    // Una lista larga arranca contraída: se ven las categorías, no los platillos.
    const bebidas = page.getByRole("button", { name: /Bebidas E2E/ });
    await expect(bebidas).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar Bebida 1" })).toHaveCount(0);

    await expect(async () => {
      await bebidas.click();
      await expect(page.getByRole("button", { name: "Editar Bebida 1" })).toBeVisible({ timeout: 1500 });
    }).toPass();

    // Clic en el platillo (no en el lápiz) abre el editor de ese platillo.
    await expect(async () => {
      await page.getByRole("button", { name: "Editar Bebida 1" }).click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1500 });
    }).toPass();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Editar platillo" })).toBeVisible();
    await expect(page.getByRole("dialog").locator('input[name="name"]')).toHaveValue("Bebida 1");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // El lápiz sigue funcionando.
    await page.getByRole("button", { name: "Editar platillo" }).first().click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Editar platillo" })).toBeVisible();
    await page.keyboard.press("Escape");

    // La búsqueda atraviesa las categorías.
    await page.getByPlaceholder(/buscar platillo/i).fill("postre 3");
    await expect(page.getByRole("button", { name: "Editar Postre 3" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar Bebida 1" })).toHaveCount(0);
  });
});
