import webpush from "web-push";
import type { UserRole } from "@prisma/client";
import { prisma } from "./prisma";

// Notificaciones push al celular o la computadora (Web Push con llaves VAPID). Reymen manda el aviso cifrado al
// servicio push del navegador (Google, Apple, Mozilla); nunca guarda nada del aviso. Sin las llaves configuradas no
// hace nada: la campana y el correo siguen funcionando igual.

export interface PushMessage {
  title: string;
  body?: string;
  /** Pantalla que se abre al tocar el aviso (ruta interna). */
  url?: string;
  /** Avisos con la misma etiqueta se reemplazan en lugar de amontonarse (p. ej. una conversación). */
  tag?: string;
}

let configured: boolean | null = null;

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:soporte@reymen.mx", pub, priv);
    return (configured = true);
  } catch {
    console.error("[push] llaves VAPID inválidas");
    return (configured = false);
  }
}

/** Solo para pruebas: vuelve a leer las llaves del entorno. */
export function resetPushConfigForTests() {
  configured = null;
}

type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;
let sender: Sender = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 12, urgency: "high" });

/** Solo para pruebas: reemplaza el envío real. */
export function setPushSenderForTests(fn: Sender | null) {
  sender = fn ?? ((sub, payload) => webpush.sendNotification(sub, payload, { TTL: 60 * 60 * 12, urgency: "high" }));
}

/**
 * Manda el aviso a todos los dispositivos de estos usuarios. Un dispositivo que el servicio push ya no reconoce
 * (404/410: el usuario quitó el permiso o desinstaló) se borra. Nunca lanza: un aviso que no sale no rompe nada.
 */
export async function sendPushToUsers(userIds: string[], message: PushMessage): Promise<{ sent: number; removed: number }> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0 || !pushConfigured()) return { sent: 0, removed: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: ids }, user: { isActive: true } } });
  const payload = JSON.stringify({ title: message.title.slice(0, 120), body: message.body?.slice(0, 240), url: message.url, tag: message.tag });
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date(), failures: 0 } }).catch(() => undefined);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
          removed++;
        } else {
          // Un error pasajero no borra el dispositivo; tras muchos seguidos se da por perdido.
          const row = await prisma.pushSubscription.update({ where: { id: s.id }, data: { failures: { increment: 1 } } }).catch(() => null);
          if (row && row.failures >= 10) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        }
      }
    }),
  );
  return { sent, removed };
}

/** Roles que atienden a los clientes (reciben avisos de mensajes y leads nuevos sin responsable). */
const FRONT_ROLES: UserRole[] = ["OWNER", "ADMIN", "MANAGER", "AGENT"];
const LEAD_ROLES: UserRole[] = ["OWNER", "ADMIN", "MANAGER"];

const CHANNEL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", webchat: "chat web", email: "correo", enquiry: "formulario" };

/** Mensaje nuevo de un cliente: al responsable de la conversación o, si no tiene, a quienes atienden. */
export async function notifyInboundMessage(organizationId: string, conversationId: string): Promise<void> {
  if (!pushConfigured()) return;
  try {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { id: true, channel: true, contactName: true, contactPhone: true, contactHandle: true, assignedToId: true, lastMessagePreview: true },
    });
    if (!conv) return;
    const userIds = conv.assignedToId
      ? [conv.assignedToId]
      : (await prisma.user.findMany({ where: { organizationId, isActive: true, role: { in: FRONT_ROLES } }, select: { id: true } })).map((u) => u.id);
    const who = conv.contactName || conv.contactPhone || conv.contactHandle || "Cliente";
    await sendPushToUsers(userIds, {
      title: `${who} · ${CHANNEL_LABEL[conv.channel] ?? conv.channel}`,
      body: conv.lastMessagePreview ?? "Nuevo mensaje",
      url: `/portal/conversations/${conv.id}`,
      tag: `conv:${conv.id}`,
    });
  } catch {
    console.error("[push] inbound message notification failed");
  }
}

/** Lead nuevo que llega solo (formularios, Meta Lead Ads, n8n): a dueño, admin y gerentes, para repartirlo rápido. */
export async function notifyNewLead(organizationId: string, lead: { id: string; name: string; source: string | null }): Promise<void> {
  if (!pushConfigured()) return;
  try {
    const userIds = (await prisma.user.findMany({ where: { organizationId, isActive: true, role: { in: LEAD_ROLES } }, select: { id: true } })).map((u) => u.id);
    await sendPushToUsers(userIds, { title: `Nuevo lead: ${lead.name}`, body: lead.source ? `Llegó por ${lead.source}` : "Contáctalo pronto", url: `/portal/leads/${lead.id}`, tag: `lead:${lead.id}` });
  } catch {
    console.error("[push] new lead notification failed");
  }
}

/** Recordatorio de una tarea (lo manda el reloj junto con el correo). */
export async function notifyTaskReminder(task: { id: string; assigneeId: string; title: string; leadId: string | null }): Promise<void> {
  await sendPushToUsers([task.assigneeId], { title: `⏰ ${task.title}`, body: "Tienes esta tarea pendiente", url: task.leadId ? `/portal/leads/${task.leadId}` : "/portal/tasks", tag: `task:${task.id}` });
}

/** Alguien te asignó una tarea. */
export async function notifyTaskAssigned(task: { id: string; title: string; leadId: string | null }, assigneeId: string, byName: string | null): Promise<void> {
  try {
    await sendPushToUsers([assigneeId], { title: `Nueva tarea: ${task.title}`, body: byName ? `Te la asignó ${byName}` : "Te asignaron una tarea", url: task.leadId ? `/portal/leads/${task.leadId}` : "/portal/tasks", tag: `task:${task.id}` });
  } catch {
    console.error("[push] task assignment notification failed");
  }
}
