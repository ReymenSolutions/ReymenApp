import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ClientQuote = {
  folio: string;
  servicioTitulo: string;
  tiempoEstimado: string | null;
  vigenciaDias: number;
  garantiaDias: number;
  garantiaKm: number;
  subtotalNeto: { toFixed(n: number): string };
  iva: { toFixed(n: number): string };
  total: { toFixed(n: number): string };
  notas: string | null;
  customer: { name: string | null; phone: string };
  vehicle: { placas: string | null; vin: string | null; marca: string | null; modelo: string | null; anio: number | null; kilometrajeActual: number | null };
  items: { concepto: string; detalle: string | null; cantidad: { toString(): string }; unidad: string; precioUnitarioNeto: { toFixed(n: number): string }; importeNeto: { toFixed(n: number): string }; ivaImporte: { toFixed(n: number): string }; importeConIva: { toFixed(n: number): string } }[];
};

const mxn = (value: { toFixed(n: number): string }) => `$${value.toFixed(2)} MXN`;

/** Recibe exclusivamente campos visibles al cliente; los costos no forman parte de su contrato de entrada. */
async function buildWorkshopDocumentPdf(orgName: string, quote: ClientQuote, title: string, extra: string[] = []): Promise<Uint8Array> {
  if (!quote.folio || !quote.customer.name?.trim() || !quote.customer.phone.trim() || !quote.vehicle.placas?.trim() || !quote.vehicle.vin?.trim() || quote.vehicle.kilometrajeActual === null) {
    throw new Error("Missing mandatory quote identity");
  }
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.16, 0.29);
  const muted = rgb(0.37, 0.44, 0.52);
  const blue = rgb(0.02, 0.15, 0.35);
  let page = doc.addPage([595, 842]);
  let y = 790;
  const left = 42;
  const right = 553;
  const clean = (value: string) => Array.from(value.replace(/[\x00-\x1f\x7f]/g, " ")).map((character) => {
    try { regular.encodeText(character); return character; } catch { return "?"; }
  }).join("").trim();

  function line(text: string, size = 10, strong = false, color = ink) {
    if (y < 65) { page = doc.addPage([595, 842]); y = 790; }
    const safe = clean(text);
    page.drawText(safe, { x: left, y, size, font: strong ? bold : regular, color, maxWidth: right - left });
    y -= size + 8;
  }
  function separator() {
    y -= 5;
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: rgb(0.82, 0.86, 0.9) });
    y -= 16;
  }

  page.drawRectangle({ x: 0, y: 734, width: 595, height: 108, color: blue });
  page.drawText(clean(orgName), { x: left, y: 800, size: 19, font: bold, color: rgb(1, 1, 1), maxWidth: 500 });
  page.drawText(title, { x: left, y: 770, size: 11, font: regular, color: rgb(0.82, 0.92, 1) });
  page.drawText(clean(quote.folio), { x: 390, y: 770, size: 12, font: bold, color: rgb(1, 1, 1), maxWidth: 160 });
  y = 712;
  line(`Cliente / Customer: ${quote.customer.name}`, 11, true);
  line(`Telefono / Phone: ${quote.customer.phone}`);
  line(`Vehiculo / Vehicle: ${[quote.vehicle.marca, quote.vehicle.modelo, quote.vehicle.anio].filter(Boolean).join(" ")}`);
  line(`Placas / Plates: ${quote.vehicle.placas}     VIN: ${quote.vehicle.vin}`);
  line(`Kilometraje / Mileage: ${quote.vehicle.kilometrajeActual} km`);
  line(`Servicio / Service: ${quote.servicioTitulo}`, 11, true);
  if (quote.tiempoEstimado) line(`Tiempo estimado / Estimated time: ${quote.tiempoEstimado}`);
  separator();
  line("Concepto / Item                                    Cant.       Neto       IVA       Total", 9, true, muted);
  separator();
  for (const item of quote.items) {
    line(`${item.concepto} (${item.cantidad.toString()} ${item.unidad})`, 10, true);
    if (item.detalle) line(item.detalle, 9, false, muted);
    line(`Neto unit. ${mxn(item.precioUnitarioNeto)}   |   Neto ${mxn(item.importeNeto)}   |   IVA ${mxn(item.ivaImporte)}   |   Total ${mxn(item.importeConIva)}`, 8);
    y -= 3;
  }
  separator();
  line(`Subtotal neto / Net subtotal: ${mxn(quote.subtotalNeto)}`, 11);
  line(`IVA 16%: ${mxn(quote.iva)}`, 11);
  line(`TOTAL CON IVA / TOTAL INCLUDING TAX: ${mxn(quote.total)}`, 14, true, blue);
  separator();
  line(`Vigencia / Validity: ${quote.vigenciaDias} dias naturales / calendar days`, 9);
  line(`Garantia en mano de obra / Labor warranty: ${quote.garantiaDias} dias o ${quote.garantiaKm} km, lo primero que ocurra.`, 9);
  line("Trabajo adicional sujeto a autorizacion previa del cliente / Additional work requires prior authorization.", 9);
  for (const detail of extra) line(detail, 9);
  if (quote.notas) line(`Notas / Notes: ${quote.notas}`, 9);
  y -= 22;
  line("Firma del cliente / Customer signature: __________________________    Fecha / Date: __________", 9);
  return doc.save();
}

/** El contrato de entrada omite costos y utilidad por diseño. */
export function buildWorkshopQuotePdf(orgName: string, quote: ClientQuote): Promise<Uint8Array> {
  return buildWorkshopDocumentPdf(orgName, quote, "COTIZACION / QUOTE");
}

export function buildWorkshopOrderPdf(orgName: string, order: ClientQuote, details: { status: string; deliveredAt: Date | null; invoiceRequested: boolean }): Promise<Uint8Array> {
  const extra = [
    `Estado / Status: ${details.status}`,
    ...(details.deliveredAt ? [`Entrega / Delivery: ${details.deliveredAt.toISOString().slice(0, 10)}`] : []),
    `Factura solicitada / Invoice requested: ${details.invoiceRequested ? "Si / Yes" : "No"}`,
  ];
  return buildWorkshopDocumentPdf(orgName, order, "ORDEN DE SERVICIO / WORK ORDER", extra);
}
