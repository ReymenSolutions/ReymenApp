import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { hasModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { buildWorkshopOrderPdf } from "@/lib/workshop/pdf";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!orgId) return new Response(null, { status: 401 });
  if (!["OWNER", "ADMIN", "SUPER_ADMIN"].includes(session.user.role) || !(await hasModule(orgId, "WORKSHOP"))) return new Response(null, { status: 403 });
  const { id } = await params;
  const order = await prisma.workshopWorkOrder.findFirst({
    where: { id, organizationId: orgId },
    select: {
      folio: true, estado: true, kilometrajeIngreso: true, garantiaDias: true, garantiaKm: true, facturaSolicitada: true, entregadaEn: true,
      quote: { select: { servicioTitulo: true, tiempoEstimado: true, vigenciaDias: true, incluyeIva: true, notas: true } },
      customer: { select: { name: true, phone: true } },
      vehicle: { select: { placas: true, vin: true, marca: true, modelo: true, anio: true } },
      items: { select: { concepto: true, detalle: true, cantidad: true, unidad: true, precioUnitarioNeto: true, importeNeto: true, ivaImporte: true, importeConIva: true } },
    },
  });
  if (!order) return new Response(null, { status: 404 });
  if (!order.customer.name?.trim() || !order.customer.phone.trim() || !order.vehicle.placas?.trim() || !order.vehicle.vin?.trim()) return new Response(null, { status: 409 });
  const subtotalNeto = order.items.reduce((sum, item) => sum.plus(item.importeNeto), new Prisma.Decimal(0));
  const iva = order.items.reduce((sum, item) => sum.plus(item.ivaImporte), new Prisma.Decimal(0));
  const total = subtotalNeto.plus(iva);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
  const bytes = await buildWorkshopOrderPdf(org.name, {
    folio: order.folio, incluyeIva: order.quote.incluyeIva, servicioTitulo: order.quote.servicioTitulo, tiempoEstimado: order.quote.tiempoEstimado,
    vigenciaDias: order.quote.vigenciaDias, garantiaDias: order.garantiaDias, garantiaKm: order.garantiaKm,
    subtotalNeto, iva, total, notas: order.quote.notas, customer: order.customer,
    vehicle: { ...order.vehicle, kilometrajeActual: order.kilometrajeIngreso }, items: order.items,
  }, { status: order.estado, deliveredAt: order.entregadaEn, invoiceRequested: order.facturaSolicitada });
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${order.folio}.pdf"`, "Cache-Control": "private, no-store" } });
}
