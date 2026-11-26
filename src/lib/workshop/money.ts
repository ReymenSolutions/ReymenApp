import { Prisma } from "@prisma/client";

const D = Prisma.Decimal;
const IVA = new D("0.16");
const CENT = 2;

export type NetLineInput = {
  cantidad: string;
  precioUnitarioNeto: string;
  costoUnitarioNeto?: string | null;
};

export type CalculatedLine = {
  importeNeto: Prisma.Decimal;
  ivaImporte: Prisma.Decimal;
  importeConIva: Prisma.Decimal;
  costoTotalNeto: Prisma.Decimal | null;
};

function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(CENT, D.ROUND_HALF_UP);
}

/** El precio de entrada siempre es neto; distribuye el centavo residual del IVA en la última línea. */
export function calculateNetLines(inputs: NetLineInput[]) {
  if (!inputs.length) throw new Error("La cotización necesita al menos una línea");
  const base = inputs.map(({ cantidad, precioUnitarioNeto, costoUnitarioNeto }) => {
    const qty = new D(cantidad);
    const price = new D(precioUnitarioNeto);
    const cost = costoUnitarioNeto == null ? null : new D(costoUnitarioNeto);
    if (qty.lte(0) || price.lt(0) || (cost && cost.lt(0))) throw new Error("Cantidad, costo o precio inválidos");
    if (!price.eq(money(price)) || (cost && !cost.eq(money(cost)))) throw new Error("Los precios requieren como máximo dos decimales");
    return { importeNeto: money(qty.mul(price)), costoTotalNeto: cost ? money(qty.mul(cost)) : null };
  });
  const subtotalNeto = base.reduce((sum, line) => sum.plus(line.importeNeto), new D(0));
  const iva = money(subtotalNeto.mul(IVA));
  const adjustmentIndex = base.findLastIndex((line) => line.importeNeto.gt(0));
  let allocated = new D(0);
  const lines: CalculatedLine[] = base.map((line, index) => {
    const ivaImporte = index === adjustmentIndex ? iva.minus(allocated) : money(line.importeNeto.mul(IVA));
    allocated = allocated.plus(ivaImporte);
    return { ...line, ivaImporte, importeConIva: line.importeNeto.plus(ivaImporte) };
  });
  const costoTotalNeto = base.every((line) => line.costoTotalNeto !== null)
    ? base.reduce((sum, line) => sum.plus(line.costoTotalNeto!), new D(0))
    : null;
  return { lines, subtotalNeto, iva, total: subtotalNeto.plus(iva), costoTotalNeto, utilidadNeta: costoTotalNeto === null ? null : subtotalNeto.minus(costoTotalNeto) };
}

/** Solo para validar el documento de referencia: convierte importes brutos de línea a neto. */
export function netFromGrossReference(grossAmounts: string[]) {
  if (!grossAmounts.length) throw new Error("Se necesita una línea");
  const gross = grossAmounts.map((amount) => new D(amount));
  if (gross.some((amount) => amount.lt(0))) throw new Error("Importe inválido");
  const grossTotal = gross.reduce((sum, amount) => sum.plus(amount), new D(0));
  const netTotal = money(grossTotal.div(new D("1.16")));
  const adjustmentIndex = gross.findLastIndex((amount) => amount.gt(0));
  let allocated = new D(0);
  const lines = gross.map((amount, index) => {
    const net = index === adjustmentIndex ? netTotal.minus(allocated) : money(amount.div(new D("1.16")));
    allocated = allocated.plus(net);
    return { gross: amount, net, iva: amount.minus(net) };
  });
  return { lines, subtotalNeto: netTotal, iva: grossTotal.minus(netTotal), total: grossTotal };
}
