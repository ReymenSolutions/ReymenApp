"use server";

import { syncCustomSubscription } from "@/lib/stripe-contracts";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateSlug, generateWebhookSecret } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { reconcilePlanEntitlements } from "@/lib/plan-entitlements";
import { getPlans } from "@/lib/plans";
import { NEW_ORG_AGENT_SETTINGS } from "@/lib/agent-cap";
import { syncSmartcardMemberLimitForPlan } from "@/lib/smartcard-link";
import { createPipelineWithStages, DEFAULT_PIPELINE_NAME, DEFAULT_STAGES } from "@/lib/pipelines";

const createClientSchema = z.object({
  orgName: z.string().min(2),
  orgIndustry: z.string().optional(),
  plan: z.string().optional(),
  userName: z.string().min(2),
  userEmail: z.string().email(),
  password: z.string().min(8),
});

export async function createClient(formData: FormData) {
  const session = await requireAdmin();

  const parsed = createClientSchema.safeParse({
    orgName: formData.get("orgName"),
    orgIndustry: formData.get("orgIndustry") || undefined,
    plan: formData.get("plan") || undefined,
    userName: formData.get("userName"),
    userEmail: formData.get("userEmail"),
    password: formData.get("password"),
  });

  if (!parsed.success) throw new UserError("Datos inválidos");

  const { orgName, orgIndustry, userName, userEmail, password } = parsed.data;
  const chosen = parsed.data.plan ? (await getPlans()).find(p => p.key === parsed.data.plan) : null;
  if (parsed.data.plan && !chosen) throw new UserError("Plan inválido");
  const slug = generateSlug(orgName);
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.organization.findUnique({ where: { slug } });
  const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

  const org = await prisma.organization.create({
    data: {
      name: orgName,
      slug: finalSlug,
      industry: orgIndustry,
      ...(chosen ? { plan: chosen.key, modules: { create: chosen.modules.map(product => ({ module: product, status: "ACTIVE" as const, source: "SUBSCRIBED" as const })) } } : {}),
      n8nWebhookSecret: generateWebhookSecret(),
      users: {
        create: {
          name: userName,
          email: userEmail,
          passwordHash,
          role: "OWNER",
        },
      },
      // Un cliente nuevo arranca con solo WhatsApp atendido por el agente; el resto de canales se enciende después (cuenta para el tope del plan).
      agentChannelSettings: { create: NEW_ORG_AGENT_SETTINGS },
    },
    include: { users: true },
  });
  // El mismo embudo «Ventas» de 6 etapas que recibió cada organización existente: nunca arranca vacío.
  await createPipelineWithStages(org.id, { name: DEFAULT_PIPELINE_NAME, stages: DEFAULT_STAGES, isDefault: true });

  await logAudit({
    userId: session.user.id,
    action: "client.create",
    resource: "Organization",
    resourceId: org.id,
    metadata: { name: org.name, slug: org.slug },
  });

  revalidatePath("/admin/clients");
  return { success: true, orgId: org.id };
}

export async function changePlan(orgId: string, plan: string, customMonthlyPriceMxn: number | null = null) {
  const session = await requireAdmin();

  // Plan activo del catálogo (o el que el cliente ya tiene: un plan retirado no impide dejarlo como está).
  const catalog = await getPlans({ includeInactive: true });
  const current = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
  const chosen = catalog.find((p) => p.key === plan);
  if (!chosen || (!chosen.isActive && current?.plan !== plan)) throw new UserError("Plan inválido");

  // Precio pactado opcional (plan personalizado de un cliente): vacío = precio de lista del plan.
  const customPrice = customMonthlyPriceMxn;
  if (customPrice !== null && !(Number.isFinite(customPrice) && customPrice > 0)) {
    throw new UserError("El precio personalizado debe ser mayor a 0");
  }

  const org = await prisma.$transaction(async tx => {
    const updated = await tx.organization.update({ where: { id: orgId }, data: { plan, customMonthlyPriceMxn: customPrice, customPlan: false, customMaxLeads: null, customMaxUsers: null, customMaxAutomations: null, customMaxAutomationRuns: null, customMaxAiAgents: null } });
    await reconcilePlanEntitlements(tx, orgId, chosen.modules);
    return updated;

  });

  // SmartCard guarda su propio límite de integrantes; se iguala al del plan.
  const smartcardMemberLimit = await syncSmartcardMemberLimitForPlan(orgId, plan);

  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.plan_change",
    resource: "Organization",
    resourceId: orgId,
    metadata: { newPlan: plan, customMonthlyPriceMxn: customPrice, smartcardMemberLimit, modulesReconciled: true },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/portal/smartcard");
  await syncCustomSubscription(orgId).catch(() => undefined);
  return { success: true, plan: org.plan };
}

export async function updateClientStatus(orgId: string, isActive: boolean) {
  const session = await requireAdmin();

  await prisma.organization.update({
    where: { id: orgId },
    data: { isActive },
  });

  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.status_change",
    resource: "Organization",
    resourceId: orgId,
    metadata: { isActive },
  });

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true };
}

export async function rotateOrgWebhookSecret(orgId: string) {
  const session = await requireAdmin();

  const newSecret = generateWebhookSecret();
  await prisma.organization.update({ where: { id: orgId }, data: { n8nWebhookSecret: newSecret } });

  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.webhook_secret_rotate",
    resource: "Organization",
    resourceId: orgId,
  });

  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true, secret: newSecret };
}

// Llave separada de n8nWebhookSecret, exclusiva para que un POS externo lea
// GET /api/v1/food/menu (Fase 17) -- ver el comentario en el schema sobre
// por qué esto vive aparte de la llave que firma el webhook de órdenes.
export async function rotateFoodPosReadKey(orgId: string) {
  const session = await requireAdmin();

  const newKey = generateWebhookSecret();
  await prisma.organization.update({ where: { id: orgId }, data: { foodPosReadKey: newKey } });

  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.food_pos_read_key_rotate",
    resource: "Organization",
    resourceId: orgId,
  });

  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true, secret: newKey };
}

