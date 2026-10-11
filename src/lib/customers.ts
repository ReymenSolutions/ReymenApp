import { Prisma } from "@prisma/client";
import { phoneKey } from "./phone";

type Tx = Prisma.TransactionClient;

/** Teléfono mexicano a formato E.164 (+52…). Acepta con o sin lada, con "1" móvil antiguo, espacios o guiones. Null si no alcanza para identificar. */
export function normalizePhoneMx(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+52${digits}`;
  if (digits.length === 12 && digits.startsWith("52")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("521")) return `+52${digits.slice(3)}`;
  // Otro país (ya con código): se respeta tal cual, entre 11 y 15 dígitos.
  if (raw.trim().startsWith("+") && digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

export interface PosCustomerInput {
  phone: string;
  name?: string;
  consent?: { accepted: boolean; textVersion?: string; at?: string };
}

/** Lee el cliente del payload del POS. Un cliente mal formado se ignora: nunca debe tirar la venta. */
export function parsePosCustomer(raw: unknown): (PosCustomerInput & { phone: string }) | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const phone = normalizePhoneMx(c.phone);
  if (!phone) return null;
  const name = typeof c.name === "string" ? c.name.trim().slice(0, 120) || undefined : undefined;
  let consent: PosCustomerInput["consent"];
  if (c.consent && typeof c.consent === "object") {
    const k = c.consent as Record<string, unknown>;
    if (typeof k.accepted === "boolean") {
      consent = {
        accepted: k.accepted,
        textVersion: typeof k.textVersion === "string" ? k.textVersion.slice(0, 60) : undefined,
        at: typeof k.at === "string" ? k.at : undefined,
      };
    }
  }
  return { phone, name, consent };
}

/**
 * Busca o crea al cliente por su teléfono y lo enlaza con el contacto del CRM que
 * tenga el mismo número (si existe; no crea contactos). El consentimiento solo se
 * actualiza cuando el POS lo manda, y quien ya aceptó no se "desacepta" por omisión.
 */
export async function upsertCustomer(tx: Tx, organizationId: string, input: PosCustomerInput & { phone: string }) {
  const key = phoneKey(input.phone)!;
  const lead = await tx.lead.findFirst({ where: { organizationId, phoneKey: key, deletedAt: null }, select: { id: true }, orderBy: { createdAt: "asc" } });
  const consentAt = input.consent?.at ? new Date(input.consent.at) : new Date();
  const consent = input.consent
    ? { consentAccepted: input.consent.accepted, consentTextVersion: input.consent.textVersion ?? null, consentAt: Number.isNaN(consentAt.getTime()) ? new Date() : consentAt }
    : {};
  const existed = !!(await tx.customer.findUnique({ where: { organizationId_phoneKey: { organizationId, phoneKey: key } }, select: { id: true } }));
  const customer = await tx.customer.upsert({
    where: { organizationId_phoneKey: { organizationId, phoneKey: key } },
    create: { organizationId, phone: input.phone, phoneKey: key, name: input.name ?? null, leadId: lead?.id ?? null, ...consent },
    update: { ...(input.name ? { name: input.name } : {}), ...(lead ? { leadId: lead.id } : {}), ...consent },
  });
  return { ...customer, created: !existed };
}

/** Suma (o resta, en una cancelación) una venta a las estadísticas del cliente. */
export async function applySaleToCustomer(tx: Tx, customerId: string, sale: { grossAmount: number; occurredAt: Date }) {
  const cancel = sale.grossAmount < 0;
  const c = await tx.customer.update({
    where: { id: customerId },
    data: {
      visitCount: { increment: cancel ? -1 : 1 },
      totalSpent: { increment: sale.grossAmount },
      ...(cancel ? {} : { lastVisitAt: sale.occurredAt }),
    },
  });
  // Nunca negativos (una cancelación de una venta que el cliente no tenía registrada).
  const fix: Prisma.CustomerUpdateInput = {};
  if (c.visitCount < 0) fix.visitCount = 0;
  if (Number(c.totalSpent) < 0) fix.totalSpent = 0;
  if (!cancel && (!c.firstVisitAt || sale.occurredAt < c.firstVisitAt)) fix.firstVisitAt = sale.occurredAt;
  if (Object.keys(fix).length) await tx.customer.update({ where: { id: customerId }, data: fix });
}

/** Recalcula las estadísticas de estos clientes desde sus ventas (por ejemplo después de borrar ventas de prueba). */
export async function rebuildCustomerStats(tx: Tx, organizationId: string, customerIds: string[]) {
  for (const id of new Set(customerIds)) {
    const sales = await tx.foodSale.findMany({ where: { organizationId, customerId: id }, select: { grossAmount: true, occurredAt: true } });
    const visits = sales.filter((s) => Number(s.grossAmount) > 0);
    const cancels = sales.filter((s) => Number(s.grossAmount) < 0).length;
    const dates = visits.map((s) => s.occurredAt.getTime());
    await tx.customer.update({
      where: { id },
      data: {
        visitCount: Math.max(0, visits.length - cancels),
        totalSpent: Math.max(0, Math.round(sales.reduce((n, s) => n + Number(s.grossAmount), 0) * 100) / 100),
        firstVisitAt: dates.length ? new Date(Math.min(...dates)) : null,
        lastVisitAt: dates.length ? new Date(Math.max(...dates)) : null,
      },
    });
  }
}
