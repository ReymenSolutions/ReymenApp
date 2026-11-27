"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { logAudit } from "@/lib/audit";
import { calculateNetLines } from "@/lib/workshop/money";
import { Prisma } from "@prisma/client";
import { workshopStock } from "@/lib/workshop/inventory";

const serviceInput = z.object({
  nameEs: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  costoNeto: z.string().optional(),
  precioVentaNeto: z.string().optional(),
  active: z.boolean(),
});

/** Configura conceptos del taller sin inferir precios ni costos. */
export async function saveWorkshopService(id: string | null, input: z.input<typeof serviceInput>) {
  const { orgId, userId } = await requireWorkshopOwner();
  const parsed = serviceInput.safeParse(input);
  if (!parsed.success) throw new UserError("Revisa el servicio");
  const d = parsed.data;
  const money = (value?: string) => {
    if (!value?.trim()) return null;
    try {
      const amount = new Prisma.Decimal(value);
      if (!amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 2 || amount.gt(9999999999.99)) throw new Error();
      return amount;
    } catch { throw new UserError("Revisa el costo y precio netos"); }
  };
  const data = { nameEs: d.nameEs, nameEn: d.nameEn, costoNeto: money(d.costoNeto), precioVentaNeto: money(d.precioVentaNeto), active: d.active, provisional: false };
  let serviceId: string;
  try {
    if (id) {
      const updated = await prisma.workshopService.updateMany({ where: { id, organizationId: orgId }, data });
      if (!updated.count) throw new UserError("Servicio no disponible");
      serviceId = id;
    } else {
      serviceId = (await prisma.workshopService.create({ data: { ...data, organizationId: orgId }, select: { id: true } })).id;
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new UserError("Ya existe un servicio con ese nombre");
    throw error;
  }
  await logAudit({ organizationId: orgId, userId, action: id ? "workshop.service.update" : "workshop.service.create", resource: "WorkshopService", resourceId: serviceId });
  revalidatePath("/portal/workshop");
  revalidatePath("/taller-wolf");
  return { id: serviceId };
}

const vehicleInput = z.object({
  customerId: z.string().min(1),
  placas: z.string().trim().max(20).optional(),
  vin: z.string().trim().max(17).optional(),
  marca: z.string().trim().min(1).max(80),
  modelo: z.string().trim().min(1).max(80),
  anio: z.coerce.number().int().min(1900).max(2100),
  kilometrajeActual: z.string().optional(),
});

export async function createWorkshopVehicle(input: z.input<typeof vehicleInput>) {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!orgId || !["OWNER", "ADMIN", "SUPER_ADMIN"].includes(session.user.role)) throw new UserError("No autorizado");
  await assertModuleEnabled(orgId, "WORKSHOP");
  const parsed = vehicleInput.safeParse(input);
  if (!parsed.success) throw new UserError("Revisa los datos del vehículo");
  const data = parsed.data;
  const customer = await prisma.customer.findFirst({ where: { id: data.customerId, organizationId: orgId }, select: { id: true } });
  if (!customer) throw new UserError("Cliente del CRM no encontrado en tu organización");

  const plates = data.placas?.toUpperCase().replace(/\s+/g, "") || null;
  const vin = data.vin?.toUpperCase().replace(/\s+/g, "") || null;
  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new UserError("El VIN debe tener 17 caracteres válidos o quedar vacío");
  const mileage = data.kilometrajeActual?.trim() ? z.coerce.number().int().min(0).max(10_000_000).safeParse(data.kilometrajeActual.trim()) : null;
  if (mileage && !mileage.success) throw new UserError("Revisa el kilometraje");
  const identifiers = [...(plates ? [{ placas: plates }] : []), ...(vin ? [{ vin }] : [])];
  const existing = identifiers.length ? await prisma.workshopVehicle.findFirst({
    where: { organizationId: orgId, OR: identifiers },
    select: { id: true },
  }) : null;
  if (existing) throw new UserError("Las placas o el VIN ya están registrados; reutiliza ese vehículo");

  const vehicle = await prisma.workshopVehicle.create({
    data: { organizationId: orgId, customerId: customer.id, placas: plates, vin, marca: data.marca, modelo: data.modelo, anio: data.anio, kilometrajeActual: mileage?.data ?? null },
    select: { id: true },
  });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "workshop.vehicle.create", resource: "WorkshopVehicle", resourceId: vehicle.id });
  revalidatePath("/portal/workshop");
  return { id: vehicle.id };
}

/** Convierte una solicitud pública tras verificar los datos que exige una ficha completa. */
export async function markWorkshopRequestViewed(requestId: string) {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!orgId || !["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "AGENT"].includes(session.user.role)) throw new UserError("No autorizado");
  await assertModuleEnabled(orgId, "WORKSHOP");
  const userId = session.user.id;
  const result = await prisma.workshopLeadRequest.updateMany({
    where: { id: requestId, organizationId: orgId, viewedAt: null },
    data: { viewedAt: new Date(), viewedById: userId },
  });
  if (result.count) {
    await logAudit({ organizationId: orgId, userId, action: "workshop.inquiry.view", resource: "WorkshopLeadRequest", resourceId: requestId });
  }
  revalidatePath("/portal/workshop");
  return { updated: result.count > 0 };
}

export async function discardWorkshopRequest(requestId: string) {
  const { orgId, userId } = await requireWorkshopOwner();
  const result = await prisma.workshopLeadRequest.updateMany({
    where: { id: requestId, organizationId: orgId, discardedAt: null, quote: { is: null } },
    data: { discardedAt: new Date(), discardedById: userId, viewedAt: new Date(), viewedById: userId },
  });
  if (result.count) await logAudit({ organizationId: orgId, userId, action: "workshop.inquiry.discard", resource: "WorkshopLeadRequest", resourceId: requestId });
  revalidatePath("/portal/workshop");
  return { updated: result.count > 0 };
}

export async function createWorkshopVehicleFromRequest(requestId: string, rawVin: string, confirmedIdentity: boolean, rawPlacas?: string, rawKilometraje?: string) {
  const { orgId, userId } = await requireWorkshopOwner();
  if (confirmedIdentity !== true) throw new UserError("Verifica la identidad del cliente antes de vincular la solicitud");
  const vinText = rawVin.trim().toUpperCase().replace(/\s+/g, "");
  const vinResult = vinText ? z.string().length(17).regex(/^[A-HJ-NPR-Z0-9]+$/).safeParse(vinText) : null;
  if (vinResult && !vinResult.success) throw new UserError("El VIN debe tener 17 caracteres válidos o quedar vacío");
  const vin = vinResult?.data ?? null;
  const request = await prisma.workshopLeadRequest.findFirst({
    where: { id: requestId, organizationId: orgId },
    select: { id: true, leadId: true, placas: true, marca: true, modelo: true, anio: true, kilometraje: true, servicioFalla: true, lead: { select: { id: true, name: true, phone: true, phoneKey: true, deletedAt: true } } },
  });
  if (!request || !request.lead.phone || !request.lead.phoneKey) throw new UserError("Solicitud del taller no disponible");
  const platesText = rawPlacas?.trim() || request.placas?.trim() || "";
  const platesResult = platesText ? z.string().min(4).max(12).regex(/^[A-Za-z0-9 -]+$/).safeParse(platesText) : null;
  if (platesResult && !platesResult.success) throw new UserError("Revisa las placas o déjalas vacías");
  const plates = platesResult?.data.toUpperCase().replace(/\s+/g, "") ?? null;
  const mileageText = (rawKilometraje?.trim() || String(request.kilometraje ?? "")).replace(/[,.\s]/g, "");
  const mileageResult = mileageText ? z.coerce.number().int().min(0).max(10_000_000).safeParse(mileageText) : null;
  if (mileageResult && !mileageResult.success) throw new UserError("Revisa el kilometraje o déjalo vacío");
  const mileage = mileageResult?.data ?? null;
  const activeLeads = request.lead.deletedAt ? await prisma.lead.findMany({ where: { organizationId: orgId, phoneKey: request.lead.phoneKey, deletedAt: null }, select: { id: true }, take: 2 }) : [];
  if (request.lead.deletedAt && activeLeads.length !== 1) throw new UserError("El contacto fue fusionado. Revisa su ficha del CRM antes de vincular esta solicitud");
  const leadId = request.lead.deletedAt ? activeLeads[0].id : request.lead.id;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WorkshopLeadRequest" WHERE id = ${requestId} AND "organizationId" = ${orgId} FOR UPDATE`;
    const locked = await tx.workshopLeadRequest.findFirst({ where: { id: requestId, organizationId: orgId }, select: { vehicleId: true, discardedAt: true } });
    if (!locked || locked.discardedAt) throw new UserError("Solicitud del taller no disponible");
    if (locked.vehicleId) return { id: locked.vehicleId, created: false };
    const customer = await tx.customer.upsert({
      where: { organizationId_phoneKey: { organizationId: orgId, phoneKey: request.lead.phoneKey! } },
      create: { organizationId: orgId, phone: request.lead.phone!, phoneKey: request.lead.phoneKey!, name: request.lead.name, leadId, consentAccepted: false },
      update: {}, select: { id: true },
    });
    await tx.customer.updateMany({ where: { id: customer.id, organizationId: orgId, leadId: null }, data: { leadId } });
    if (request.leadId !== leadId) await tx.workshopLeadRequest.update({ where: { id: requestId }, data: { leadId } });
    const identifiers = [...(plates ? [{ placas: plates }] : []), ...(vin ? [{ vin }] : [])];
    const existing = identifiers.length ? await tx.workshopVehicle.findFirst({ where: { organizationId: orgId, OR: identifiers }, select: { id: true, customerId: true } }) : null;
    if (existing) {
      if (existing.customerId !== customer.id) throw new UserError("Las placas o el VIN pertenecen a otro cliente; revisa el vehículo existente");
      await tx.workshopLeadRequest.update({ where: { id: request.id }, data: { vehicleId: existing.id } });
      return { id: existing.id, created: false };
    }
    const vehicle = await tx.workshopVehicle.create({ data: {
      organizationId: orgId, customerId: customer.id, placas: plates, vin,
      marca: request.marca, modelo: request.modelo, anio: request.anio, kilometrajeActual: mileage,
    }, select: { id: true } });
    await tx.workshopLeadRequest.update({ where: { id: request.id }, data: { vehicleId: vehicle.id } });
    return { id: vehicle.id, created: true };
  });
  if (result.created) await logAudit({ organizationId: orgId, userId, action: "workshop.vehicle.from_request", resource: "WorkshopVehicle", resourceId: result.id, metadata: { requestId, identityConfirmed: true } });
  revalidatePath("/portal/workshop");
  return { id: result.id, servicioFalla: request.servicioFalla };
}

const quoteInput = z.object({
  vehicleId: z.string().min(1),
  requestId: z.string().optional(),
  servicioTitulo: z.string().trim().min(2).max(160),
  tiempoEstimado: z.string().trim().max(100).optional(),
  notas: z.string().trim().max(2000).optional(),
  items: z.array(z.object({
    tipo: z.enum(["REFACCION", "MANO_DE_OBRA", "SERVICIO"]),
    partId: z.string().optional(),
    concepto: z.string().trim().min(2).max(160),
    detalle: z.string().trim().max(1000).optional(),
    cantidad: z.string(),
    unidad: z.string().trim().min(1).max(24),
    precioUnitarioNeto: z.string(),
    costoUnitarioNeto: z.string().optional(),
  })).min(1).max(100),
});

export async function createWorkshopQuote(input: z.input<typeof quoteInput>) {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!orgId || !["OWNER", "ADMIN", "SUPER_ADMIN"].includes(session.user.role)) throw new UserError("No autorizado");
  await assertModuleEnabled(orgId, "WORKSHOP");
  const parsed = quoteInput.safeParse(input);
  if (!parsed.success) throw new UserError("Revisa los datos de la cotización");
  const data = parsed.data;
  const vehicle = await prisma.workshopVehicle.findFirst({ where: { id: data.vehicleId, organizationId: orgId }, select: { id: true, customerId: true } });
  if (!vehicle) throw new UserError("Vehículo no encontrado en tu organización");
  const partIds = [...new Set(data.items.filter((item) => item.tipo === "REFACCION").map((item) => item.partId).filter((id): id is string => !!id))];
  if (data.items.some((item) => item.tipo === "REFACCION" && !item.partId)) throw new UserError("Selecciona una refacción del inventario para cada línea de refacción");
  const parts = await prisma.workshopPart.findMany({ where: { organizationId: orgId, id: { in: partIds } }, select: { id: true } });
  if (parts.length !== partIds.length) throw new UserError("Una refacción no pertenece a tu organización");
  let totals;
  try {
    totals = calculateNetLines(data.items.map((item) => ({ cantidad: item.cantidad, precioUnitarioNeto: item.precioUnitarioNeto, costoUnitarioNeto: item.costoUnitarioNeto || null })));
  } catch {
    throw new UserError("Revisa cantidades, costos y precios netos");
  }
  const settings = await prisma.workshopSettings.findUnique({ where: { organizationId: orgId } });
  const quote = await prisma.$transaction(async (tx) => {
    if (data.requestId) {
      await tx.$queryRaw`SELECT id FROM "WorkshopLeadRequest" WHERE id = ${data.requestId} AND "organizationId" = ${orgId} FOR UPDATE`;
      const request = await tx.workshopLeadRequest.findFirst({ where: { id: data.requestId, organizationId: orgId }, select: { vehicleId: true, discardedAt: true, quote: { select: { id: true } } } });
      if (!request || request.discardedAt || request.vehicleId !== vehicle.id) throw new UserError("Solicitud del taller no disponible para cotizar");
      if (request.quote) return { id: request.quote.id, created: false };
    }
    const saved = await tx.workshopQuote.create({
    data: {
      organizationId: orgId,
      customerId: vehicle.customerId,
      vehicleId: vehicle.id,
      requestId: data.requestId || null,
      servicioTitulo: data.servicioTitulo,
      tiempoEstimado: data.tiempoEstimado || null,
      notas: data.notas || null,
      vigenciaDias: settings?.vigenciaDias ?? 15,
      garantiaDias: settings?.garantiaDias ?? 90,
      garantiaKm: settings?.garantiaKm ?? 5000,
      subtotalNeto: totals.subtotalNeto,
      iva: totals.iva,
      total: totals.total,
      costoTotalNeto: totals.costoTotalNeto,
      utilidadNeta: totals.utilidadNeta,
      items: { create: data.items.map((item, index) => ({
        organizationId: orgId,
        tipo: item.tipo,
        partId: item.tipo === "REFACCION" ? item.partId : null,
        concepto: item.concepto,
        detalle: item.detalle || null,
        cantidad: item.cantidad,
        unidad: item.unidad,
        precioUnitarioNeto: item.precioUnitarioNeto,
        costoUnitarioNeto: item.costoUnitarioNeto || null,
        importeNeto: totals.lines[index].importeNeto,
        ivaImporte: totals.lines[index].ivaImporte,
        importeConIva: totals.lines[index].importeConIva,
      })) },
    },
    select: { id: true },
  });
    if (data.requestId) await tx.workshopLeadRequest.update({ where: { id: data.requestId }, data: { viewedAt: new Date(), viewedById: session.user.id } });
    return { id: saved.id, created: true };
  });
  if (quote.created) await logAudit({ organizationId: orgId, userId: session.user.id, action: "workshop.quote.create", resource: "WorkshopQuote", resourceId: quote.id });
  revalidatePath("/portal/workshop");
  return { id: quote.id };
}

async function requireWorkshopOwner() {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!orgId || !["OWNER", "ADMIN", "SUPER_ADMIN"].includes(session.user.role)) throw new UserError("No autorizado");
  await assertModuleEnabled(orgId, "WORKSHOP");
  return { orgId, userId: session.user.id };
}

/** El folio se asigna solo cuando el PDF puede mostrar todos los datos obligatorios. */
export async function issueWorkshopQuote(quoteId: string) {
  const { orgId, userId } = await requireWorkshopOwner();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WorkshopQuote" WHERE id = ${quoteId} AND "organizationId" = ${orgId} FOR UPDATE`;
    const quote = await tx.workshopQuote.findFirst({ where: { id: quoteId, organizationId: orgId }, include: { customer: true, vehicle: true, items: true } });
    if (!quote) throw new UserError("Cotización no encontrada");
    if (quote.estado !== "BORRADOR") throw new UserError("Solo se puede emitir una cotización en borrador");
    if (quote.folio) return { id: quote.id, folio: quote.folio, created: false };
    if (!quote.customer.name?.trim() || !quote.customer.phone.trim() || !quote.vehicle.placas?.trim() || !quote.vehicle.vin?.trim() || quote.vehicle.kilometrajeActual === null) {
      throw new UserError("Completa nombre, teléfono, placas, VIN y kilometraje antes de emitir el PDF con folio");
    }
    if (!quote.items.length) throw new UserError("La cotización necesita líneas");
    const year = new Date().getUTCFullYear();
    const counter = await tx.workshopFolioCounter.upsert({
      where: { organizationId_year_kind: { organizationId: orgId, year, kind: "QUOTE" } },
      create: { organizationId: orgId, year, kind: "QUOTE", lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const folio = `TW-${year}-${String(counter.lastNumber).padStart(4, "0")}`;
    await tx.workshopQuote.update({ where: { id: quote.id }, data: { folio } });
    return { id: quote.id, folio, created: true };
  });
  if (result.created) await logAudit({ organizationId: orgId, userId, action: "workshop.quote.issue", resource: "WorkshopQuote", resourceId: quoteId, metadata: { folio: result.folio } });
  revalidatePath("/portal/workshop");
  return { id: result.id, folio: result.folio, pdfUrl: `/api/workshop/quotes/${quoteId}/pdf` };
}

export async function markWorkshopQuoteSent(quoteId: string) {
  const { orgId, userId } = await requireWorkshopOwner();
  const updated = await prisma.workshopQuote.updateMany({ where: { id: quoteId, organizationId: orgId, estado: "BORRADOR", folio: { not: null } }, data: { estado: "ENVIADA", enviadaEn: new Date() } });
  if (!updated.count) throw new UserError("Emite primero el PDF o revisa el estado de la cotización");
  await logAudit({ organizationId: orgId, userId, action: "workshop.quote.sent", resource: "WorkshopQuote", resourceId: quoteId });
  revalidatePath("/portal/workshop");
}

export async function approveWorkshopQuote(quoteId: string, via: string) {
  const { orgId, userId } = await requireWorkshopOwner();
  const medium = z.string().trim().min(2).max(80).safeParse(via);
  if (!medium.success) throw new UserError("Indica cómo autorizó el cliente");
  const quote = await prisma.workshopQuote.findFirst({ where: { id: quoteId, organizationId: orgId }, select: { enviadaEn: true, vigenciaDias: true, estado: true } });
  if (!quote || quote.estado !== "ENVIADA" || !quote.enviadaEn) throw new UserError("Solo se puede aprobar una cotización enviada");
  if (quote.enviadaEn.getTime() + quote.vigenciaDias * 86_400_000 < Date.now()) {
    await prisma.workshopQuote.updateMany({ where: { id: quoteId, organizationId: orgId, estado: "ENVIADA" }, data: { estado: "VENCIDA" } });
    throw new UserError("La cotización venció; crea una nueva con precios actualizados");
  }
  const updated = await prisma.workshopQuote.updateMany({ where: { id: quoteId, organizationId: orgId, estado: "ENVIADA" }, data: { estado: "APROBADA", aprobadaEn: new Date(), aprobadaVia: medium.data } });
  if (!updated.count) throw new UserError("Solo se puede aprobar una cotización enviada");
  await logAudit({ organizationId: orgId, userId, action: "workshop.quote.approved", resource: "WorkshopQuote", resourceId: quoteId, metadata: { via: medium.data } });
  revalidatePath("/portal/workshop");
}

/** Bloquea la cotización para que dos solicitudes no creen órdenes duplicadas. */
export async function convertWorkshopQuote(quoteId: string) {
  const { orgId, userId } = await requireWorkshopOwner();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WorkshopQuote" WHERE id = ${quoteId} AND "organizationId" = ${orgId} FOR UPDATE`;
    const quote = await tx.workshopQuote.findFirst({ where: { id: quoteId, organizationId: orgId }, include: { vehicle: true, items: true } });
    if (!quote || quote.estado !== "APROBADA" || !quote.aprobadaEn || !quote.aprobadaVia) throw new UserError("Solo una cotización aprobada se puede convertir");
    if (!quote.enviadaEn || quote.enviadaEn.getTime() + quote.vigenciaDias * 86_400_000 < Date.now()) throw new UserError("La cotización venció; crea una nueva con precios actualizados");
    if (!quote.folio || !quote.vehicle.placas || !quote.vehicle.vin || quote.vehicle.kilometrajeActual === null) throw new UserError("Faltan datos obligatorios del vehículo");
    const year = new Date().getUTCFullYear();
    const counter = await tx.workshopFolioCounter.upsert({
      where: { organizationId_year_kind: { organizationId: orgId, year, kind: "ORDER" } },
      create: { organizationId: orgId, year, kind: "ORDER", lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const folio = `WO-${year}-${String(counter.lastNumber).padStart(4, "0")}`;
    const order = await tx.workshopWorkOrder.create({
      data: {
        organizationId: orgId,
        folio,
        quoteId: quote.id,
        customerId: quote.customerId,
        vehicleId: quote.vehicleId,
        kilometrajeIngreso: quote.vehicle.kilometrajeActual,
        saldo: quote.total,
        garantiaDias: quote.garantiaDias,
        garantiaKm: quote.garantiaKm,
        items: { create: quote.items.map((item) => ({
          organizationId: orgId,
          partId: item.partId,
          tipo: item.tipo,
          concepto: item.concepto,
          detalle: item.detalle,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precioUnitarioNeto: item.precioUnitarioNeto,
          costoUnitarioNeto: item.costoUnitarioNeto,
          importeNeto: item.importeNeto,
          ivaImporte: item.ivaImporte,
          importeConIva: item.importeConIva,
          autorizadaEn: quote.aprobadaEn,
          autorizadaVia: quote.aprobadaVia,
        })) },
      },
      select: { id: true, folio: true },
    });
    await tx.workshopQuote.update({ where: { id: quote.id }, data: { estado: "CONVERTIDA" } });
    return order;
  });
  await logAudit({ organizationId: orgId, userId, action: "workshop.quote.convert", resource: "WorkshopWorkOrder", resourceId: result.id, metadata: { quoteId, folio: result.folio } });
  revalidatePath("/portal/workshop");
  return result;
}

const partInput = z.object({
  sku: z.string().trim().min(1).max(60),
  nombre: z.string().trim().min(2).max(160),
  unidad: z.string().trim().min(1).max(24),
  costoNeto: z.string(),
  precioVentaNeto: z.string(),
  stockMinimo: z.string(),
});

export async function createWorkshopPart(input: z.input<typeof partInput>) {
  const { orgId, userId } = await requireWorkshopOwner();
  const parsed = partInput.safeParse(input);
  if (!parsed.success) throw new UserError("Revisa los datos de la refacción");
  const d = parsed.data;
  let cost: Prisma.Decimal, price: Prisma.Decimal, min: Prisma.Decimal;
  try {
    cost = new Prisma.Decimal(d.costoNeto);
    price = new Prisma.Decimal(d.precioVentaNeto);
    min = new Prisma.Decimal(d.stockMinimo);
    if (cost.lt(0) || price.lt(0) || min.lt(0) || cost.decimalPlaces() > 2 || price.decimalPlaces() > 2 || min.decimalPlaces() > 3) throw new Error();
  } catch { throw new UserError("Costo, precio o mínimo inválido"); }
  const part = await prisma.workshopPart.create({ data: { organizationId: orgId, sku: d.sku.toUpperCase(), nombre: d.nombre, unidad: d.unidad, costoNeto: cost, precioVentaNeto: price, stockMinimo: min }, select: { id: true } });
  await logAudit({ organizationId: orgId, userId, action: "workshop.part.create", resource: "WorkshopPart", resourceId: part.id });
  revalidatePath("/portal/workshop");
  return part;
}

const purchaseInput = z.object({
  requestKey: z.string().uuid(),
  proveedor: z.string().trim().min(2).max(160),
  folioProveedor: z.string().trim().max(80).optional(),
  workOrderId: z.string().optional(),
  paid: z.boolean(),
  method: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA"]).optional(),
  lines: z.array(z.object({ partId: z.string().min(1), cantidad: z.string(), costoUnitarioNeto: z.string() })).min(1).max(100),
});

export async function createWorkshopPurchase(input: z.input<typeof purchaseInput>) {
  const { orgId, userId } = await requireWorkshopOwner();
  const parsed = purchaseInput.safeParse(input);
  if (!parsed.success) throw new UserError("Revisa los datos de la compra");
  const d = parsed.data;
  if (d.paid && !d.method) throw new UserError("Selecciona el método de pago");
  const already = await prisma.workshopPurchase.findUnique({ where: { organizationId_requestKey: { organizationId: orgId, requestKey: d.requestKey } }, select: { id: true } });
  if (already) return already;
  const totals = calculateNetLines(d.lines.map((line) => ({ cantidad: line.cantidad, precioUnitarioNeto: line.costoUnitarioNeto })));
  const partIds = [...new Set(d.lines.map((line) => line.partId))];
  const parts = await prisma.workshopPart.findMany({ where: { organizationId: orgId, id: { in: partIds } }, select: { id: true } });
  if (parts.length !== partIds.length) throw new UserError("Una refacción no pertenece a tu organización");
  if (d.workOrderId) {
    const order = await prisma.workshopWorkOrder.findFirst({ where: { id: d.workOrderId, organizationId: orgId }, select: { id: true, estado: true } });
    if (!order || ["ENTREGADA", "CANCELADA"].includes(order.estado)) throw new UserError("Orden no disponible para esta compra");
  }
  let purchase;
  try {
    purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.workshopPurchase.create({
        data: {
          organizationId: orgId, requestKey: d.requestKey, proveedor: d.proveedor, fecha: new Date(), folioProveedor: d.folioProveedor || null,
          workOrderId: d.workOrderId || null, subtotalNeto: totals.subtotalNeto, iva: totals.iva, total: totals.total,
          lines: { create: d.lines.map((line, index) => ({ organizationId: orgId, partId: line.partId, cantidad: line.cantidad, costoUnitarioNeto: line.costoUnitarioNeto, importeNeto: totals.lines[index].importeNeto })) },
        }, select: { id: true },
      });
      for (const line of d.lines) {
        await tx.workshopInventoryMovement.create({ data: { organizationId: orgId, partId: line.partId, tipo: "ENTRADA_COMPRA", cantidad: line.cantidad, costoUnitarioNeto: line.costoUnitarioNeto, purchaseId: created.id } });
      }
      if (d.paid && d.method) await tx.workshopCashMovement.create({ data: { organizationId: orgId, tipo: "EGRESO", concepto: `Compra: ${d.proveedor}`, monto: totals.total, metodo: d.method, purchaseId: created.id, fecha: new Date(), registradoPorId: userId } });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.workshopPurchase.findUnique({ where: { organizationId_requestKey: { organizationId: orgId, requestKey: d.requestKey } }, select: { id: true } });
      if (duplicate) return duplicate;
    }
    throw error;
  }
  await logAudit({ organizationId: orgId, userId, action: "workshop.purchase.create", resource: "WorkshopPurchase", resourceId: purchase.id });
  revalidatePath("/portal/workshop");
  return purchase;
}

export async function getWorkshopPartStock(partId: string) {
  const { orgId } = await requireWorkshopOwner();
  const part = await prisma.workshopPart.findFirst({ where: { id: partId, organizationId: orgId }, select: { id: true } });
  if (!part) throw new UserError("Refacción no encontrada");
  return workshopStock(prisma, orgId, partId).then((value) => value.toString());
}

async function requireWorkshopOperator() {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!orgId || !["OWNER", "ADMIN", "SUPER_ADMIN", "AGENT"].includes(session.user.role)) throw new UserError("No autorizado");
  await assertModuleEnabled(orgId, "WORKSHOP");
  return { orgId, userId: session.user.id };
}

const receptionInput = z.object({
  kilometrajeIngreso: z.number().int().min(0).max(10_000_000),
  nivelCombustible: z.string().trim().min(1).max(60),
  fallaReportada: z.string().trim().min(2).max(2000),
  diagnostico: z.string().trim().max(2000).optional(),
  danosPrevios: z.string().trim().max(2000),
  testigos: z.string().trim().max(2000),
  pertenencias: z.string().trim().max(2000),
});

export async function saveWorkshopReception(orderId: string, input: z.input<typeof receptionInput>) {
  const { orgId, userId } = await requireWorkshopOperator();
  const parsed = receptionInput.safeParse(input);
  if (!parsed.success) throw new UserError("Completa kilometraje, combustible, falla y checklist");
  const d = parsed.data;
  const updated = await prisma.workshopWorkOrder.updateMany({
    where: { id: orderId, organizationId: orgId, estado: { in: ["RECEPCION", "DIAGNOSTICO"] } },
    data: { kilometrajeIngreso: d.kilometrajeIngreso, nivelCombustible: d.nivelCombustible, fallaReportada: d.fallaReportada, diagnostico: d.diagnostico || null, checklistRecepcion: { danosPrevios: d.danosPrevios, testigos: d.testigos, pertenencias: d.pertenencias } },
  });
  if (!updated.count) throw new UserError("Orden no disponible para recepción");
  await logAudit({ organizationId: orgId, userId, action: "workshop.order.reception", resource: "WorkshopWorkOrder", resourceId: orderId });
  revalidatePath("/portal/workshop");
}

export async function advanceWorkshopOrder(orderId: string, next: "DIAGNOSTICO" | "EN_REPARACION" | "LISTA_PARA_ENTREGA") {
  const { orgId, userId } = await requireWorkshopOperator();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WorkshopWorkOrder" WHERE id = ${orderId} AND "organizationId" = ${orgId} FOR UPDATE`;
    const order = await tx.workshopWorkOrder.findFirst({ where: { id: orderId, organizationId: orgId }, include: { vehicle: true, items: true } });
    if (!order) throw new UserError("Orden no encontrada");
    const expected = next === "DIAGNOSTICO" ? "RECEPCION" : next === "EN_REPARACION" ? "DIAGNOSTICO" : "EN_REPARACION";
    if (order.estado !== expected) throw new UserError("Transición de estado no permitida");
    if (next === "DIAGNOSTICO") {
      const photos = await tx.workshopPhoto.count({ where: { organizationId: orgId, workOrderId: orderId, phase: "RECEPCION" } });
      if (!photos || !order.checklistRecepcion || !order.nivelCombustible || !order.fallaReportada || !order.vehicle.placas || !order.vehicle.vin) throw new UserError("Completa recepción, checklist y fotos antes del diagnóstico");
    }
    if (next === "EN_REPARACION") {
      if (!order.diagnostico?.trim()) throw new UserError("Registra el diagnóstico antes de iniciar el trabajo");
      const partIds = [...new Set(order.items.filter((item) => item.tipo === "REFACCION").map((item) => item.partId))];
      if (partIds.some((id) => !id)) throw new UserError("Vincula todas las refacciones al inventario");
      const sortedIds = partIds.filter((id): id is string => !!id).sort();
      for (const partId of sortedIds) await tx.$queryRaw`SELECT id FROM "WorkshopPart" WHERE id = ${partId} AND "organizationId" = ${orgId} FOR UPDATE`;
      const parts = await tx.workshopPart.findMany({ where: { organizationId: orgId, id: { in: sortedIds } }, select: { id: true, costoNeto: true } });
      if (parts.length !== sortedIds.length) throw new UserError("Una refacción no pertenece a tu organización");
      for (const part of parts) {
        const needed = order.items.filter((item) => item.partId === part.id).reduce((sum, item) => sum.plus(item.cantidad), new Prisma.Decimal(0));
        if ((await workshopStock(tx, orgId, part.id)).lt(needed)) throw new UserError(`No hay existencias suficientes de ${part.id}; registra primero una compra`);
      }
      for (const item of order.items.filter((line) => line.tipo === "REFACCION" && line.partId)) {
        const part = parts.find((p) => p.id === item.partId)!;
        await tx.workshopInventoryMovement.create({ data: { organizationId: orgId, partId: part.id, workOrderId: orderId, tipo: "SALIDA_ORDEN", cantidad: item.cantidad, costoUnitarioNeto: item.costoUnitarioNeto ?? part.costoNeto } });
      }
    }
    if (next === "LISTA_PARA_ENTREGA") {
      const photos = await tx.workshopPhoto.count({ where: { organizationId: orgId, workOrderId: orderId, phase: "PROCESO" } });
      if (!photos) throw new UserError("Sube al menos una foto del trabajo realizado");
    }
    await tx.workshopWorkOrder.update({ where: { id: orderId }, data: { estado: next } });
    return next;
  });
  await logAudit({ organizationId: orgId, userId, action: "workshop.order.advance", resource: "WorkshopWorkOrder", resourceId: orderId, metadata: { estado: result } });
  revalidatePath("/portal/workshop");
}

const extraLineInput = z.object({
  requestKey: z.string().uuid(),
  tipo: z.enum(["REFACCION", "MANO_DE_OBRA", "SERVICIO"]),
  partId: z.string().optional(),
  concepto: z.string().trim().min(2).max(160),
  detalle: z.string().trim().max(1000).optional(),
  cantidad: z.string(),
  unidad: z.string().trim().min(1).max(24),
  precioUnitarioNeto: z.string(),
  costoUnitarioNeto: z.string().optional(),
  autorizadaVia: z.string().trim().min(2).max(80),
});

/** Registra la autorización del cliente antes de agregar trabajo o consumir una refacción. */
export async function addWorkshopAuthorizedLine(orderId: string, input: z.input<typeof extraLineInput>) {
  const { orgId, userId } = await requireWorkshopOwner();
  const parsed = extraLineInput.safeParse(input);
  if (!parsed.success) throw new UserError("Revisa la línea adicional y cómo la autorizó el cliente");
  const d = parsed.data;
  if (d.tipo === "REFACCION" && !d.partId) throw new UserError("Selecciona una refacción del inventario para cada línea de refacción");
  let totals;
  try { totals = calculateNetLines([{ cantidad: d.cantidad, precioUnitarioNeto: d.precioUnitarioNeto, costoUnitarioNeto: d.costoUnitarioNeto || null }]); }
  catch { throw new UserError("Revisa cantidades, costos y precios netos"); }
  const line = totals.lines[0];
  const checkExisting = async () => {
    const existing = await prisma.workshopOrderItem.findUnique({ where: { organizationId_requestKey: { organizationId: orgId, requestKey: d.requestKey } }, select: { id: true, workOrderId: true, tipo: true, partId: true, concepto: true, cantidad: true, precioUnitarioNeto: true, costoUnitarioNeto: true, autorizadaVia: true } });
    if (!existing) return null;
    if (existing.workOrderId !== orderId || existing.tipo !== d.tipo || (existing.partId ?? null) !== (d.tipo === "REFACCION" ? d.partId : null) || existing.concepto !== d.concepto || !existing.cantidad.eq(d.cantidad) || !existing.precioUnitarioNeto.eq(d.precioUnitarioNeto) || (existing.costoUnitarioNeto === null ? !!d.costoUnitarioNeto : !d.costoUnitarioNeto || !existing.costoUnitarioNeto.eq(d.costoUnitarioNeto)) || existing.autorizadaVia !== d.autorizadaVia) throw new UserError("La clave de solicitud ya se usó con otra línea");
    return { id: existing.id, created: false };
  };
  const previous = await checkExisting();
  if (previous) return previous;
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "WorkshopWorkOrder" WHERE id = ${orderId} AND "organizationId" = ${orgId} FOR UPDATE`;
      const order = await tx.workshopWorkOrder.findFirst({ where: { id: orderId, organizationId: orgId }, select: { id: true, estado: true } });
      if (!order || !["DIAGNOSTICO", "EN_REPARACION"].includes(order.estado)) throw new UserError("La orden no admite trabajo adicional en este estado");
      let inventoryCost: Prisma.Decimal | null = null;
      if (d.tipo === "REFACCION" && d.partId) {
        await tx.$queryRaw`SELECT id FROM "WorkshopPart" WHERE id = ${d.partId} AND "organizationId" = ${orgId} FOR UPDATE`;
        const part = await tx.workshopPart.findFirst({ where: { id: d.partId, organizationId: orgId }, select: { id: true, costoNeto: true } });
        if (!part) throw new UserError("Una refacción no pertenece a tu organización");
        inventoryCost = part.costoNeto;
        if (order.estado === "EN_REPARACION" && (await workshopStock(tx, orgId, part.id)).lt(d.cantidad)) throw new UserError("No hay existencias suficientes; registra primero una compra");
      }
      const item = await tx.workshopOrderItem.create({ data: {
        organizationId: orgId, workOrderId: orderId, requestKey: d.requestKey, tipo: d.tipo, partId: d.tipo === "REFACCION" ? d.partId : null,
        concepto: d.concepto, detalle: d.detalle || null, cantidad: d.cantidad, unidad: d.unidad,
        precioUnitarioNeto: d.precioUnitarioNeto, costoUnitarioNeto: d.costoUnitarioNeto || null,
        importeNeto: line.importeNeto, ivaImporte: line.ivaImporte, importeConIva: line.importeConIva,
        autorizadaEn: new Date(), autorizadaVia: d.autorizadaVia,
      }, select: { id: true } });
      if (d.tipo === "REFACCION" && d.partId && order.estado === "EN_REPARACION") {
        await tx.workshopInventoryMovement.create({ data: { organizationId: orgId, partId: d.partId, workOrderId: orderId, tipo: "SALIDA_ORDEN", cantidad: d.cantidad, costoUnitarioNeto: d.costoUnitarioNeto || inventoryCost! } });
      }
      await tx.workshopWorkOrder.update({ where: { id: orderId }, data: { saldo: { increment: line.importeConIva } } });
      return { id: item.id, created: true };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await checkExisting();
      if (duplicate) return duplicate;
    }
    throw error;
  }
  await logAudit({ organizationId: orgId, userId, action: "workshop.order.line.authorized", resource: "WorkshopOrderItem", resourceId: result.id, metadata: { orderId, via: d.autorizadaVia } });
  revalidatePath("/portal/workshop");
  return result;
}

const paymentInput = z.object({ requestKey: z.string().uuid(), monto: z.string(), metodo: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA"]) });

export async function recordWorkshopOrderPayment(orderId: string, input: z.input<typeof paymentInput>) {
  const { orgId, userId } = await requireWorkshopOwner();
  const parsed = paymentInput.safeParse(input);
  if (!parsed.success) throw new UserError("Revisa el pago");
  const d = parsed.data;
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(d.monto);
    if (amount.lte(0) || amount.decimalPlaces() > 2) throw new Error();
  } catch { throw new UserError("Monto de pago inválido"); }
  const existing = await prisma.workshopCashMovement.findUnique({ where: { organizationId_requestKey: { organizationId: orgId, requestKey: d.requestKey } }, select: { id: true } });
  if (existing) return existing;
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "WorkshopWorkOrder" WHERE id = ${orderId} AND "organizationId" = ${orgId} FOR UPDATE`;
      const order = await tx.workshopWorkOrder.findFirst({ where: { id: orderId, organizationId: orgId }, select: { id: true, estado: true, saldo: true, creditoAutorizadoEn: true } });
      if (!order || order.estado === "CANCELADA" || (order.estado === "ENTREGADA" && !order.creditoAutorizadoEn)) throw new UserError("Orden no disponible para cobro");
      if (amount.gt(order.saldo)) throw new UserError("El pago supera el saldo pendiente");
      const cash = await tx.workshopCashMovement.create({ data: { organizationId: orgId, requestKey: d.requestKey, tipo: "INGRESO", concepto: "Pago de orden", monto: amount, metodo: d.metodo, workOrderId: orderId, registradoPorId: userId }, select: { id: true } });
      await tx.workshopWorkOrder.update({ where: { id: orderId }, data: { anticipo: { increment: amount }, saldo: { decrement: amount } } });
      return cash;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.workshopCashMovement.findUnique({ where: { organizationId_requestKey: { organizationId: orgId, requestKey: d.requestKey } }, select: { id: true } });
      if (duplicate) return duplicate;
    }
    throw error;
  }
  await logAudit({ organizationId: orgId, userId, action: "workshop.order.payment", resource: "WorkshopCashMovement", resourceId: result.id, metadata: { orderId, monto: amount.toFixed(2) } });
  revalidatePath("/portal/workshop");
  return result;
}

export async function authorizeWorkshopCredit(orderId: string, note: string) {
  const { orgId, userId } = await requireWorkshopOwner();
  const parsed = z.string().trim().min(10).max(1000).safeParse(note);
  if (!parsed.success) throw new UserError("Registra el motivo y condiciones del crédito");
  const result = await prisma.workshopWorkOrder.updateMany({ where: { id: orderId, organizationId: orgId, estado: "LISTA_PARA_ENTREGA", saldo: { gt: 0 } }, data: { creditoAutorizadoEn: new Date(), creditoAutorizadoNota: parsed.data } });
  if (!result.count) throw new UserError("No hay saldo pendiente en una orden lista para entrega");
  await logAudit({ organizationId: orgId, userId, action: "workshop.order.credit", resource: "WorkshopWorkOrder", resourceId: orderId });
  revalidatePath("/portal/workshop");
}

/** Solo registra la solicitud: el CFDI se emite fuera de Reymen en este MVP. */
export async function setWorkshopInvoiceRequested(orderId: string, requested: boolean) {
  const { orgId, userId } = await requireWorkshopOwner();
  if (typeof requested !== "boolean") throw new UserError("Indica si el cliente solicitó factura");
  const updated = await prisma.workshopWorkOrder.updateMany({
    where: { id: orderId, organizationId: orgId, estado: { notIn: ["ENTREGADA", "CANCELADA"] } },
    data: { facturaSolicitada: requested },
  });
  if (!updated.count) throw new UserError("Orden no disponible para registrar factura");
  await logAudit({ organizationId: orgId, userId, action: "workshop.order.invoice.request", resource: "WorkshopWorkOrder", resourceId: orderId, metadata: { requested } });
  revalidatePath("/portal/workshop");
}

const settingsInput = z.object({
  vigenciaDias: z.coerce.number().int().min(1).max(365),
  garantiaDias: z.coerce.number().int().min(0).max(3650),
  garantiaKm: z.coerce.number().int().min(0).max(100_000),
});

export async function saveWorkshopSettings(input: z.input<typeof settingsInput>) {
  const { orgId, userId } = await requireWorkshopOwner();
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success) throw new UserError("Revisa la vigencia y garantía del taller");
  await prisma.workshopSettings.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...parsed.data },
    update: parsed.data,
  });
  await logAudit({ organizationId: orgId, userId, action: "workshop.settings.update", resource: "WorkshopSettings", metadata: parsed.data });
  revalidatePath("/portal/workshop");
}

export async function setWorkshopNextService(vehicleId: string, rawKm: number | null, rawDate: string | null) {
  const { orgId, userId } = await requireWorkshopOwner();
  const parsedKm = rawKm === null ? { success: true as const, data: null } : z.number().int().min(0).max(10_000_000).safeParse(rawKm);
  if (!parsedKm.success) throw new UserError("Kilometraje de próximo servicio inválido");
  const km = parsedKm.data;
  const date = rawDate === null || rawDate === "" ? null : /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T00:00:00.000Z`) : null;
  if (rawDate && (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== rawDate)) throw new UserError("Fecha de próximo servicio inválida");
  const updated = await prisma.workshopVehicle.updateMany({ where: { id: vehicleId, organizationId: orgId }, data: { proximoServicioKm: km, proximoServicioFecha: date } });
  if (!updated.count) throw new UserError("Vehículo no encontrado en tu organización");
  await logAudit({ organizationId: orgId, userId, action: "workshop.vehicle.next_service", resource: "WorkshopVehicle", resourceId: vehicleId });
  revalidatePath("/portal/workshop");
}

export async function deliverWorkshopOrder(orderId: string, kilometrajeEntrega: number, refaccionesEntregadas: boolean) {
  const { orgId, userId } = await requireWorkshopOperator();
  if (!Number.isInteger(kilometrajeEntrega) || kilometrajeEntrega < 0) throw new UserError("Kilometraje de entrega inválido");
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "WorkshopWorkOrder" WHERE id = ${orderId} AND "organizationId" = ${orgId} FOR UPDATE`;
    const order = await tx.workshopWorkOrder.findFirst({ where: { id: orderId, organizationId: orgId }, select: { id: true, estado: true, saldo: true, creditoAutorizadoEn: true, creditoAutorizadoNota: true, vehicleId: true, kilometrajeIngreso: true } });
    if (!order || order.estado !== "LISTA_PARA_ENTREGA") throw new UserError("La orden no está lista para entregar");
    if (kilometrajeEntrega < order.kilometrajeIngreso) throw new UserError("El kilometraje de entrega no puede ser menor al de ingreso");
    if (order.saldo.gt(0) && (!order.creditoAutorizadoEn || !order.creditoAutorizadoNota)) throw new UserError("Cobra el saldo o registra crédito explícito antes de entregar");
    const photos = await tx.workshopPhoto.count({ where: { organizationId: orgId, workOrderId: orderId, phase: "ENTREGA" } });
    if (!photos) throw new UserError("Sube al menos una foto de entrega");
    await tx.workshopWorkOrder.update({ where: { id: orderId }, data: { estado: "ENTREGADA", entregadaEn: new Date(), kilometrajeEntrega, refaccionesEntregadas } });
    await tx.workshopVehicle.update({ where: { id: order.vehicleId }, data: { kilometrajeActual: kilometrajeEntrega } });
  });
  await logAudit({ organizationId: orgId, userId, action: "workshop.order.deliver", resource: "WorkshopWorkOrder", resourceId: orderId, metadata: { kilometrajeEntrega, refaccionesEntregadas } });
  revalidatePath("/portal/workshop");
  return result;
}
