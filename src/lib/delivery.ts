import { z } from "zod";
import type { DeliveryOrderStatus, DeliveryPlatform, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { UserError } from "./user-error";

// ─── FOOD OPS — Pedidos de Uber Eats, Rappi y DiDi Food ──────────────
// Formato normalizado que recibe POST /api/webhooks/delivery/orders. Las
// plataformas no mandan esto directo: lo traduce el integrador aprobado o
// un flujo de n8n que recibe su webhook. Enviar el mismo externalId otra
// vez actualiza el pedido (cambio de estado, cancelación).

export const DELIVERY_PLATFORMS: DeliveryPlatform[] = ["UBER_EATS", "RAPPI", "DIDI_FOOD"];
export const DELIVERY_STATUSES: DeliveryOrderStatus[] = ["NEW", "ACCEPTED", "PREPARING", "READY", "PICKED_UP", "DELIVERED", "CANCELLED"];
/** Estados que ya no requieren atención. */
export const FINISHED_STATUSES: DeliveryOrderStatus[] = ["DELIVERED", "CANCELLED"];
/** Un pedido que no está listo después de esto se marca como retrasado. */
export const DELIVERY_LATE_MINUTES = 20;

const PLATFORM_ALIASES: Record<string, DeliveryPlatform> = {
  uber_eats: "UBER_EATS",
  ubereats: "UBER_EATS",
  uber: "UBER_EATS",
  rappi: "RAPPI",
  didi_food: "DIDI_FOOD",
  didifood: "DIDI_FOOD",
  didi: "DIDI_FOOD",
};

export function parsePlatform(v: unknown): DeliveryPlatform | null {
  if (typeof v !== "string") return null;
  return PLATFORM_ALIASES[v.trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? null;
}

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive().max(999),
  notes: z.string().trim().max(500).optional(),
  modifiers: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});

export const deliveryOrderSchema = z.object({
  platform: z.string(),
  externalId: z.string().trim().min(1).max(120),
  displayId: z.string().trim().min(1).max(40).optional(),
  status: z.enum(DELIVERY_STATUSES as [DeliveryOrderStatus, ...DeliveryOrderStatus[]]).default("NEW"),
  customerName: z.string().trim().max(120).optional(),
  total: z.number().nonnegative().max(1_000_000),
  placedAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(itemSchema).min(1).max(200),
});

export type DeliveryOrderInput = z.input<typeof deliveryOrderSchema>;
export type DeliveryItem = z.infer<typeof itemSchema>;

/** Procesa un pedido del webhook: lo crea o actualiza. Lanza UserError con el motivo para el emisor. */
export async function processDeliveryOrder(body: unknown, organizationId: string, opts: { isTest?: boolean } = {}) {
  const parsed = deliveryOrderSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new UserError(`Pedido inválido: ${issue?.path.join(".") || "cuerpo"} ${issue?.message ?? ""}`.trim());
  }
  const data = parsed.data;
  const platform = parsePlatform(data.platform);
  if (!platform) throw new UserError("Plataforma desconocida (usa UBER_EATS, RAPPI o DIDI_FOOD)");
  const channel = await prisma.deliveryChannel.findUnique({ where: { organizationId_platform: { organizationId, platform } } });
  if (!channel?.enabled && !opts.isTest) throw new UserError("Esa plataforma no está conectada en Reymen (Food → Delivery)");

  const fields = {
    displayId: data.displayId ?? data.externalId.slice(-6).toUpperCase(),
    customerName: data.customerName || null,
    totalAmount: data.total,
    items: data.items as unknown as Prisma.InputJsonValue,
    notes: data.notes || null,
  };
  const existing = await prisma.deliveryOrder.findUnique({
    where: { organizationId_platform_externalId: { organizationId, platform, externalId: data.externalId } },
    select: { id: true, status: true },
  });
  if (existing) {
    return prisma.deliveryOrder.update({
      where: { id: existing.id },
      data: { ...fields, status: data.status, ...(existing.status !== data.status ? { statusAt: new Date() } : {}) },
    });
  }
  return prisma.deliveryOrder.create({
    data: {
      organizationId,
      platform,
      externalId: data.externalId,
      status: data.status,
      placedAt: data.placedAt ? new Date(data.placedAt) : new Date(),
      isTest: !!opts.isTest,
      ...fields,
    },
  });
}

/** Siguiente paso de un pedido en el tablero (null si ya terminó). */
export function nextDeliveryStatus(status: DeliveryOrderStatus): DeliveryOrderStatus | null {
  const flow: Partial<Record<DeliveryOrderStatus, DeliveryOrderStatus>> = {
    NEW: "ACCEPTED",
    ACCEPTED: "PREPARING",
    PREPARING: "READY",
    READY: "PICKED_UP",
    PICKED_UP: "DELIVERED",
  };
  return flow[status] ?? null;
}

export function isDeliveryLate(o: { status: DeliveryOrderStatus; placedAt: Date }, now: Date): boolean {
  return (["NEW", "ACCEPTED", "PREPARING"] as DeliveryOrderStatus[]).includes(o.status) && now.getTime() - o.placedAt.getTime() >= DELIVERY_LATE_MINUTES * 60_000;
}
