"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateSlug, generateWebhookSecret } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { hasCustomPrice } from "@/lib/permissions";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { syncSmartcardMemberLimitForPlan } from "@/lib/smartcard-link";

const createClientSchema = z.object({
  orgName: z.string().min(2),
  orgIndustry: z.string().optional(),
  userName: z.string().min(2),
  userEmail: z.string().email(),
  password: z.string().min(8),
});

export async function createClient(formData: FormData) {
  const session = await requireAdmin();

  const parsed = createClientSchema.safeParse({
    orgName: formData.get("orgName"),
    orgIndustry: formData.get("orgIndustry") || undefined,
    userName: formData.get("userName"),
    userEmail: formData.get("userEmail"),
    password: formData.get("password"),
  });

  if (!parsed.success) throw new UserError("Datos inválidos");

  const { orgName, orgIndustry, userName, userEmail, password } = parsed.data;
  const slug = generateSlug(orgName);
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.organization.findUnique({ where: { slug } });
  const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

  const org = await prisma.organization.create({
    data: {
      name: orgName,
      slug: finalSlug,
      industry: orgIndustry,
      n8nWebhookSecret: generateWebhookSecret(),
      users: {
        create: {
          name: userName,
          email: userEmail,
          passwordHash,
          role: "OWNER",
        },
      },
      // Same default pipeline every pre-existing org received via the
      // add_crm_pipeline migration backfill — keeps new orgs consistent
      // with it instead of starting with an empty, unusable pipeline.
      pipelineStages: {
        create: [
          { name: "Nuevo", order: 0, leadStatus: "NEW" },
          { name: "Contactado", order: 1, leadStatus: "CONTACTED" },
          { name: "Calificado", order: 2, leadStatus: "QUALIFIED" },
          { name: "Propuesta", order: 3, leadStatus: "PROPOSAL" },
          { name: "Ganado", order: 4, isWon: true, leadStatus: "WON" },
          { name: "Perdido", order: 5, isLost: true, leadStatus: "LOST" },
        ],
      },
    },
    include: { users: true },
  });

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

export async function changePlan(orgId: string, plan: string, customMonthlyPriceUsd: number | null = null) {
  const session = await requireAdmin();

  const validPlans = ["starter", "professional", "enterprise"];
  if (!validPlans.includes(plan)) throw new UserError("Plan inválido");

  // El precio pactado solo existe en planes de precio personalizado; al pasar
  // a un plan de precio fijo se borra para no dejar un precio viejo colgando.
  const customPrice = hasCustomPrice(plan) ? customMonthlyPriceUsd : null;
  if (customPrice !== null && !(Number.isFinite(customPrice) && customPrice > 0)) {
    throw new UserError("El precio personalizado debe ser mayor a 0");
  }

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: { plan, customMonthlyPriceUsd: customPrice },
  });

  // SmartCard guarda su propio límite de integrantes; se iguala al del plan.
  const smartcardMemberLimit = await syncSmartcardMemberLimitForPlan(orgId, plan);

  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.plan_change",
    resource: "Organization",
    resourceId: orgId,
    metadata: { newPlan: plan, customMonthlyPriceUsd: customPrice, smartcardMemberLimit },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/portal/smartcard");
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

