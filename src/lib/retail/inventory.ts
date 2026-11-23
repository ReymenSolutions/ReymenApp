import { Prisma, type RetailChannel, type RetailLocationFormat, type RetailLocationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertModuleEnabled } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { UserError } from "@/lib/user-error";

type ActorPermission = "retail:manage" | "retail:operate";

async function requireActor(organizationId: string, userId: string, permission: ActorPermission) {
  await assertModuleEnabled(organizationId, "RETAIL");
  const actor = await prisma.user.findFirst({
    where: { id: userId, organizationId, isActive: true },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!actor || !can(actor.role, permission)) throw new UserError("No tienes permiso para esta operación de Retail.");
  return { id: actor.id, name: actor.name?.trim() || actor.email };
}

function requiredText(value: string, label: string, max = 120): string {
  const clean = value.trim();
  if (!clean || clean.length > max) throw new UserError(`${label} debe tener entre 1 y ${max} caracteres.`);
  return clean;
}

function money(value: string | null, label: string): Prisma.Decimal | null {
  if (value === null) return null;
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) {
    throw new UserError(`${label} debe ser un importe no negativo con hasta dos decimales.`);
  }
  return new Prisma.Decimal(value);
}

export async function configureRetailLocation(
  organizationId: string,
  actorUserId: string,
  input: { branchId: string; type: RetailLocationType; format: RetailLocationFormat; areaM2?: string | null; address?: string | null; whatsappPhone?: string | null },
) {
  await requireActor(organizationId, actorUserId, "retail:manage");
  const branch = await prisma.branch.findFirst({ where: { id: input.branchId, organizationId }, select: { id: true } });
  if (!branch) throw new UserError("La ubicación no pertenece a esta organización.");
  const current = await prisma.retailLocationSettings.findUnique({ where: { branchId: branch.id }, select: { type: true } });
  if (current && current.type !== input.type) throw new UserError("No se puede cambiar el tipo de una ubicación de Retail ya configurada.");
  if ((input.type === "BODEGA") !== (input.format === "BODEGA") || (input.type === "MAYOREO") !== (input.format === "MAYOREO")) {
    throw new UserError("El tipo y formato de la ubicación no coinciden.");
  }
  const area = input.areaM2 == null || input.areaM2 === "" ? null : money(input.areaM2, "El área");
  return prisma.retailLocationSettings.upsert({
    where: { branchId: branch.id },
    create: { branchId: branch.id, organizationId, type: input.type, format: input.format, areaM2: area, address: input.address?.trim() || null, whatsappPhone: input.whatsappPhone?.trim() || null },
    update: { type: input.type, format: input.format, areaM2: area, address: input.address?.trim() || null, whatsappPhone: input.whatsappPhone?.trim() || null },
  });
}

export async function registerRetailItem(
  organizationId: string,
  actorUserId: string,
  input: { code: string; locationId: string; channel?: RetailChannel; salePrice: string; cost?: string | null; brand?: string | null; category?: string | null; garmentType?: string | null; size?: string | null; color?: string | null; style?: string | null },
) {
  const actor = await requireActor(organizationId, actorUserId, "retail:operate");
  const code = requiredText(input.code, "El código", 80).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code)) throw new UserError("El código solo admite letras, números, punto, guion y guion bajo.");
  const price = money(input.salePrice, "El precio");
  const cost = money(input.cost ?? null, "El costo");
  if (!price) throw new UserError("Se necesita un precio.");
  const location = await prisma.retailLocationSettings.findFirst({
    where: { branchId: input.locationId, organizationId, type: "BODEGA", branch: { isActive: true } },
    select: { branchId: true },
  });
  if (!location) throw new UserError("El alta de piezas requiere una bodega activa de esta organización.");
  if (input.channel === "MAYOREO") throw new UserError("El canal de mayoreo se habilitará en Fase 3.");
  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.retailItem.create({
        data: {
          organizationId, code, locationId: location.branchId, channel: input.channel ?? "TIENDA", salePrice: price, cost,
          brand: input.brand?.trim() || null, category: input.category?.trim() || null, garmentType: input.garmentType?.trim() || null,
          size: input.size?.trim() || null, color: input.color?.trim() || null, style: input.style?.trim() || null,
          createdById: actor.id,
        },
      });
      await tx.retailMovement.create({ data: { organizationId, itemId: item.id, type: "ALTA", toLocationId: location.branchId, toChannel: item.channel, actorUserId: actor.id, actorName: actor.name } });
      return item;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new UserError("Ese código ya existe en la organización.");
    }
    throw error;
  }
}

export async function requestRetailTransfer(organizationId: string, actorUserId: string, itemId: string, toLocationId: string) {
  const actor = await requireActor(organizationId, actorUserId, "retail:operate");
  try {
    return await prisma.$transaction(async (tx) => {
      const item = await tx.retailItem.findFirst({ where: { id: itemId, organizationId, status: "DISPONIBLE" }, select: { id: true, locationId: true, channel: true } });
      if (!item) throw new UserError("La pieza no está disponible en esta organización.");
      if (item.locationId === toLocationId) throw new UserError("El destino debe ser distinto del origen.");
      const destination = await tx.retailLocationSettings.findFirst({ where: { branchId: toLocationId, organizationId, type: "TIENDA", branch: { isActive: true } }, select: { branchId: true } });
      if (!destination) throw new UserError("El destino debe ser una tienda activa de esta organización.");
      const transfer = await tx.retailTransfer.create({ data: { organizationId, itemId: item.id, fromLocationId: item.locationId, toLocationId: destination.branchId, requestedById: actor.id } });
      await tx.retailMovement.create({ data: { organizationId, itemId: item.id, type: "TRASLADO_SOLICITUD", fromLocationId: item.locationId, toLocationId: destination.branchId, fromChannel: item.channel, actorUserId: actor.id, actorName: actor.name, transferId: transfer.id } });
      return transfer;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw new UserError("La pieza ya tiene un traslado abierto. Actualiza la pantalla.");
    throw error;
  }
}

export async function dispatchRetailTransfer(organizationId: string, actorUserId: string, transferId: string) {
  const actor = await requireActor(organizationId, actorUserId, "retail:operate");
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.retailTransfer.findFirst({ where: { id: transferId, organizationId, status: "SOLICITADO" } });
    if (!transfer) throw new UserError("El traslado no está pendiente de salida.");
    const changed = await tx.retailItem.updateMany({ where: { id: transfer.itemId, organizationId, locationId: transfer.fromLocationId, status: "DISPONIBLE" }, data: { status: "EN_TRASLADO" } });
    if (changed.count !== 1) throw new UserError("La pieza ya no está disponible en el origen.");
    const at = new Date();
    await tx.retailTransfer.update({ where: { id: transfer.id }, data: { status: "EN_TRASLADO", departedAt: at, departedById: actor.id } });
    await tx.retailMovement.create({ data: { organizationId, itemId: transfer.itemId, type: "TRASLADO_SALIDA", fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, actorUserId: actor.id, actorName: actor.name, transferId: transfer.id, occurredAt: at } });
    return { id: transfer.id, departedAt: at };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function receiveRetailTransfer(organizationId: string, actorUserId: string, transferId: string) {
  const actor = await requireActor(organizationId, actorUserId, "retail:operate");
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.retailTransfer.findFirst({ where: { id: transferId, organizationId, status: "EN_TRASLADO" } });
    if (!transfer) throw new UserError("El traslado no está pendiente de recepción.");
    const destination = await tx.retailLocationSettings.findFirst({ where: { branchId: transfer.toLocationId, organizationId, type: "TIENDA", branch: { isActive: true } }, select: { branchId: true } });
    if (!destination) throw new UserError("La tienda de destino no está activa.");
    const changed = await tx.retailItem.updateMany({ where: { id: transfer.itemId, organizationId, locationId: transfer.fromLocationId, status: "EN_TRASLADO" }, data: { status: "DISPONIBLE", locationId: destination.branchId } });
    if (changed.count !== 1) throw new UserError("La pieza no está en tránsito desde el origen esperado.");
    const at = new Date();
    await tx.retailTransfer.update({ where: { id: transfer.id }, data: { status: "RECIBIDO", receivedAt: at, receivedById: actor.id } });
    await tx.retailMovement.create({ data: { organizationId, itemId: transfer.itemId, type: "TRASLADO_RECEPCION", fromLocationId: transfer.fromLocationId, toLocationId: destination.branchId, actorUserId: actor.id, actorName: actor.name, transferId: transfer.id, occurredAt: at } });
    return { id: transfer.id, receivedAt: at };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function cancelRetailTransfer(organizationId: string, actorUserId: string, transferId: string, reason: string) {
  const actor = await requireActor(organizationId, actorUserId, "retail:manage");
  const cleanReason = requiredText(reason, "El motivo", 500);
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.retailTransfer.findFirst({ where: { id: transferId, organizationId, status: "SOLICITADO" } });
    if (!transfer) throw new UserError("Solo se puede cancelar un traslado que aún no ha salido.");
    const changed = await tx.retailTransfer.updateMany({ where: { id: transfer.id, organizationId, status: "SOLICITADO" }, data: { status: "CANCELADO" } });
    if (changed.count !== 1) throw new UserError("El traslado ya cambió de estado.");
    await tx.retailMovement.create({ data: { organizationId, itemId: transfer.itemId, type: "TRASLADO_CANCELACION", fromLocationId: transfer.fromLocationId, toLocationId: transfer.toLocationId, actorUserId: actor.id, actorName: actor.name, reason: cleanReason, transferId: transfer.id } });
    return { id: transfer.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function markRetailWaste(organizationId: string, actorUserId: string, itemId: string, reason: string) {
  const actor = await requireActor(organizationId, actorUserId, "retail:manage");
  const cleanReason = requiredText(reason, "El motivo", 500);
  return prisma.$transaction(async (tx) => {
    const item = await tx.retailItem.findFirst({ where: { id: itemId, organizationId, status: "DISPONIBLE" }, select: { id: true, locationId: true, channel: true } });
    if (!item) throw new UserError("La pieza no está disponible para registrar una merma.");
    const openTransfer = await tx.retailTransfer.findFirst({ where: { organizationId, itemId, status: { in: ["SOLICITADO", "EN_TRASLADO"] } }, select: { id: true } });
    if (openTransfer) throw new UserError("Cancela o completa el traslado antes de registrar la merma.");
    const changed = await tx.retailItem.updateMany({ where: { id: item.id, organizationId, status: "DISPONIBLE" }, data: { status: "MERMA" } });
    if (changed.count !== 1) throw new UserError("La pieza cambió de estado.");
    await tx.retailMovement.create({ data: { organizationId, itemId: item.id, type: "MERMA", fromLocationId: item.locationId, fromChannel: item.channel, actorUserId: actor.id, actorName: actor.name, reason: cleanReason } });
    return { id: item.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
