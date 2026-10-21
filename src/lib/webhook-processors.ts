import { Prisma } from "@prisma/client";
import { z } from "zod";
import { enqueueAutoReply, enqueuePipelineAnalysis } from "./ai-auto-jobs";
import { prisma } from "./prisma";
import { notifyAdmins } from "./admin-notifications";
import { automationFailureEmail } from "./email-templates";
import { withPlanCapacity } from "./plan-limits";
import { recordMetric, METRIC_KEYS } from "./metrics";
import { appUrl } from "./app-url";
import { phoneKey } from "./phone";
import { messagePreview, normalizeChannel, normalizeEmail } from "./channels";
import { findLeadByPhone, linkOrphanConversations, linkOrphanCustomers } from "./crm-link";
import { findPotentialDuplicateLeads } from "./duplicate-detection";
import { hasModule } from "./modules";
import { processKitchenTicketReady, processShiftClosed } from "./pos-events";
import { processFoodPosOrder } from "./food";
import { processDeliveryOrder } from "./delivery";
import { UserError } from "./user-error";
import { sanitizeCustomFields } from "./custom-fields";
import { getActiveCustomFields } from "./custom-fields-db";

/**
 * Processing logic for each n8n webhook event type, shared between the
 * originating route (which authenticates + rate-limits the request) and
 * the retry path (which re-runs a previously FAILED WebhookEvent by id,
 * already authenticated by virtue of having been accepted the first time).
 */

function asRecord(value: unknown): Record<string, string | number | boolean> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, string | number | boolean>) : {};
}

export async function processLeadEvent(payload: unknown, orgId: string): Promise<void> {
  const body = payload as {
    name: string;
    email?: string;
    phone?: string;
    source?: string;
    externalId?: string;
    metadata?: Record<string, unknown>;
    /** Valores de los campos personalizados del cliente, por clave; lo que no corresponde a un campo activo o a su tipo se ignora. */
    customFields?: Record<string, unknown>;
  };

  if (!body.name) throw new Error("Missing lead name");

  const org = await prisma.organization.findUnique({ where: { id: orgId, isActive: true } });
  if (!org) throw new Error("Organization not found");

  // Idempotency: if the source supplied a stable ID for this lead (its own
  // CRM record ID, a WhatsApp message ID, etc.) and we've already created a
  // Lead for it, this is a retried/duplicated delivery — no-op rather than
  // creating a second Lead. Sources that don't send externalId (not yet
  // updated to do so) get the old always-create behavior, with no dedup.
  if (body.externalId) {
    const existing = await prisma.lead.findUnique({
      where: { organizationId_externalId: { organizationId: orgId, externalId: body.externalId } },
    });
    if (existing) return;
  }

  // Misma persona (mismo teléfono —en cualquier formato— o mismo correo): no
  // se crea otro lead, se completa la ficha del que ya existe. Pasa, por
  // ejemplo, cuando alguien ya escribió por WhatsApp y luego llega su alta.
  const [existingPerson] = await findPotentialDuplicateLeads(orgId, { email: body.email, phone: body.phone });
  const customFields = body.customFields && typeof body.customFields === "object" ? sanitizeCustomFields(await getActiveCustomFields(orgId), body.customFields).values : {};
  if (existingPerson) {
    const looksLikePhone = /^[\d\s()+.-]+$/.test(existingPerson.name);
    await prisma.lead.update({
      where: { id: existingPerson.id },
      data: {
        // Un lead creado desde WhatsApp sin nombre se llama como su teléfono: ahora ya hay un nombre real.
        name: looksLikePhone ? body.name : undefined,
        email: existingPerson.email ? undefined : body.email,
        phone: existingPerson.phone ? undefined : body.phone,
        phoneKey: existingPerson.phoneKey ? undefined : phoneKey(body.phone),
        externalId: existingPerson.externalId ? undefined : body.externalId,
        // Completa lo que falta; no pisa lo que ya se había capturado.
        customFields: Object.keys(customFields).length ? { ...customFields, ...asRecord(existingPerson.customFields) } : undefined,
      },
    });
    await linkOrphanConversations(orgId, existingPerson.id, existingPerson.phone ?? body.phone);
    await linkOrphanCustomers(orgId, existingPerson.id, existingPerson.phone ?? body.phone);
    return;
  }

  let created: { id: string };
  try {
    created = await withPlanCapacity(orgId, "leads", (tx) =>
      tx.lead.create({
        data: {
          organizationId: orgId,
          name: body.name,
          email: body.email,
          phone: body.phone,
          phoneKey: phoneKey(body.phone),
          source: body.source ?? "n8n",
          externalId: body.externalId,
          metadata: (body.metadata as Prisma.InputJsonValue) ?? undefined,
          customFields: Object.keys(customFields).length ? customFields : undefined,
        },
      })
    );
  } catch (err) {
    // Two concurrent deliveries with the same externalId both passed the
    // check above — the unique constraint on (organizationId, externalId)
    // catches the race. That's a successful idempotent no-op, not an error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }

  await recordMetric(orgId, METRIC_KEYS.LEADS_CAPTURED);
  await linkOrphanConversations(orgId, created.id, body.phone);
  await linkOrphanCustomers(orgId, created.id, body.phone);
}

const optionalText = z.string().nullish().transform((value) => value ?? undefined);
const conversationEventSchema = z.object({
  conversationId: z.string().nullish().transform((value) => value || undefined),
  contactPhone: optionalText,
  contactHandle: optionalText,
  contactEmail: optionalText,
  contactName: optionalText,
  subject: optionalText,
  channel: optionalText,
  message: z.object({ role: z.enum(["USER", "ASSISTANT", "SYSTEM"]), content: z.string(), externalId: optionalText }),
});

export async function processConversationEvent(payload: unknown, orgId: string, binding?: { connectionId: string; externalThreadId: string; generation: number }): Promise<{ conversationId: string }> {
  const body = conversationEventSchema.parse(payload);
  const key = phoneKey(body.contactPhone);
  const handle = body.contactHandle?.trim().slice(0, 200) || null;
  const email = normalizeEmail(body.contactEmail);
  const subject = body.subject?.trim().slice(0, 200) || null;
  if (!body.conversationId && !body.contactPhone && !handle && !email) {
    throw new Error("La conversación necesita el teléfono, el usuario o el correo del contacto");
  }

  const { conversation, inserted } = await prisma.$transaction(async (tx) => {
    // Serialize matching/creation for this tenant's channel identity, including concurrent first deliveries.
    const identity = key || body.contactPhone || handle || email || body.conversationId;
    // Keep the unbound key byte-for-byte compatible with Phase 2 during rolling updates.
    const lockKey = binding ? `inbox:${orgId}:${normalizeChannel(body.channel)}:${binding.connectionId}:${binding.externalThreadId}` : `inbox:${orgId}:${normalizeChannel(body.channel)}:${identity}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    let channel = normalizeChannel(body.channel);
    if (binding) {
      const connection = await tx.channelConnection.findFirst({ where: { id: binding.connectionId, organizationId: orgId, channel, generation: binding.generation, enabled: true } });
      if (!connection) throw new Error("Invalid channel binding");
    }
    let conv;
    if (binding) {
      conv = await tx.conversation.findFirst({ where: { organizationId: orgId, channelConnectionId: binding.connectionId, externalThreadId: binding.externalThreadId } });
      if (conv && (conv.phoneKey !== key || conv.contactHandle !== handle || conv.contactEmail !== email)) throw new Error("Thread identity mismatch");
      if (!conv) conv = await tx.conversation.create({ data: { organizationId: orgId, channel, channelConnectionId: binding.connectionId, externalThreadId: binding.externalThreadId, contactPhone: body.contactPhone || null, phoneKey: key, contactHandle: handle, contactEmail: email, subject, contactName: body.contactName } });
    } else if (body.conversationId) {
      conv = await tx.conversation.findFirst({ where: { id: body.conversationId, organizationId: orgId } });
      // Legacy callers with an explicit ID may omit channel; a supplied channel must match.
      if (!conv || conv.channelConnectionId || (body.channel !== undefined && normalizeChannel(conv.channel) !== channel)) throw new Error("Conversation not found");
      channel = conv.channel;
    } else {
      conv = await tx.conversation.findFirst({
        where: {
          organizationId: orgId, channel, channelConnectionId: null, status: { in: ["OPEN", "ESCALATED"] },
          ...(body.contactPhone ? (key ? { OR: [{ phoneKey: key }, { phoneKey: null, contactPhone: body.contactPhone }] } : { contactPhone: body.contactPhone }) : handle ? { contactHandle: handle } : { contactEmail: email }),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      if (!conv) conv = await tx.conversation.create({ data: { organizationId: orgId, channel, contactPhone: body.contactPhone || null, phoneKey: key, contactHandle: handle, contactEmail: email, subject, contactName: body.contactName } });
    }
    // Row lock shares the send-admission boundary with automatic replies and operator updates.
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conv.id} AND "organizationId" = ${orgId} FOR UPDATE`;
    const locked = await tx.conversation.findFirstOrThrow({ where: { id: conv.id, organizationId: orgId } });
    if ((!binding && locked.channelConnectionId) || (binding && (locked.channelConnectionId !== binding.connectionId || locked.externalThreadId !== binding.externalThreadId))) throw new Error("Conversation binding changed");
    if (body.message.externalId !== undefined) {
      const existing = await tx.message.findUnique({ where: { conversationId_externalId: { conversationId: conv.id, externalId: body.message.externalId } } });
      if (existing) return { conversation: conv, inserted: false };
    }
    const message = await tx.message.create({ data: { conversationId: conv.id, ...body.message } });
    if (body.message.role !== "SYSTEM") {
      conv = await tx.conversation.update({ where: { id: conv.id }, data: {
        lastMessageAt: message.createdAt, lastMessagePreview: messagePreview(body.message.content), lastMessageRole: body.message.role,
        ...(subject && !conv.subject ? { subject } : {}),
        ...(body.message.role === "USER" ? { unreadCount: { increment: 1 }, archivedAt: null, ...(binding && ["RESOLVED", "CLOSED"].includes(conv.status) ? { status: "OPEN", resolvedAt: null } : {}) } : {}),
      } });
    }
    if (body.message.role === "USER") {
      await enqueueAutoReply(tx, orgId, conv.id, message.id);
      await enqueuePipelineAnalysis(tx, orgId, conv.id, message.id);
    }
    return { conversation: conv, inserted: true };
  });

  // CRM identity remains shared across channels; conversation identity is channel-specific.
  if (!conversation.leadId) {
    const leadId = await resolveLeadForConversation(orgId, { contactPhone: body.contactPhone, contactEmail: email, contactHandle: handle, contactName: body.contactName, channel: conversation.channel, channelConnectionId: conversation.channelConnectionId }, body.message.role === "USER", conversation.id);
    if (leadId) await prisma.conversation.updateMany({ where: { id: conversation.id, organizationId: orgId, leadId: null }, data: { leadId } });
  }
  if (inserted && body.message.role === "USER") await recordMetric(orgId, METRIC_KEYS.MESSAGES_RECEIVED);
  if (inserted && body.message.role === "ASSISTANT") await recordMetric(orgId, METRIC_KEYS.MESSAGES_SENT);
  return { conversationId: conversation.id };
}

/**
 * Contacto del CRM para una conversación: el lead existente con ese teléfono o correo (o el que ya tenía una
 * conversación previa del mismo usuario del canal) o, si escribe alguien nuevo (mensaje entrante), uno creado
 * al momento. Devuelve null si no se puede (sin CRM, sin datos de contacto, plan lleno).
 */
async function resolveLeadForConversation(
  orgId: string,
  body: { contactPhone?: string; contactEmail?: string | null; contactHandle?: string | null; contactName?: string; channel: string; channelConnectionId: string | null },
  isInbound: boolean,
  conversationId: string
): Promise<string | null> {
  const existing = await findLeadByPhone(orgId, body.contactPhone);
  if (existing) return existing.id;
  if (body.contactEmail) {
    const byEmail = await prisma.lead.findFirst({ where: { organizationId: orgId, email: { equals: body.contactEmail, mode: "insensitive" }, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (byEmail) return byEmail.id;
  }
  if (body.contactHandle) {
    const prev = await prisma.conversation.findFirst({ where: { organizationId: orgId, channel: body.channel, channelConnectionId: body.channelConnectionId, contactHandle: body.contactHandle, leadId: { not: null } }, select: { leadId: true } });
    if (prev?.leadId) return prev.leadId;
  }

  const key = phoneKey(body.contactPhone);
  const label = body.contactName?.trim() || body.contactEmail || body.contactPhone || body.contactHandle;
  if (!isInbound || !label) return null;
  if (!(await hasModule(orgId, "CRM"))) return null;

  let lead: { id: string };
  let created = false;
  try {
    lead = await withPlanCapacity(orgId, "leads", async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crm-inbox:${orgId}:${key || body.contactEmail || `${body.channel}:${body.contactHandle}`}`}))`;
      // Recheck under the admission lock: concurrent channels/deliveries share a CRM person, not a thread.
      const existing = key || body.contactEmail ? await tx.lead.findFirst({ where: { organizationId: orgId, deletedAt: null, OR: [...(key ? [{ phoneKey: key }] : []), ...(body.contactEmail ? [{ email: { equals: body.contactEmail, mode: "insensitive" as const } }] : [])] }, select: { id: true } }) : null;
      const previous = body.contactHandle ? await tx.conversation.findFirst({ where: { organizationId: orgId, channel: body.channel, channelConnectionId: body.channelConnectionId, contactHandle: body.contactHandle, leadId: { not: null } }, select: { leadId: true } }) : null;
      if (existing) return existing;
      if (previous?.leadId) return { id: previous.leadId };
      const person = await tx.lead.create({ data: { organizationId: orgId, name: label, phone: key ? body.contactPhone : null, phoneKey: key, email: body.contactEmail ?? null, source: body.channel } });
      await tx.conversation.updateMany({ where: { id: conversationId, organizationId: orgId, leadId: null }, data: { leadId: person.id } });
      created = true;
      return person;
    });
  } catch (err) {
    if (err instanceof UserError) return null;
    throw err;
  }
  if (key) await linkOrphanCustomers(orgId, lead.id, body.contactPhone);
  if (created) await recordMetric(orgId, METRIC_KEYS.LEADS_CAPTURED);
  return lead.id;
}

export async function processScoringEvent(payload: unknown, orgId: string): Promise<void> {
  const body = payload as { leadId: string; score: number; reason?: string };

  if (body.score < 0 || body.score > 100) {
    throw new Error("Score must be between 0 and 100");
  }

  const lead = await prisma.lead.findFirst({
    where: { id: body.leadId, organizationId: orgId, deletedAt: null },
  });
  if (!lead) throw new Error("Lead not found");

  await prisma.lead.update({
    where: { id: body.leadId },
    data: { score: Math.round(body.score), scoreReason: body.reason },
  });
}

/** n8n reports back what happened to a message it sent via the WhatsApp Business API on our behalf. */
export async function processMessageStatusEvent(payload: unknown, orgId: string): Promise<void> {
  const body = payload as { messageId: string; status: "SENT" | "DELIVERED" | "READ" | "FAILED"; errorMessage?: string };

  if (!body.messageId) throw new Error("Missing messageId");

  const message = await prisma.message.findFirst({
    where: { id: body.messageId, conversation: { organizationId: orgId } },
    select: { id: true, metadata: true, conversation: { select: { channelConnectionId: true } } },
  });
  if (!message || (message.conversation.channelConnectionId && (message.metadata as { channelGeneration?: number } | null)?.channelGeneration !== undefined)) throw new Error("Message not found");

  await prisma.message.update({
    where: { id: message.id },
    data: {
      deliveryStatus: body.status,
      metadata: body.errorMessage ? { deliveryError: body.errorMessage } : undefined,
    },
  });
}

/** n8n reports it sent an appointment reminder — logged for dedup so the same rule never fires twice for the same appointment across polls. */
export async function processAppointmentReminderSentEvent(payload: unknown, orgId: string): Promise<void> {
  const body = payload as { appointmentId: string; ruleId: string };
  if (!body.appointmentId || !body.ruleId) throw new Error("Missing appointmentId or ruleId");

  const [appointment, rule] = await Promise.all([
    prisma.appointment.findFirst({ where: { id: body.appointmentId, organizationId: orgId }, select: { id: true } }),
    prisma.appointmentReminderRule.findFirst({ where: { id: body.ruleId, organizationId: orgId }, select: { id: true } }),
  ]);
  if (!appointment) throw new Error("Appointment not found");
  if (!rule) throw new Error("Reminder rule not found");

  try {
    await prisma.appointmentReminderLog.create({ data: { appointmentId: body.appointmentId, ruleId: body.ruleId } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
}

/**
 * n8n reports it sent a follow-up attempt. Unlike appointment reminders,
 * this is intentionally append-only (no unique constraint) — a repeating
 * FollowUpRule fires more than once per lead, and "attempts so far" is
 * simply a count of these rows (see /api/v1/leads/due-followups). A
 * retried delivery of the *same* webhook call is still only counted once,
 * via the delivery-level externalEventId dedup in ingestWebhookEvent.
 */
export async function processFollowUpSentEvent(payload: unknown, orgId: string): Promise<void> {
  const body = payload as { leadId: string; ruleId: string };
  if (!body.leadId || !body.ruleId) throw new Error("Missing leadId or ruleId");

  const [lead, rule] = await Promise.all([
    prisma.lead.findFirst({ where: { id: body.leadId, organizationId: orgId }, select: { id: true } }),
    prisma.followUpRule.findFirst({ where: { id: body.ruleId, organizationId: orgId }, select: { id: true } }),
  ]);
  if (!lead) throw new Error("Lead not found");
  if (!rule) throw new Error("Follow-up rule not found");

  await prisma.followUpLog.create({ data: { leadId: body.leadId, ruleId: body.ruleId } });
}

export async function processAutomationEvent(payload: unknown, orgId: string): Promise<void> {
  const body = payload as {
    automationId: string;
    type: string;
    status: "SUCCESS" | "FAILED" | "PENDING";
    payload?: Record<string, unknown>;
    errorMessage?: string;
    duration?: number;
  };

  await prisma.automationEvent.create({
    data: {
      automationId: body.automationId,
      organizationId: orgId,
      type: body.type,
      status: body.status,
      payload: (body.payload as Prisma.InputJsonValue) ?? undefined,
      errorMessage: body.errorMessage,
      duration: body.duration,
    },
  });

  await recordMetric(orgId, METRIC_KEYS.AUTOMATION_EXECUTIONS);

  if (body.status === "FAILED") {
    await recordMetric(orgId, METRIC_KEYS.AUTOMATION_FAILURES);
    const automation = await prisma.automation.update({
      where: { id: body.automationId },
      data: { status: "ERROR" },
      include: { organization: { select: { name: true } } },
    });

    const adminUrl = appUrl("/admin/automations");
    const email = automationFailureEmail(automation.organization.name, automation.name, adminUrl);
    await notifyAdmins(email);
  }
}

export type WebhookEventType =
  | "channel.v1"
  | "lead.created"
  | "conversation.message"
  | "lead.scored"
  | "automation.event"
  | "message.status"
  | "appointment_reminder.sent"
  | "followup.sent"
  | "kitchen.ticket_ready"
  | "shift.closed"
  | "order.completed"
  | "delivery.order";

/** Dispatches a stored WebhookEvent's payload to the processor matching its eventType. */
export async function processWebhookEventPayload(
  eventType: string,
  payload: unknown,
  orgId: string
): Promise<void> {
  switch (eventType as WebhookEventType) {
    case "channel.v1":
      await (await import("./channel-connections/events")).processChannelEvent(payload, orgId);
      return;
    case "lead.created":
      return processLeadEvent(payload, orgId);
    case "conversation.message":
      await processConversationEvent(payload, orgId);
      return;
    case "lead.scored":
      return processScoringEvent(payload, orgId);
    case "automation.event":
      return processAutomationEvent(payload, orgId);
    case "message.status":
      return processMessageStatusEvent(payload, orgId);
    case "appointment_reminder.sent":
      return processAppointmentReminderSentEvent(payload, orgId);
    case "followup.sent":
      return processFollowUpSentEvent(payload, orgId);
    case "kitchen.ticket_ready":
      await processKitchenTicketReady(payload, orgId);
      return;
    case "shift.closed":
      return processShiftClosed(payload, orgId);
    case "order.completed": {
      // El reintento no pasa por el precheck de la ruta: se vuelve a exigir aquí el mismo módulo.
      const [pos, food] = await Promise.all([hasModule(orgId, "REYMEN_POS"), hasModule(orgId, "FOOD_OPS")]);
      if (!pos || !food) throw new Error("Reymen POS no está activado para este negocio");
      return processFoodPosOrder(payload, orgId);
    }
    case "delivery.order":
      if (!(await hasModule(orgId, "FOOD_OPS"))) throw new Error("El módulo Food no está activo para esta organización");
      await processDeliveryOrder(payload, orgId);
      return;
    default:
      throw new Error(`Unknown webhook event type: ${eventType}`);
  }
}
