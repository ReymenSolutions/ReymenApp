/** Nombre de archivo seguro y legible para compartir la cotización del cliente. */
export function workshopQuoteFilename(quote: { servicioTitulo: string; vehicle: { marca: string | null; modelo: string | null; anio: number | null } }) {
  const slug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 55).replace(/-+$/g, "");
  const parts = ["cotizacion", quote.servicioTitulo, quote.vehicle.marca, quote.vehicle.modelo, quote.vehicle.anio, "tallerwolf"];
  return `${parts.map((part) => slug(String(part ?? ""))).filter(Boolean).join("-")}.pdf`;
}
