// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { Prisma } from "@prisma/client";
import { buildWolfQuotePdf } from "./wolf-quote-pdf";
import { buildWorkshopQuotePdf } from "./pdf";

async function pageText(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().flatMap((page) => {
    const content = pdf.context.lookup(page.node.Contents());
    const streams = content instanceof PDFArray ? content.asArray() : [page.node.Contents()];
    return streams.flatMap((ref) => {
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) return [];
      const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString();
      return [...operators.matchAll(/<([0-9A-F]+)> Tj/g)].map((match) => Buffer.from(match[1], "hex").toString("latin1"));
    });
  }).join(" ");
}

describe("Taller Wolf customer quote PDF", () => {
  it("uses the official logo and keeps long descriptions and notes across pages", async () => {
    const amount = (value: string) => new Prisma.Decimal(value);
    const bytes = await buildWolfQuotePdf({
      folio: "TW-2026-0001", servicioTitulo: "Afinación mayor", tiempoEstimado: "3 a 4 horas", vigenciaDias: 15, garantiaDias: 90, garantiaKm: 5000,
      subtotalNeto: amount("3793.10"), iva: amount("606.90"), total: amount("4400.00"), notas: "Revisar el vehículo antes de iniciar. ".repeat(40),
      customer: { name: "Cliente de prueba", phone: "8711079931" },
      vehicle: { placas: "TEST123", vin: "1HGCM82633A004352", marca: "Audi", modelo: "A1", anio: 2021, kilometrajeActual: 50000 },
      items: Array.from({ length: 12 }, (_, index) => ({ concepto: `Servicio ${index + 1}`, detalle: "Detalle del trabajo realizado. ".repeat(10), cantidad: amount("1"), unidad: "pza", precioUnitarioNeto: amount("100.00"), importeNeto: amount("100.00"), ivaImporte: amount("16.00"), importeConIva: amount("116.00") })),
    });
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toBe("cotizacion-afinacion-mayor-audi-a1-2021-tallerwolf");
  });
  it("labels untaxed quotes clearly without an IVA line in both PDF templates", async () => {
    const amount = (value: string) => new Prisma.Decimal(value);
    const quote = {
      folio: "TW-2026-0002", incluyeIva: false, servicioTitulo: "Revisión general", tiempoEstimado: null, vigenciaDias: 15, garantiaDias: 90, garantiaKm: 5000,
      subtotalNeto: amount("3793.10"), iva: amount("0"), total: amount("3793.10"), notas: null,
      customer: { name: "Cliente de prueba", phone: "8711079931" },
      vehicle: { placas: "TEST123", vin: "1HGCM82633A004352", marca: "Audi", modelo: "A1", anio: 2021, kilometrajeActual: 50000 },
      items: [{ concepto: "Revisión", detalle: null, cantidad: amount("1"), unidad: "serv.", precioUnitarioNeto: amount("3793.10"), importeNeto: amount("3793.10"), ivaImporte: amount("0"), importeConIva: amount("3793.10") }],
    };
    for (const pdf of [await buildWolfQuotePdf(quote), await buildWorkshopQuotePdf("Otro taller", quote)]) {
      const text = await pageText(pdf);
      expect(text).toContain("TOTAL SIN IVA");
      expect(text).not.toContain("IVA (16%)");
      expect(text).not.toContain("IVA 16%:");
    }
  });
});
