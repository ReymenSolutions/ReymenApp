import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { notifyAdmins } from "./admin-notifications";
import { automationFailureEmail } from "./email-templates";
import { assertPlanCapacity } from "./plan-limits";
import { recordMetric, METRIC_KEYS } from "./metrics";
import { appUrl } from "./app-url";
import { phoneKey } from "./phone";
import { findLeadByPhone, linkOrphanConversations } from "./crm-link";
import { hasModule } from "./modules";
import { UserError } from "./user-error";

/**
 * Processing logic for each n8n webhook event type, shared between the
 * originating route (which authenticates + rate-limits the request) and
 * the retry path (which re-runs a previously FAILED WebhookEvent by id,
 * already authenticated by virtue of having been accepted the first time).
 */

export async function processLeadEvent(payload: unknown, orgId: string): Promise<void> {
  const body = payload as {
    name: string;
    email?: string;
    phone?: string;
    source?: string;
    externalId?: string;
    metadata?: Record<string, unknown>;
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

  await assertPlanCapacity(orgId, "leads");

  let created: { id: string };
  try {
    created = await prisma.lead.create({
      data: {
        organizationId: orgId,
        name: body.name,
        email: body.email,
        phone: body.phone,
        phoneKey: phoneKey(body.phone),
        source: body.source ?? "n8n",
        externalId: body.externalId,
        metadata: (body.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (err) {
    // Two concurrent deliveries with the same externalId both passed the
    // check above — the unique constraint on (organizationId, externalId)
    // catches the race. That's a successful idempotent no-op, not an error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }

  await recordMetric(orgId, METRIC_KEYS.LEADS_CAPTURED);
  await linkOrphanConversations(orgId, created.id, body.phone);
}

export async function processConversationEvent(payload: unknown, orgId: string): Promise<{ conversationId: string }> {
  const body = payload as {
    conversationId?: string;
    contactPhone: string;
    contactName?: string;
    channel: string;
    message: { role: "USER" | "ASSISTANT" | "SYSTEM"; content: string; externalId?: string };
  };

  const key = phoneKey(body.contactPhone);
  let conversation = body.conversationId
    ? await prisma.conversation.findFirst({
        where: { id: body.conversationId, organizationId: orgId },
      })
    : await prisma.conversation.findFirst({
        // Por llave de teléfono: el mismo número con otro formato sigue siendo la misma conversación.
        where: key
          ? { organizationId: orgId, phoneKey: key, status: "OPEN" }
          : { organizationId: orgId, contactPhone: body.contactPhone, status: "OPEN" },
      });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        organizationId: orgId,
        channel: body.channel,
        contactPhone: body.contactPhone,
        phoneKey: key,
        contactName: body.contactName,
      },
    });
  }

  // Enlace con el contacto del CRM. Si quien escribe es nuevo, se crea el
  // lead; si el cliente llegó al límite de su plan o no tiene CRM, el mensaje
  // se guarda igual y simplemente no hay contacto.
  if (!conversation.leadId) {
    const leadId = await resolveLeadForConversation(orgId, body, body.message.role === "USER");
    if (leadId) conversation = await prisma.conversation.update({ where: { id: conversation.id }, data: { leadId } });
  }

  // Same idempotency pattern as leads: dedup by the provider's own message
  // ID when supplied, so a retried "new message" webhook doesn't append the
  // same message twice into the conversation.
  if (body.message.externalId) {
    const existingMessage = await prisma.message.findUnique({
      where: { conversationId_externalId: { conversationId: conversation.id, externalId: body.message.externalId } },
    });
    if (existingMessage) return { conversationId: conversation.id };
  }

  try {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: body.message.role,
        content: body.message.content,
        externalId: body.message.externalId,
      },
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    return { conversationId: conversation.id };
  }

  if (body.message.role === "USER") {
    await recordMetric(orgId, METRIC_KEYS.MESSAGES_RECEIVED);
  } else if (body.message.role === "ASSISTANT") {
    await recordMetric(orgId, METRIC_KEYS.MESSAGES_SENT);
  }

  return { conversationId: conversation.id };
}

/**
 * Contacto del CRM para una conversación de WhatsApp: el lead existente con
 * ese teléfono o, si escribe alguien nuevo (mensaje entrante), uno creado al
 * momento. Devuelve null si no se puede (sin CRM, sin teléfono, plan lleno).
 */
async function resolveLeadForConversation(
  orgId: string,
  body: { contactPhone: string; contactName?: string; channel: string },
  isInbound: boolean
): Promise<string | null> {
  const existing = await findLeadByPhone(orgId, body.contactPhone);
  if (existing) return existing.id;

  const key = phoneKey(body.contactPhone);
  if (!isInbound || !key) return null;
  if (!(await hasModule(orgId, "CRM"))) return null;

  try {
    await assertPlanCapacity(orgId, "leads");
  } catch (err) {
    if (err instanceof UserError) return null;
    throw err;
  }

  const lead = await prisma.lead.create({
    data: {
      organizationId: orgId,
      name: body.contactName?.trim() || body.contactPhone,
      phone: body.contactPhone,
      phoneKey: key,
      source: body.channel,
    },
  });
  await recordMetric(orgId, METRIC_KEYS.LEADS_CAPTURED);
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
    select: { id: true },
  });
  if (!message) throw new Error("Message not found");

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
  | "lead.created"
  | "conversation.message"
  | "lead.scored"
  | "automation.event"
  | "message.status"
  | "appointment_reminder.sent"
  | "followup.sent";

/** Dispatches a stored WebhookEvent's payload to the processor matching its eventType. */
export async function processWebhookEventPayload(
  eventType: string,
  payload: unknown,
  orgId: string
): Promise<void> {
  switch (eventType as WebhookEventType) {
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
    default:
      throw new Error(`Unknown webhook event type: ${eventType}`);
  }
}
