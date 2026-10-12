// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPlan, getPlans, invalidatePlanCache, monthlyPriceMxn, planDescription, planLabels, planName } from "./plans";

describe("catálogo de planes", () => {
  afterAll(async () => {
    await prisma.plan.deleteMany({ where: { key: "plans-test" } });
    invalidatePlanCache();
  });

  it("trae los tres planes con lo que antes estaba en el código", async () => {
    const plans = await getPlans();
    expect(plans.map((p) => p.key).slice(0, 3)).toEqual(["starter", "professional", "business"]);
    const [starter, pro, business] = plans;
    expect([starter.priceMxn, pro.priceMxn, business.priceMxn]).toEqual([999, 1999, 3999]);
    expect(starter.limits).toEqual({ leads: 500, users: 2, automations: 3 });
    expect(pro.limits).toEqual({ leads: 5000, users: 10, automations: 10 });
    expect(business.limits).toEqual({ leads: null, users: null, automations: null }); // ilimitado = null
    expect([starter.aiBudgetMxn, pro.aiBudgetMxn, business.aiBudgetMxn]).toEqual([75, 200, 500]);
    expect([starter.maxAiAgents, pro.maxAiAgents, business.maxAiAgents]).toEqual([1, 3, 5]);
    expect(starter.features.length).toBeGreaterThan(3);
    expect(planName(business, "es")).toBe("Business");
    expect(planDescription(business, "en")).toBe("");
  });

  it("una llave que no existe se trata como el plan de entrada; el precio pactado reemplaza al de lista", async () => {
    expect((await getPlan("no-existe")).key).toBe("starter");
    const pro = await getPlan("professional");
    expect(monthlyPriceMxn(pro, null)).toBe(1999);
    expect(monthlyPriceMxn(pro, 1500)).toBe(1500);
    expect(monthlyPriceMxn(pro, 0)).toBe(1999);
    expect((await planLabels("es")).professional).toBe("Professional");
  });

  it("los planes retirados no se ofrecen pero siguen valiendo para quien ya los tiene; el caché se invalida al editar", async () => {
    await prisma.plan.create({ data: { key: "plans-test", name: "Prueba", nameEn: "Test", priceMxn: 1, aiBudgetMxn: 1, isActive: false, sortOrder: 99 } });
    invalidatePlanCache();
    expect((await getPlans()).some((p) => p.key === "plans-test")).toBe(false);
    expect((await getPlans({ includeInactive: true })).some((p) => p.key === "plans-test")).toBe(true);
    expect((await getPlan("plans-test")).key).toBe("plans-test");
    // Cambio directo en la base: el caché lo muestra viejo hasta invalidarlo.
    await prisma.plan.update({ where: { key: "plans-test" }, data: { name: "Nuevo nombre" } });
    expect((await getPlan("plans-test")).name).toBe("Prueba");
    invalidatePlanCache();
    expect((await getPlan("plans-test")).name).toBe("Nuevo nombre");
  });
});
