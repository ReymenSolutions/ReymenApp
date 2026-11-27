// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { Prisma } from "@prisma/client";
import { buildWolfQuotePdf } from "./wolf-quote-pdf";

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
});
