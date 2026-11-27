import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import sharp from "sharp";
import type { ClientQuote } from "./pdf";
import { workshopQuoteFilename } from "./quote-filename";

const WIDTH = 595;
const HEIGHT = 842;
const RED = rgb(0.78, 0.12, 0.15);
const BLACK = rgb(0.09, 0.1, 0.12);
const GRAY = rgb(0.38, 0.4, 0.43);
const LINE = rgb(0.84, 0.85, 0.86);
const PALE = rgb(0.96, 0.96, 0.96);

/** Versión para el cliente: usa solo precios de venta y el logo limpio entregado por Taller Wolf. */
export async function buildWolfQuotePdf(quote: ClientQuote): Promise<Uint8Array> {
  if (!quote.folio || !quote.customer.name?.trim() || !quote.customer.phone.trim() || !quote.vehicle.placas?.trim() || !quote.vehicle.vin?.trim() || quote.vehicle.kilometrajeActual === null) {
    throw new Error("Missing mandatory quote identity");
  }
  const doc = await PDFDocument.create();
  doc.setTitle(workshopQuoteFilename(quote).replace(/\.pdf$/, ""));
  doc.setAuthor("Taller Wolf");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await readFile(join(process.cwd(), "public", "taller-wolf-logo-limpio.png"));
  const logo = await doc.embedPng(logoBytes);

  // El lobo del archivo oficial se aísla en memoria para usarlo como marca de agua.
  // El negro se vuelve transparente; no se guarda ni sustituye el logo maestro.
  const { data, info } = await sharp(logoBytes).extract({ left: 95, top: 25, width: 610, height: 520 }).resize({ width: 360 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
    const light = (data[i] + data[i + 1] + data[i + 2]) / 3;
    pixels[j] = 80; pixels[j + 1] = 80; pixels[j + 2] = 80;
    pixels[j + 3] = Math.round(Math.max(0, (light - 65) / 190) * 30);
  }
  const watermarkBytes = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const watermark = await doc.embedPng(watermarkBytes);

  const safe = (value: unknown) => Array.from(String(value ?? "").replace(/[\x00-\x1f\x7f]/g, " ")).map((character) => {
    try { regular.encodeText(character); return character; } catch { return "?"; }
  }).join("").trim();
  function fit(text: unknown, font: PDFFont, size: number, maxWidth: number) {
    let value = safe(text);
    while (value && font.widthOfTextAtSize(value, size) > maxWidth) value = value.slice(0, -1);
    return value;
  }
  function draw(page: PDFPage, text: unknown, x: number, y: number, size = 9, font = regular, color = BLACK, maxWidth = WIDTH - x - 42) {
    page.drawText(fit(text, font, size, maxWidth), { x, y, size, font, color });
  }
  function wrap(text: unknown, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = safe(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { current = candidate; continue; }
      if (current) lines.push(current);
      current = word;
      while (current && font.widthOfTextAtSize(current, size) > maxWidth) {
        const piece = fit(current, font, size, maxWidth);
        lines.push(piece);
        current = current.slice(piece.length);
      }
    }
    if (current) lines.push(current);
    return lines;
  }
  function header(page: PDFPage, continuation = false) {
    page.drawImage(logo, { x: 42, y: 744, width: 76, height: 78 });
    draw(page, "TALLER WOLF", 130, 791, 18, bold, BLACK, 260);
    draw(page, "MECÁNICA QUE TE RESPALDA", 130, 773, 7.5, bold, RED, 265);
    draw(page, "Servicio automotriz · Monterrey, N.L.", 130, 758, 8, regular, GRAY, 270);
    draw(page, continuation ? "COTIZACIÓN · CONTINUACIÓN" : "COTIZACIÓN", 410, 795, 9, bold, RED, 143);
    draw(page, quote.folio, 410, 776, 13, bold, BLACK, 143);
    page.drawLine({ start: { x: 42, y: 733 }, end: { x: 553, y: 733 }, thickness: 2, color: RED });
  }
  function footer(page: PDFPage) {
    page.drawLine({ start: { x: 42, y: 45 }, end: { x: 553, y: 45 }, thickness: 0.6, color: LINE });
    draw(page, "Taller Wolf · Burocratas 515, Col. Burócratas del Estado, Monterrey, N.L. · WhatsApp 8711079931", 42, 31, 7, regular, GRAY, 511);
  }
  let page = doc.addPage([WIDTH, HEIGHT]);
  header(page);
  footer(page);
  // Solo la cabeza del logo oficial, en gris tenue, debajo del desglose.
  page.drawImage(watermark, { x: 176, y: 255, width: 245, height: 209 });

  const cards = [
    { x: 42, w: 166, title: "VEHÍCULO", rows: [`${quote.vehicle.marca ?? ""} ${quote.vehicle.modelo ?? ""} ${quote.vehicle.anio ?? ""}`, `Placas: ${quote.vehicle.placas}`, `VIN: ${quote.vehicle.vin}`, `Km: ${quote.vehicle.kilometrajeActual}`] },
    { x: 214, w: 166, title: "CLIENTE", rows: [quote.customer.name, `Tel.: ${quote.customer.phone}`] },
    { x: 386, w: 167, title: "SERVICIO", rows: [quote.servicioTitulo, ...(quote.tiempoEstimado ? [`Tiempo: ${quote.tiempoEstimado}`] : []), `Vigencia: ${quote.vigenciaDias} días`] },
  ];
  for (const card of cards) {
    page.drawRectangle({ x: card.x, y: 642, width: card.w, height: 78, color: PALE });
    draw(page, card.title, card.x + 9, 704, 7.5, bold, RED, card.w - 18);
    card.rows.forEach((row, index) => draw(page, row, card.x + 9, 687 - index * 13, 8, index === 0 ? bold : regular, index === 0 ? BLACK : GRAY, card.w - 18));
  }
  draw(page, "DESGLOSE DE SERVICIOS Y REFACCIONES", 42, 623, 11, bold, BLACK);
  draw(page, quote.servicioTitulo, 42, 608, 8, regular, RED);

  let y = 580;
  function tableHeader() {
    page.drawRectangle({ x: 42, y: y - 6, width: 511, height: 23, color: BLACK });
    draw(page, "CONCEPTO", 50, y + 1, 7.5, bold, rgb(1, 1, 1), 280);
    draw(page, "CANT.", 370, y + 1, 7.5, bold, rgb(1, 1, 1), 44);
    draw(page, "P. NETO", 424, y + 1, 7.5, bold, rgb(1, 1, 1), 58);
    draw(page, "IMPORTE", 494, y + 1, 7.5, bold, rgb(1, 1, 1), 54);
    y -= 26;
  }
  tableHeader();
  for (const item of quote.items) {
    if (y < 220) { page = doc.addPage([WIDTH, HEIGHT]); header(page, true); footer(page); y = 696; tableHeader(); }
    const titleLines = wrap(item.concepto, bold, 8.5, 303);
    const detailLines = item.detalle ? wrap(item.detalle, regular, 7, 303) : [];
    titleLines.forEach((text, index) => draw(page, text, 50, y - index * 11, 8.5, bold, BLACK, 303));
    draw(page, `${item.cantidad.toString()} ${item.unidad}`, 370, y, 8, regular, BLACK, 48);
    draw(page, `$${item.precioUnitarioNeto.toFixed(2)}`, 424, y, 8, regular, BLACK, 62);
    draw(page, `$${item.importeNeto.toFixed(2)}`, 494, y, 8, bold, BLACK, 54);
    y -= Math.max(24, titleLines.length * 11 + 9);
    for (const text of detailLines) {
      if (y < 185) { page = doc.addPage([WIDTH, HEIGHT]); header(page, true); footer(page); y = 696; tableHeader(); }
      draw(page, text, 50, y, 7, regular, GRAY, 303);
      y -= 10;
    }
    y -= 5;
    page.drawLine({ start: { x: 42, y: y + 8 }, end: { x: 553, y: y + 8 }, thickness: 0.5, color: LINE });
  }
  if (y < 155) { page = doc.addPage([WIDTH, HEIGHT]); header(page, true); footer(page); y = 690; }
  draw(page, "Subtotal neto", 376, y - 3, 9, regular, BLACK, 106);
  draw(page, `$${quote.subtotalNeto.toFixed(2)}`, 494, y - 3, 9, bold, BLACK, 54);
  draw(page, "IVA (16%)", 376, y - 20, 9, regular, BLACK, 106);
  draw(page, `$${quote.iva.toFixed(2)}`, 494, y - 20, 9, bold, BLACK, 54);
  page.drawRectangle({ x: 342, y: y - 62, width: 211, height: 28, color: RED });
  draw(page, "TOTAL CON IVA", 350, y - 52, 9, bold, rgb(1, 1, 1), 112);
  draw(page, `$${quote.total.toFixed(2)}`, 476, y - 52, 10, bold, rgb(1, 1, 1), 68);
  y -= 83;
  if (y < 115) { page = doc.addPage([WIDTH, HEIGHT]); header(page, true); footer(page); y = 688; }
  draw(page, "CONDICIONES Y GARANTÍA", 42, y, 9, bold, RED);
  draw(page, `Vigencia: ${quote.vigenciaDias} días naturales. Garantía en mano de obra: ${quote.garantiaDias} días o ${quote.garantiaKm} km, lo primero que ocurra.`, 42, y - 17, 8, regular, BLACK, 511);
  draw(page, "Cualquier trabajo adicional requiere autorización previa del cliente.", 42, y - 32, 8, regular, BLACK, 511);
  let notesY = y - 48;
  for (const text of quote.notas ? wrap(`Notas: ${quote.notas}`, regular, 8, 511) : []) {
    if (notesY < 82) { page = doc.addPage([WIDTH, HEIGHT]); header(page, true); footer(page); notesY = 692; }
    draw(page, text, 42, notesY, 8, regular, GRAY, 511);
    notesY -= 11;
  }
  if (notesY < 85) { page = doc.addPage([WIDTH, HEIGHT]); header(page, true); footer(page); notesY = 692; }
  draw(page, "Firma de conformidad: _________________________     Fecha: ______________", 42, notesY - 20, 8, regular, GRAY, 511);
  return doc.save();
}
