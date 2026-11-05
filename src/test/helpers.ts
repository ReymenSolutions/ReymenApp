import { prisma } from "@/lib/prisma";
import { generateSlug, generateWebhookSecret } from "@/lib/utils";
import type { UserRole } from "@prisma/client";
import { createPipelineWithStages, DEFAULT_PIPELINE_NAME, DEFAULT_STAGES } from "@/lib/pipelines";

/** Grants CRM + AI_WHATSAPP + AUTOMATIONS — mirrors the backfill every pre-existing org received when modules were introduced, so tests exercise the "already has access" case by default. */
export async function grantCoreModules(orgId: string) {
  await prisma.organizationModule.createMany({
    data: (["CRM", "AI_WHATSAPP", "AUTOMATIONS"] as const).map((module) => ({
      organizationId: orgId,
      module,
      status: "ACTIVE" as const,
      source: "SUBSCRIBED" as const,
    })),
  });
}

export async function createTestOrg(namePrefix: string) {
  const name = `${namePrefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: { name, slug: generateSlug(name), n8nWebhookSecret: generateWebhookSecret() },
  });
  await grantCoreModules(org.id);
  return org;
}

/** Mirrors the default 6-stage «Ventas» pipeline every org gets via createClient()/the add_crm_pipeline backfill. */
export async function createTestPipelineStages(orgId: string) {
  const pipeline = await createPipelineWithStages(orgId, { name: DEFAULT_PIPELINE_NAME, stages: DEFAULT_STAGES, isDefault: true });
  return prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: "asc" } });
}

export async function createTestUser(orgId: string | null, role: UserRole, emailPrefix: string) {
  const email = `${emailPrefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@test.local`;
  return prisma.user.create({
    data: { email, name: "Test User", role, organizationId: orgId, passwordHash: "unused" },
  });
}

export function fakeSession(user: { id: string; role: UserRole; organizationId: string | null; email?: string | null; name?: string | null }) {
  return {
    user: {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      email: user.email ?? "test@test.local",
      name: user.name ?? "Test User",
      theme: "light",
      language: "es",
      impersonating: null,
    },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

/**
 * Tarifa barata para el modelo por defecto: el gateway de IA no llama a un modelo sin tarifa (no puede calcular su costo,
 * y sin costo no hay presupuesto que cuidar), así que las pruebas que usan IA simulada la necesitan. Idempotente.
 */
export async function seedTestAiRate(provider = "anthropic", models: string[] = ["claude-opus-5-5", "claude-sonnet-5-5"]) {
  for (const model of models) {
    const existing = await prisma.aiRate.findFirst({ where: { provider, model, source: "test-seed" } });
    // En MXN a propósito: así no depende de un tipo de cambio.
    if (!existing) await prisma.aiRate.create({ data: { provider, model, currency: "MXN", inputPerMTok: 0.001, outputPerMTok: 0.001, effectiveFrom: new Date("2020-01-01"), source: "test-seed" } });
  }
}

/** Deletes an org and everything scoped to it, in FK-safe order. Best-effort — used for test cleanup only. */
export async function cleanupOrg(orgId: string) {
  await prisma.agentSandboxRun.deleteMany({ where: { organizationId: orgId } });
  await prisma.knowledgeGrant.deleteMany({ where: { organizationId: orgId } });
  await prisma.knowledgeRevision.deleteMany({ where: { organizationId: orgId } });
  await prisma.knowledgeAccessPolicy.deleteMany({ where: { organizationId: orgId } });
  await prisma.aiUsage.deleteMany({ where: { organizationId: orgId } });
  await prisma.aiPilotBudgetRoot.deleteMany({ where: { organizationId: orgId } });
  await prisma.aiPilotBudgetPolicy.deleteMany({ where: { organizationId: orgId } });
  await prisma.aiBudgetReservation.deleteMany({ where: { organizationId: orgId } });
  await prisma.automationEvent.deleteMany({ where: { organizationId: orgId } });
  await prisma.message.deleteMany({ where: { conversation: { organizationId: orgId } } });
  await prisma.conversation.deleteMany({ where: { organizationId: orgId } });
  await prisma.appointmentReminderLog.deleteMany({ where: { appointment: { organizationId: orgId } } });
  await prisma.appointment.deleteMany({ where: { organizationId: orgId } });
  await prisma.service.deleteMany({ where: { organizationId: orgId } });
  await prisma.availabilityRule.deleteMany({ where: { organizationId: orgId } });
  await prisma.appointmentReminderRule.deleteMany({ where: { organizationId: orgId } });
  await prisma.request.deleteMany({ where: { organizationId: orgId } });
  await prisma.task.deleteMany({ where: { organizationId: orgId } });
  await prisma.opportunity.deleteMany({ where: { organizationId: orgId } });
  await prisma.note.deleteMany({ where: { organizationId: orgId } });
  await prisma.followUpLog.deleteMany({ where: { lead: { organizationId: orgId } } });
  await prisma.followUpRule.deleteMany({ where: { organizationId: orgId } });
  await prisma.lead.deleteMany({ where: { organizationId: orgId } });
  await prisma.pipelineStage.deleteMany({ where: { organizationId: orgId } });
  await prisma.automation.deleteMany({ where: { organizationId: orgId } });
  // Must run before deleting Prompt (which cascades to PromptVersion):
  // PromptExperiment.variantA/B restrict deletion of a still-referenced
  // PromptVersion, so the experiment (and its cascade-deleted samples) has
  // to go first. PromptTestCaseResult/AiSandboxMessage cascade on their own
  // parent's delete, so deleting the parent below is enough for those.
  await prisma.promptExperiment.deleteMany({ where: { organizationId: orgId } });
  await prisma.promptTestCase.deleteMany({ where: { organizationId: orgId } });
  await prisma.aiSandboxSession.deleteMany({ where: { organizationId: orgId } });
  await prisma.prompt.deleteMany({ where: { organizationId: orgId } });
  await prisma.knowledgeBase.deleteMany({ where: { organizationId: orgId } });
  await prisma.whatsAppAssistant.deleteMany({ where: { organizationId: orgId } });
  await prisma.templateInstallation.deleteMany({ where: { organizationId: orgId } });
  await prisma.webhookEvent.deleteMany({ where: { organizationId: orgId } });
  // FoodDishVariant/FoodDishVariantIngredient/FoodDishSale cascade from
  // FoodDish (onDelete: Cascade all the way down), so deleting the dishes
  // is enough to clean up all three.
  // Lealtad: borrar el programa arrastra versiones, miembros, visitas y recompensas (onDelete: Cascade).
  await prisma.loyaltyProgram.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodInventoryMovement.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodPurchase.deleteMany({ where: { organizationId: orgId } });
  await prisma.deliveryOrder.deleteMany({ where: { organizationId: orgId } });
  await prisma.deliveryChannel.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodDish.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodOperatingCost.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodSale.deleteMany({ where: { organizationId: orgId } });
  await prisma.customer.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodKitchenTicket.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodShiftClose.deleteMany({ where: { organizationId: orgId } });
  await prisma.branch.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodModifierOptionIngredient.deleteMany({ where: { option: { group: { organizationId: orgId } } } });
  await prisma.foodModifierGroup.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodInventoryItem.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodSupplier.deleteMany({ where: { organizationId: orgId } });
  await prisma.metric.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationModule.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
}

export { generateWebhookSecret };

/**
 * El reloj de automatizaciones usa un candado global: si otro archivo de pruebas está corriendo su propio tick en ese
 * momento, este responde «locked» y no hace nada. Las pruebas esperan su turno en lugar de fallar por casualidad.
 */
export async function runTickWhenFree(now: Date, opts: { organizationId?: string } = {}) {
  const { runAutomationTick } = await import("@/lib/automation-tick");
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await runAutomationTick(now, opts);
    if (result.ran) return result;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("El reloj de automatizaciones siguió ocupado");
}
