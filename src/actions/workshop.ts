"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { logAudit } from "@/lib/audit";
import { calculateNetLines } from "@/lib/workshop/money";

const vehicleInput = z.object({
  customerId: z.string().min(1),
  placas: z.string().trim().min(2).max(20),
  vin: z.string().trim().min(11).max(17),
  marca: z.string().trim().min(1).max(80),
  modelo: z.string().trim().min(1).max(80),
  anio: z.coerce.number().int().min(1900).max(2100),
  kilometrajeActual: z.coerce.number().int().min(0).max(10_000_000),
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

  const plates = data.placas.toUpperCase().replace(/\s+/g, "");
  const vin = data.vin.toUpperCase().replace(/\s+/g, "");
  const existing = await prisma.workshopVehicle.findFirst({
    where: { organizationId: orgId, OR: [{ placas: plates }, { vin }] },
    select: { id: true },
  });
  if (existing) throw new UserError("Las placas o el VIN ya están registrados; reutiliza ese vehículo");

  const vehicle = await prisma.workshopVehicle.create({
    data: { organizationId: orgId, customerId: customer.id, placas: plates, vin, marca: data.marca, modelo: data.modelo, anio: data.anio, kilometrajeActual: data.kilometrajeActual },
    select: { id: true },
  });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "workshop.vehicle.create", resource: "WorkshopVehicle", resourceId: vehicle.id });
  revalidatePath("/portal/workshop");
  return { id: vehicle.id };
}

const quoteInput = z.object({
  vehicleId: z.string().min(1),
  servicioTitulo: z.string().trim().min(2).max(160),
  tiempoEstimado: z.string().trim().max(100).optional(),
  items: z.array(z.object({
    tipo: z.enum(["REFACCION", "MANO_DE_OBRA", "SERVICIO"]),
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
  let totals;
  try {
    totals = calculateNetLines(data.items.map((item) => ({ cantidad: item.cantidad, precioUnitarioNeto: item.precioUnitarioNeto, costoUnitarioNeto: item.costoUnitarioNeto || null })));
  } catch {
    throw new UserError("Revisa cantidades, costos y precios netos");
  }
  const settings = await prisma.workshopSettings.findUnique({ where: { organizationId: orgId } });
  const quote = await prisma.workshopQuote.create({
    data: {
      organizationId: orgId,
      customerId: vehicle.customerId,
      vehicleId: vehicle.id,
      servicioTitulo: data.servicioTitulo,
      tiempoEstimado: data.tiempoEstimado || null,
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
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "workshop.quote.create", resource: "WorkshopQuote", resourceId: quote.id });
  revalidatePath("/portal/workshop");
  return { id: quote.id };
}
