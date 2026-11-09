// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, createTestPipelineStages, cleanupOrg, fakeSession } from "@/test/helpers";
import { processFoodPosOrder } from "./food";
import { saveProgram, enrollMember, registerVisit } from "./loyalty/service";
import { posRedemption } from "./loyalty/redemption";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN" }));

const { previewClientReset, resetClientData, resetConfirmationMatches } = await import("./client-reset");
const { previewClientResetAction, resetClientDataAction } = await import("@/actions/admin/client-reset");

/** Un negocio con un poco de todo: CRM, Foods (venta del POS con receta), compra, Lealtad con canje, automatizaciones. */
async function seedBusiness(label: string) {
  const org = await createTestOrg(label);
  await prisma.organizationModule.createMany({ data: (["FOOD_OPS", "LOYALTY", "REYMEN_POS"] as const).map((module) => ({ organizationId: org.id, module })) });
  const owner = await createTestUser(org.id, "OWNER", `reset-${label.length}`);
  const stages = await createTestPipelineStages(org.id);

  // CRM
  const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Contacto de prueba", phone: "+5218111111111" } });
  const opp = await prisma.opportunity.create({ data: { organizationId: org.id, leadId: lead.id, pipelineStageId: stages[0].id, title: "Oportunidad" } });
  await prisma.task.create({ data: { organizationId: org.id, title: "Llamar", leadId: lead.id, opportunityId: opp.id } });
  await prisma.note.create({ data: { organizationId: org.id, leadId: lead.id, content: "Nota" } });
  const conv = await prisma.conversation.create({ data: { organizationId: org.id, leadId: lead.id, channel: "whatsapp", contactPhone: "+5218111111111" } });
  await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content: "Hola" } });
  await prisma.appointment.create({ data: { organizationId: org.id, leadId: lead.id, title: "Cita", startTime: new Date(), endTime: new Date(Date.now() + 3_600_000) } });
  const rule = await prisma.followUpRule.create({ data: { organizationId: org.id, name: "24h", triggerStatus: "NEW", delayMinutes: 60, maxAttempts: 1, channel: "whatsapp", template: "Hola", isActive: true } });
  await prisma.followUpLog.create({ data: { leadId: lead.id, ruleId: rule.id } });

  // Foods: menú con receta y una venta del POS (descuenta inventario, cuenta platillos)
  const leche = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Leche", unit: "lt", unitCost: 20, currentStock: 10, minStock: 1 } });
  const dish = await prisma.foodDish.create({
    data: { organizationId: org.id, name: "Latte", variants: { create: [{ organizationId: org.id, label: "Único", price: 60, ingredients: { create: [{ inventoryItemId: leche.id, quantity: 0.25 }] } }] } },
    include: { variants: true },
  });
  await processFoodPosOrder({ occurredAt: new Date().toISOString(), grossAmount: 120, netAmount: 103.45, items: [{ variantId: dish.variants[0].id, quantity: 2 }] }, org.id);
  const supplier = await prisma.foodSupplier.create({ data: { organizationId: org.id, name: "Lácteos" } });
  await prisma.foodPurchase.create({ data: { organizationId: org.id, supplierId: supplier.id, purchasedAt: new Date(), total: 200, items: { create: [{ inventoryItemId: leche.id, quantity: 10, unitCost: 20 }] } } });
  await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 10000 } });

  // Lealtad: programa, integrante con visitas, recompensa ganada y un canje reservado en el POS
  await saveProgram(org.id, owner.id, { name: "Club", description: null, status: "ACTIVE", visitGoal: 2, rewardType: "DISCOUNT_AMOUNT", rewardValue: 50, rewardName: "$50", rewardDescription: null, rewardHeadline: null, scope: "ORGANIZATION", branchId: null });
  const enrolled = await enrollMember(org.slug, { name: "Cliente", whatsapp: "8155512345", postalCode: "64000", email: null, branchId: null, consent: true });
  if (enrolled.status !== "created") throw new Error("enroll");
  const member = await prisma.loyaltyMember.findUniqueOrThrow({ where: { publicToken: enrolled.token } });
  const t0 = Date.now() + 60_000;
  for (const n of [0, 1]) await registerVisit({ organizationId: org.id, employeeUserId: owner.id, memberId: member.id, branchId: null, saleAmount: 100, idempotencyKey: `v-${label}-${n}`, now: new Date(t0 + n * 600_000) });
  const reward = await prisma.loyaltyReward.findFirstOrThrow({ where: { memberId: member.id } });
  await posRedemption(org.id, { action: "reserve", orderId: randomUUID(), deviceId: "caja", phone: member.whatsapp, subtotalCents: 15_000, rewardId: reward.id });

  // Automatizaciones: configuración (se queda) y lo que ejecutó (se borra)
  const automation = await prisma.automation.create({ data: { organizationId: org.id, name: "Recuperar", type: "blueprint", webhookSecret: "s", blueprintKey: "customer_recovery", blueprintVersion: 1, trigger: "customer.at_risk", dryRun: false, config: {} } });
  const event = await prisma.domainEvent.create({ data: { organizationId: org.id, type: "customer.at_risk", subjectType: "customer", subjectId: "c1", occurredAt: new Date(), dedupeKey: `e-${randomUUID()}` } });
  await prisma.automationExecution.create({ data: { organizationId: org.id, automationId: automation.id, domainEventId: event.id, subjectType: "customer", subjectId: "c1", status: "SUCCEEDED", action: { type: "message" } } });

  return { org, owner, dishId: dish.id, lecheId: leche.id, automationId: automation.id };
}

const kept = async (orgId: string) => ({
  users: await prisma.user.count({ where: { organizationId: orgId } }),
  modules: await prisma.organizationModule.count({ where: { organizationId: orgId } }),
  dishes: await prisma.foodDish.count({ where: { organizationId: orgId } }),
  items: await prisma.foodInventoryItem.count({ where: { organizationId: orgId } }),
  suppliers: await prisma.foodSupplier.count({ where: { organizationId: orgId } }),
  stages: await prisma.pipelineStage.count({ where: { organizationId: orgId } }),
  rules: await prisma.followUpRule.count({ where: { organizationId: orgId } }),
  programs: await prisma.loyaltyProgram.count({ where: { organizationId: orgId } }),
  costs: await prisma.foodOperatingCost.count({ where: { organizationId: orgId } }),
  automations: await prisma.automation.count({ where: { organizationId: orgId } }),
});

describe("Dejar como nuevo (borrar datos de prueba de un cliente)", () => {
  let a: Awaited<ReturnType<typeof seedBusiness>>;
  let b: Awaited<ReturnType<typeof seedBusiness>>;

  beforeAll(async () => {
    a = await seedBusiness("Reset A");
    b = await seedBusiness("Reset B otro negocio");
  });
  afterAll(async () => {
    for (const o of [a, b]) {
      await prisma.loyaltyPosRedemption.deleteMany({ where: { organizationId: o.org.id } });
      await cleanupOrg(o.org.id);
    }
  });

  it("la vista previa cuenta lo que se borraría sin borrar nada", async () => {
    const s = await previewClientReset(a.org.id);
    expect(s).toMatchObject({ leads: expect.any(Number), opportunities: 1, tasks: 1, appointments: 1, conversations: 1, messages: 1, sales: 1, purchases: 1, automationRuns: 1 });
    expect(s.leads).toBeGreaterThanOrEqual(1);
    expect(s.loyaltyMembers).toBe(1);
    expect(s.loyaltyVisits).toBe(2);
    expect(s.stockItems).toBe(1);
    expect(await prisma.foodSale.count({ where: { organizationId: a.org.id } })).toBe(1);
  });

  it("borra toda la operación, conserva menú, usuarios y configuración, deja existencias en 0 y no toca a otro negocio", async () => {
    const keptBefore = await kept(a.org.id);
    const otherBefore = { ...(await previewClientReset(b.org.id)), ...(await kept(b.org.id)) };

    await resetClientData(a.org.id);

    const after = await previewClientReset(a.org.id);
    expect(Object.values(after).every((n) => n === 0)).toBe(true);
    for (const n of await Promise.all([
      prisma.foodDishSale.count({ where: { organizationId: a.org.id } }),
      prisma.foodRecipeUsage.count({ where: { organizationId: a.org.id } }),
      prisma.loyaltyReward.count({ where: { organizationId: a.org.id } }),
      prisma.loyaltyPosRedemption.count({ where: { organizationId: a.org.id } }),
      prisma.domainEvent.count({ where: { organizationId: a.org.id } }),
      prisma.note.count({ where: { organizationId: a.org.id } }),
      prisma.followUpLog.count({ where: { lead: { organizationId: a.org.id } } }),
      prisma.metric.count({ where: { organizationId: a.org.id } }),
    ])) expect(n).toBe(0);
    expect(await kept(a.org.id)).toEqual(keptBefore);
    expect(Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: a.lecheId } })).currentStock)).toBe(0);

    expect({ ...(await previewClientReset(b.org.id)), ...(await kept(b.org.id)) }).toEqual(otherBefore);
  });

  it("solo un admin de la plataforma, escribiendo el nombre exacto del negocio, y queda en la bitácora", async () => {
    expect(resetConfirmationMatches("Villa Gardenia", " Villa Gardenia ")).toBe(true);
    expect(resetConfirmationMatches("Villa Gardenia", "villa gardenia")).toBe(false);
    expect(resetConfirmationMatches("", "")).toBe(false);

    authMock.mockResolvedValue(fakeSession({ id: b.owner.id, role: "OWNER", organizationId: b.org.id }));
    await expect(previewClientResetAction({ orgId: b.org.id })).rejects.toThrow(/autorizado/i);
    await expect(resetClientDataAction({ orgId: b.org.id, confirm: b.org.name })).rejects.toThrow(/autorizado/i);

    const admin = await createTestUser(null, "SUPER_ADMIN", "reset-admin");
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "SUPER_ADMIN", organizationId: null }));
    await expect(resetClientDataAction({ orgId: b.org.id, confirm: "otro nombre" })).rejects.toThrow(/nombre exacto/);
    expect((await previewClientReset(b.org.id)).sales).toBe(1);

    const out = await resetClientDataAction({ orgId: b.org.id, confirm: b.org.name });
    expect(out.sales).toBe(1);
    expect((await previewClientReset(b.org.id)).sales).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: b.org.id, action: "client.data_reset" } });
    expect(audit.metadata).toMatchObject({ sales: 1, opportunities: 1 });
    await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });
});
