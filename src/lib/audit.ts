// Solo se llama desde código de servidor. No lleva "use server": eso lo
// convertía en una acción pública con la que cualquiera podía escribir
// entradas falsas en la bitácora de auditoría.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

interface AuditParams {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId ?? null,
        userId: params.userId ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId ?? null,
        metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (error) {
    // Un fallo de auditoría nunca rompe la operación principal, pero tampoco se pierde en silencio: queda una señal en los
    // logs del servidor (sin metadata, que puede traer datos del cliente) para detectar que la bitácora dejó de escribir.
    console.error(`[audit] no se pudo registrar "${params.action}" (${params.resource}${params.resourceId ? `:${params.resourceId}` : ""}, org ${params.organizationId ?? "-"}):`, error instanceof Error ? error.message : error);
  }
}
