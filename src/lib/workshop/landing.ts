import { existsSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { normalizeWhatsapp } from "@/lib/public-api";
import { phoneKey } from "@/lib/phone";
import { withPlanCapacity } from "@/lib/plan-limits";
import { logAudit } from "@/lib/audit";
import { recordMetric, METRIC_KEYS } from "@/lib/metrics";

export const WOLF_LOGO = "/taller-wolf-logo-limpio.png";

/** No se publica una página sin organización explícita, módulo activo y el logo limpio entregado. */
export async function getWolfLandingOrg() {
  if (process.env.WORKSHOP_WOLF_LANDING_ENABLED !== "true" || !process.env.WORKSHOP_WOLF_ORG_ID) return null;
  if (!existsSync(join(process.cwd(), "public", "taller-wolf-logo-limpio.png"))) return null;
  const org = await prisma.organization.findFirst({ where: { id: process.env.WORKSHOP_WOLF_ORG_ID, isActive: true }, select: { id: true, name: true } });
  if (!org || !(await hasModule(org.id, "WORKSHOP"))) return null;
  return org;
}

export const wolfInquirySchema = z.object({
  requestKey: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(30),
  marca: z.string().trim().min(1).max(80),
  modelo: z.string().trim().min(1).max(80),
  anio: z.coerce.number().int().min(1900).max(2100),
  placas: z.string().trim().min(2).max(20).nullish(),
  kilometraje: z.number().int().min(0).max(10_000_000).nullish(),
  servicioFalla: z.string().trim().min(5).max(2000),
  consent: z.literal(true),
  maintenanceConsent: z.boolean().optional(),
  website: z.string().max(200).optional(),
});

export type WolfInquiry = z.infer<typeof wolfInquirySchema>;

/** Un envío produce un Lead CRM y un registro de solicitud en la misma transacción. */
export async function submitWolfInquiry(orgId: string, input: WolfInquiry) {
  const phone = normalizeWhatsapp(input.phone);
  if (!phone) return { error: "phone" as const };
  const existing = await prisma.workshopLeadRequest.findUnique({ where: { organizationId_requestKey: { organizationId: orgId, requestKey: input.requestKey } }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const plates = input.placas?.toUpperCase().replace(/\s+/g, "") ?? null;
  let result;
  try {
    result = await withPlanCapacity(orgId, "leads", async (tx) => {
      const lead = await tx.lead.create({ data: {
        organizationId: orgId, name: input.name, phone, phoneKey: phoneKey(phone), source: "landing", externalId: `workshop:${input.requestKey}`,
        tags: ["workshop"], doNotContact: true,
        metadata: { channel: "web", landing: "taller-wolf", vehicle: { marca: input.marca, modelo: input.modelo, anio: input.anio, placas: plates, kilometraje: input.kilometraje }, servicioFalla: input.servicioFalla, consent: { contactForRequest: true, maintenanceReminders: input.maintenanceConsent === true, at: new Date().toISOString() } },
      }, select: { id: true } });
      const request = await tx.workshopLeadRequest.create({ data: {
        organizationId: orgId, leadId: lead.id, requestKey: input.requestKey, marca: input.marca, modelo: input.modelo,
        anio: input.anio, placas: plates, kilometraje: input.kilometraje, servicioFalla: input.servicioFalla,
      }, select: { id: true } });
      return { id: request.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.workshopLeadRequest.findUnique({ where: { organizationId_requestKey: { organizationId: orgId, requestKey: input.requestKey } }, select: { id: true } });
      if (duplicate) return { id: duplicate.id, created: false };
    }
    throw error;
  }
  await logAudit({ organizationId: orgId, userId: null, action: "workshop.inquiry.create", resource: "WorkshopLeadRequest", resourceId: result.id });
  await recordMetric(orgId, METRIC_KEYS.LEADS_CAPTURED);
  return { id: result.id, created: true };
}
