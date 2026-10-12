import { prisma } from "@/lib/prisma";
import type { StoredDomainEvent } from "@/lib/domain-events";

// ── Atribución conservadora y auditable ──────────────────────────────────────
// Contacto → venta. Se atribuye al ÚLTIMO contacto cuya ventana siga abierta y sea anterior a la venta; una venta
// cuenta para una sola automatización; las cancelaciones revierten (con registro, sin borrar). Nunca se dice
// "ingresos generados": son ingresos ASOCIADOS (no prueba causalidad).

export const ATTRIBUTION_WINDOW_DAYS = 7;
const DAY = 86_400_000;

/** Un mensaje que salió con éxito a un cliente queda como contacto (idempotente por ejecución). Los fallidos no cuentan. */
export async function recordTouchForExecution(executionId: string, touchedAt: Date): Promise<boolean> {
  const ex = await prisma.automationExecution.findUnique({ where: { id: executionId } });
  if (!ex || ex.subjectType !== "customer") return false;
  const action = (ex.action ?? {}) as { type?: string; channel?: string };
  if (action.type !== "message") return false;
  try {
    await prisma.automationTouch.create({
      data: { organizationId: ex.organizationId, customerId: ex.subjectId, automationId: ex.automationId, executionId: ex.id, channel: action.channel ?? "whatsapp", touchedAt, conversionWindowDays: ATTRIBUTION_WINDOW_DAYS },
    });
    return true;
  } catch {
    return false; // ya existía (callback repetido)
  }
}

/** Atribuye una venta completada al último contacto con ventana abierta (si lo hay). */
export async function attributeSale(organizationId: string, saleId: string): Promise<"attributed" | "none"> {
  const sale = await prisma.foodSale.findFirst({ where: { id: saleId, organizationId }, select: { id: true, customerId: true, occurredAt: true, netAmount: true, grossAmount: true } });
  if (!sale?.customerId || Number(sale.grossAmount) <= 0) return "none";
  if (await prisma.automationConversion.findUnique({ where: { organizationId_saleId: { organizationId, saleId } }, select: { id: true } })) return "none"; // ya atribuida

  // Último contacto anterior a la venta (un envío del mismo día posterior a la venta no cuenta) y con la ventana abierta.
  const touch = await prisma.automationTouch.findFirst({
    where: { organizationId, customerId: sale.customerId, touchedAt: { lt: sale.occurredAt, gte: new Date(sale.occurredAt.getTime() - ATTRIBUTION_WINDOW_DAYS * DAY) } },
    orderBy: { touchedAt: "desc" },
  });
  if (!touch) return "none";
  const automation = await prisma.automation.findUnique({ where: { id: touch.automationId }, select: { blueprintVersion: true } });
  try {
    await prisma.automationConversion.create({
      data: { organizationId, customerId: sale.customerId, automationId: touch.automationId, executionId: touch.executionId, touchId: touch.id, saleId, saleAt: sale.occurredAt, attributedRevenue: sale.netAmount, ruleVersion: automation?.blueprintVersion ?? null },
    });
  } catch {
    return "none"; // otra corrida la atribuyó primero
  }
  return "attributed";
}

/** Una cancelación (total o parcial) de una venta atribuida resta su monto; si llega a cero queda revertida (la fila se conserva). */
export async function reverseConversionForCancellation(organizationId: string, cancelSaleId: string): Promise<"reverted" | "reduced" | "none"> {
  const cancel = await prisma.foodSale.findFirst({ where: { id: cancelSaleId, organizationId }, select: { cancelsSaleId: true, netAmount: true } });
  if (!cancel?.cancelsSaleId) return "none";
  const conversion = await prisma.automationConversion.findUnique({ where: { organizationId_saleId: { organizationId, saleId: cancel.cancelsSaleId } } });
  if (!conversion || conversion.revertedAt) return "none";
  const remaining = Math.max(0, Math.round((Number(conversion.attributedRevenue) - Math.abs(Number(cancel.netAmount))) * 100) / 100);
  if (remaining > 0) {
    await prisma.automationConversion.update({ where: { id: conversion.id }, data: { attributedRevenue: remaining } });
    return "reduced";
  }
  await prisma.automationConversion.update({ where: { id: conversion.id }, data: { attributedRevenue: 0, revertedAt: new Date(), revertedBySaleId: cancelSaleId } });
  return "reverted";
}

/** Consumidor de la bandeja de eventos: atribuye las ventas y revierte con las cancelaciones. */
export async function attributeEvent(event: StoredDomainEvent): Promise<void> {
  const saleId = ((event.payload ?? {}) as { saleId?: string }).saleId;
  if (!saleId) return;
  if (event.type === "sale.completed") await attributeSale(event.organizationId, saleId);
  else if (event.type === "sale.cancelled") await reverseConversionForCancellation(event.organizationId, saleId);
}

export type AttributionRow = { automationId: string; name: string; touches: number; conversions: number; revenue: number };

/** Resumen por automatización de los últimos `days` días: contactos, ventas asociadas e ingresos asociados (neto, sin revertidos). */
export async function getAttributionSummary(organizationId: string, days = 30, now: Date = new Date()): Promise<AttributionRow[]> {
  const since = new Date(now.getTime() - days * DAY);
  const [touches, conversions] = await Promise.all([
    prisma.automationTouch.groupBy({ by: ["automationId"], where: { organizationId, touchedAt: { gte: since } }, _count: { _all: true } }),
    prisma.automationConversion.groupBy({ by: ["automationId"], where: { organizationId, saleAt: { gte: since }, revertedAt: null }, _count: { _all: true }, _sum: { attributedRevenue: true } }),
  ]);
  const ids = [...new Set([...touches.map((t) => t.automationId), ...conversions.map((c) => c.automationId)])];
  if (ids.length === 0) return [];
  const automations = await prisma.automation.findMany({ where: { id: { in: ids }, organizationId }, select: { id: true, name: true } });
  return automations
    .map((a) => ({
      automationId: a.id,
      name: a.name,
      touches: touches.find((t) => t.automationId === a.id)?._count._all ?? 0,
      conversions: conversions.find((c) => c.automationId === a.id)?._count._all ?? 0,
      revenue: Number(conversions.find((c) => c.automationId === a.id)?._sum.attributedRevenue ?? 0),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}
