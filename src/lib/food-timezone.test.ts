// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { getFoodDailySales, getFoodHourlySales, getFoodSalesSummary, processFoodPosOrder } from "./food";

// AUD-015: el día de negocio de Food es el de la zona horaria de CADA organización, no el del servidor.
describe("día de negocio por zona de la organización", () => {
  const orgs: Record<"mx" | "tokyo", { id: string; variantId: string }> = {} as never;
  const SALE = "2026-10-14T02:00:00Z"; // 20:00 del 13 en México; 11:00 del 14 en Tokio

  beforeAll(async () => {
    for (const [key, tz] of [["mx", "America/Mexico_City"], ["tokyo", "Asia/Tokyo"]] as const) {
      const org = await createTestOrg(`Food TZ ${key}`);
      await prisma.organization.update({ where: { id: org.id }, data: { timezone: tz } });
      await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
      const dish = await prisma.foodDish.create({
        data: { organizationId: org.id, name: "Café", variants: { create: [{ organizationId: org.id, label: "Único", price: 50 }] } },
        include: { variants: true },
      });
      orgs[key] = { id: org.id, variantId: dish.variants[0].id };
      await processFoodPosOrder({ occurredAt: SALE, grossAmount: 50, netAmount: 43.1, items: [{ variantId: dish.variants[0].id, quantity: 1 }] }, org.id);
    }
    // "Ahora" para los reportes: 03:00Z del 14 = 21:00 del 13 en México y 12:00 del 14 en Tokio.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T03:00:00Z"));
  });
  afterAll(async () => {
    vi.useRealTimers();
    await cleanupOrg(orgs.mx.id);
    await cleanupOrg(orgs.tokyo.id);
  });

  it("el conteo diario del platillo se guarda en la fecha LOCAL de cada organización", async () => {
    const mx = await prisma.foodDishSale.findFirstOrThrow({ where: { organizationId: orgs.mx.id } });
    const tokyo = await prisma.foodDishSale.findFirstOrThrow({ where: { organizationId: orgs.tokyo.id } });
    expect(mx.occurredAt.toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(tokyo.occurredAt.toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });

  it("la gráfica diaria cuenta la venta en el día local de cada una", async () => {
    const mx = await getFoodDailySales(orgs.mx.id, 2);
    expect(mx.map((d) => [d.date, d.count])).toEqual([["2026-10-12", 0], ["2026-10-13", 1]]);
    const tokyo = await getFoodDailySales(orgs.tokyo.id, 2);
    expect(tokyo.map((d) => [d.date, d.count])).toEqual([["2026-10-13", 0], ["2026-10-14", 1]]);
  });

  it("la hora de la venta es la local y 'hoy' empieza a la medianoche local", async () => {
    expect((await getFoodHourlySales(orgs.mx.id))[20].count).toBe(1);
    expect((await getFoodHourlySales(orgs.tokyo.id))[11].count).toBe(1);
    expect((await getFoodSalesSummary(orgs.mx.id)).today.count).toBe(1);
    expect((await getFoodSalesSummary(orgs.tokyo.id)).today.count).toBe(1);
  });
});
