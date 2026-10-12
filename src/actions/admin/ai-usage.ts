"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { listProviders } from "@/lib/ai/providers";
import { getAiUsageCsv, parseAiFilters } from "@/lib/ai/report";

// Tarifas de modelos y exportación del ledger de IA (solo admin: son costos mayoristas de Reymen).

const price = z.coerce.number().min(0).max(100_000);
const optionalPrice = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), price.optional());

const rateSchema = z.object({
  provider: z.string().refine((p) => listProviders().some((x) => x.name === p), "Proveedor no válido"),
  model: z.string().trim().min(1).max(120),
  currency: z.enum(["USD", "MXN"]),
  inputPerMTok: price,
  outputPerMTok: price,
  cacheReadPerMTok: optionalPrice,
  cacheWritePerMTok: optionalPrice,
  reasoningPerMTok: optionalPrice,
  effectiveFrom: z.coerce.date(),
  source: z.string().trim().min(3).max(300),
});

/**
 * Agrega una tarifa. Las tarifas no se editan ni se borran: un cambio de precio es una fila nueva con otra vigencia, así
 * los registros de uso viejos conservan la tarifa con la que se calcularon.
 */
export async function createAiRate(data: z.input<typeof rateSchema>) {
  const session = await requireAdmin();
  const parsed = rateSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los datos de la tarifa");
  const d = parsed.data;
  const rate = await prisma.aiRate.create({ data: { ...d, createdById: session.user.id } });
  await logAudit({ userId: session.user.id, action: "ai.rate_create", resource: "AiRate", resourceId: rate.id, metadata: { provider: d.provider, model: d.model, currency: d.currency, effectiveFrom: d.effectiveFrom.toISOString(), source: d.source } });
  revalidatePath("/admin/ai");
  return { success: true, id: rate.id };
}

/** CSV del ledger con los mismos filtros de la pantalla (máximo 50,000 filas). */
export async function exportAiUsageCsv(raw: Record<string, string | undefined>) {
  await requireAdmin();
  return getAiUsageCsv(parseAiFilters(raw));
}
