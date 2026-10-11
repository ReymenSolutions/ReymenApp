"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { assertPlanCapacity } from "@/lib/plan-limits";
import { phoneKey } from "@/lib/phone";
import { linkOrphanConversations } from "@/lib/crm-link";
import { assertModuleEnabled } from "@/lib/modules";
import { findPotentialDuplicateLeads } from "@/lib/duplicate-detection";
import { recordMetric, METRIC_KEYS } from "@/lib/metrics";
import type { LeadStatus } from "@prisma/client";
import { UserError } from "@/lib/user-error";

const createLeadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

export async function createLead(formData: FormData) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  const parsed = createLeadSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    source: formData.get("source") || "manual",
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) throw new UserError("Datos inválidos");

  await assertModuleEnabled(session.user.organizationId, "CRM");
  await assertPlanCapacity(session.user.organizationId, "leads");

  const lead = await prisma.lead.create({
    data: {
      ...parsed.data,
      email: parsed.data.email || null,
      phoneKey: phoneKey(parsed.data.phone),
      organizationId: session.user.organizationId,
    },
  });
  await linkOrphanConversations(session.user.organizationId, lead.id, lead.phone);

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "lead.create",
    resource: "Lead",
    resourceId: lead.id,
    metadata: { name: lead.name, source: lead.source },
  });
  await recordMetric(session.user.organizationId, METRIC_KEYS.LEADS_CAPTURED);

  revalidatePath("/portal/leads");

  // Surfaced to the UI as a non-blocking "possible duplicate?" prompt —
  // creation always succeeds; this never blocks it. See mergeLeads() for
  // the controlled unification step.
  const duplicates = await findPotentialDuplicateLeads(session.user.organizationId, parsed.data, lead.id);

  return { success: true, leadId: lead.id, duplicates: duplicates.map((d) => ({ id: d.id, name: d.name, email: d.email, phone: d.phone })) };
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  await assertModuleEnabled(session.user.organizationId, "CRM");

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: session.user.organizationId },
  });

  if (!lead) throw new UserError("Lead no encontrado");

  await prisma.lead.update({
    where: { id: leadId },
    data: { status },
  });

  revalidatePath("/portal/leads");
  return { success: true };
}

export async function deleteLead(leadId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  await assertModuleEnabled(session.user.organizationId, "CRM");

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: session.user.organizationId },
  });

  if (!lead) throw new UserError("Lead no encontrado");

  // Soft delete
  await prisma.lead.update({
    where: { id: leadId },
    data: { deletedAt: new Date() },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "lead.delete",
    resource: "Lead",
    resourceId: leadId,
  });

  revalidatePath("/portal/leads");
  return { success: true };
}

export async function updateLeadTags(leadId: string, tags: string[]) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: session.user.organizationId },
  });
  if (!lead) throw new UserError("Lead no encontrado");

  const cleaned = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  await prisma.lead.update({ where: { id: leadId }, data: { tags: cleaned } });

  revalidatePath(`/portal/leads/${leadId}`);
  revalidatePath("/portal/leads");
  return { success: true };
}

/** Opts a lead in/out of automated follow-ups (see FollowUpRule) — never affects manual outreach. */
export async function setLeadDoNotContact(leadId: string, doNotContact: boolean) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: session.user.organizationId },
  });
  if (!lead) throw new UserError("Lead no encontrado");

  await prisma.lead.update({ where: { id: leadId }, data: { doNotContact } });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: doNotContact ? "lead.opt_out" : "lead.opt_in",
    resource: "Lead",
    resourceId: leadId,
  });

  revalidatePath(`/portal/leads/${leadId}`);
  return { success: true };
}

/** Small search used by the "new opportunity" lead picker — not a list page, so a tight limit is fine. */
export async function searchLeads(query: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");

  if (!query.trim()) return [];

  return prisma.lead.findMany({
    where: {
      organizationId: session.user.organizationId,
      deletedAt: null,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, email: true, phone: true },
    take: 10,
    orderBy: { createdAt: "desc" },
  });
}

export async function checkLeadDuplicates(leadId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: session.user.organizationId },
  });
  if (!lead) throw new UserError("Lead no encontrado");

  const duplicates = await findPotentialDuplicateLeads(session.user.organizationId, lead, leadId);
  return duplicates.map((d) => ({ id: d.id, name: d.name, email: d.email, phone: d.phone, createdAt: d.createdAt }));
}

/**
 * Controlled unification: folds `duplicateLeadId` into `primaryLeadId`.
 * Moves the duplicate's opportunities and notes onto the primary, merges
 * tags, backfills the primary's email/phone if it's missing one the
 * duplicate has (never overwrites a value the primary already has), then
 * soft-deletes the duplicate. Conversations aren't re-pointed (they aren't
 * linked to a Lead by a hard foreign key — they're matched by phone number
 * at display time), so backfilling `phone` onto the primary is what makes
 * the duplicate's conversation history show up under the surviving lead.
 */
export async function mergeLeads(primaryLeadId: string, duplicateLeadId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");
  if (primaryLeadId === duplicateLeadId) throw new UserError("No puedes fusionar un lead consigo mismo");

  const orgId = session.user.organizationId;
  const [primary, duplicate] = await Promise.all([
    prisma.lead.findFirst({ where: { id: primaryLeadId, organizationId: orgId, deletedAt: null } }),
    prisma.lead.findFirst({ where: { id: duplicateLeadId, organizationId: orgId, deletedAt: null } }),
  ]);
  if (!primary || !duplicate) throw new UserError("Lead no encontrado");

  await prisma.$transaction([
    prisma.opportunity.updateMany({ where: { leadId: duplicateLeadId }, data: { leadId: primaryLeadId } }),
    prisma.note.updateMany({ where: { leadId: duplicateLeadId }, data: { leadId: primaryLeadId } }),
    prisma.appointment.updateMany({ where: { leadId: duplicateLeadId }, data: { leadId: primaryLeadId } }),
    prisma.lead.update({
      where: { id: primaryLeadId },
      data: {
        tags: Array.from(new Set([...primary.tags, ...duplicate.tags])),
        email: primary.email ?? duplicate.email,
        phone: primary.phone ?? duplicate.phone,
      },
    }),
    prisma.lead.update({ where: { id: duplicateLeadId }, data: { deletedAt: new Date() } }),
  ]);

  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "lead.merge",
    resource: "Lead",
    resourceId: primaryLeadId,
    metadata: { mergedFromId: duplicateLeadId, mergedFromName: duplicate.name },
  });

  revalidatePath("/portal/leads");
  revalidatePath(`/portal/leads/${primaryLeadId}`);
  return { success: true };
}
