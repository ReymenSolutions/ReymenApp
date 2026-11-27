import { auth } from "@/lib/auth";
import { hasModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { buildWorkshopQuotePdf } from "@/lib/workshop/pdf";
import { buildWolfQuotePdf } from "@/lib/workshop/wolf-quote-pdf";
import { workshopQuoteFilename } from "@/lib/workshop/quote-filename";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!orgId) return new Response(null, { status: 401 });
  if (!["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "AGENT"].includes(session.user.role) || !(await hasModule(orgId, "WORKSHOP"))) return new Response(null, { status: 403 });
  const { id } = await params;
  const quote = await prisma.workshopQuote.findFirst({
    where: { id, organizationId: orgId, folio: { not: null } },
    select: {
      folio: true, servicioTitulo: true, tiempoEstimado: true, vigenciaDias: true, garantiaDias: true, garantiaKm: true,
      subtotalNeto: true, iva: true, total: true, incluyeIva: true, notas: true,
      customer: { select: { name: true, phone: true } },
      vehicle: { select: { placas: true, vin: true, marca: true, modelo: true, anio: true, kilometrajeActual: true } },
      items: { select: { concepto: true, detalle: true, cantidad: true, unidad: true, precioUnitarioNeto: true, importeNeto: true, ivaImporte: true, importeConIva: true } },
    },
  });
  if (!quote || !quote.folio) return new Response(null, { status: 404 });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
  const isWolf = process.env.WORKSHOP_WOLF_ORG_ID === orgId;
  const bytes = isWolf ? await buildWolfQuotePdf({ ...quote, folio: quote.folio }) : await buildWorkshopQuotePdf(org.name, { ...quote, folio: quote.folio });
  const filename = isWolf ? workshopQuoteFilename(quote) : `${quote.folio}.pdf`;
  const disposition = new URL(request.url).searchParams.get("print") === "1" ? "inline" : "attachment";
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
