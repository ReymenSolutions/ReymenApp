"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { SMARTCARD_LINK_ROLES } from "@/lib/smartcard-link-shared";
import {
  addSmartcardMember,
  createSmartcardCompanyForOrg,
  linkSmartcardCompany,
  removeSmartcardMember,
  planMemberLimit,
  syncSmartcardMemberLimit,
  syncSmartcardMemberLimitForPlan,
  unlinkSmartcardCompany,
} from "@/lib/smartcard-link";

// Solo administradores de Reymen: escriben directo en la base de SmartCard.

function refresh(orgId: string) {
  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/admin/smartcard");
  revalidatePath("/portal/smartcard");
}

const linkSchema = z.object({ orgId: z.string().min(1), companyId: z.string().min(1) });

export async function linkSmartcardCompanyAction(data: z.infer<typeof linkSchema>) {
  const session = await requireAdmin();
  const { orgId, companyId } = linkSchema.parse(data);
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, plan: true } });
  if (!org) throw new UserError("Ese cliente no existe.");
  const company = await linkSmartcardCompany(orgId, companyId);
  const memberLimit = await syncSmartcardMemberLimitForPlan(orgId, org.plan);
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.smartcard_link",
    resource: "SmartcardCompany",
    resourceId: company.id,
    metadata: { companyName: company.name, slug: company.slug, replacedOrgId: company.staleOrgId ?? null, memberLimit },
  });
  refresh(orgId);
}

/** Botón "Crear empresa en SmartCard": alta de la empresa ya vinculada, con módulo y accesos. */
export async function createSmartcardCompanyAction(data: { orgId: string }) {
  const session = await requireAdmin();
  const orgId = z.string().min(1).parse(data.orgId);
  const result = await createSmartcardCompanyForOrg(orgId);
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.smartcard_company_create",
    resource: "SmartcardCompany",
    resourceId: result.company.id,
    metadata: { companyName: result.company.name, slug: result.company.slug, granted: result.granted, skipped: result.skipped },
  });
  refresh(orgId);
  return { granted: result.granted.length, skipped: result.skipped.length };
}

export async function unlinkSmartcardCompanyAction(data: { orgId: string }) {
  const session = await requireAdmin();
  const orgId = z.string().min(1).parse(data.orgId);
  await unlinkSmartcardCompany(orgId);
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.smartcard_unlink",
    resource: "SmartcardCompany",
  });
  refresh(orgId);
}

const memberSchema = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(SMARTCARD_LINK_ROLES),
});

/**
 * Da acceso a SmartCard a un usuario del cliente. Solo usuarios del propio
 * cliente: es el correo con el que entran a Reymen, y así se compara.
 */
export async function addSmartcardMemberAction(data: z.infer<typeof memberSchema>) {
  const session = await requireAdmin();
  const { orgId, userId, role } = memberSchema.parse(data);
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId: orgId }, select: { email: true } });
  if (!user) throw new UserError("Ese usuario no pertenece a este cliente.");
  const outcome = await addSmartcardMember(orgId, user.email, role);
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.smartcard_member_add",
    resource: "SmartcardMember",
    resourceId: userId,
    metadata: { email: user.email, role, outcome },
  });
  refresh(orgId);
  return outcome;
}

export async function removeSmartcardMemberAction(data: { orgId: string; memberId: string; email?: string | null }) {
  const session = await requireAdmin();
  const orgId = z.string().min(1).parse(data.orgId);
  const memberId = z.string().min(1).parse(data.memberId);
  await removeSmartcardMember(orgId, memberId);
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.smartcard_member_remove",
    resource: "SmartcardMember",
    resourceId: memberId,
    metadata: { email: data.email ?? null },
  });
  refresh(orgId);
}

/** Botón "Aplicar límite del plan" de la tarjeta SmartCard del cliente. */
export async function syncSmartcardMemberLimitAction(data: { orgId: string }) {
  const session = await requireAdmin();
  const orgId = z.string().min(1).parse(data.orgId);
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
  if (!org) throw new UserError("Ese cliente no existe.");
  const limit = await planMemberLimit(org.plan);
  const outcome = await syncSmartcardMemberLimit(orgId, limit);
  if (outcome === "no_module") throw new UserError("Esa empresa no tiene el módulo SmartCard activo en SmartCard.");
  if (outcome === "unlinked") throw new UserError("Este cliente no está vinculado con SmartCard.");
  if (outcome === "not_configured") throw new UserError("SmartCard aún no está configurado en este entorno.");
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.smartcard_member_limit",
    resource: "SmartcardCompany",
    metadata: { plan: org.plan, limit, outcome },
  });
  refresh(orgId);
  return outcome;
}
