"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import { checkRateLimit } from "@/lib/rate-limit";
import { UserError } from "@/lib/user-error";
import { resolveFeedback, submitFeedback } from "@/lib/feedback";
import { logAudit } from "@/lib/audit";
import type { UserRole } from "@prisma/client";

/** Respuesta del cliente desde el formulario público (sin sesión). El token es el único permiso; se limita por enlace y por IP. */
export async function submitCustomerFeedback(token: string, score: number, comment: string) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const [byToken, byIp] = await Promise.all([
    checkRateLimit(`feedback:token:${String(token).slice(0, 64)}`, { limit: 10, windowMs: 60_000 }),
    checkRateLimit(`feedback:ip:${ip}`, { limit: 30, windowMs: 60_000 }),
  ]);
  if (!byToken.allowed || !byIp.allowed) throw new UserError("Demasiados intentos, espera un momento");
  return submitFeedback(token, { score, comment });
}

/** El equipo cierra el seguimiento de una calificación baja. */
export async function resolveCustomerFeedback(id: string, note?: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "conversations:resolve")) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "REYMEN_POS");
  await resolveFeedback(session.user.organizationId, id, session.user.id, note);
  await logAudit({ organizationId: session.user.organizationId, userId: session.user.id, action: "feedback.resolve", resource: "CustomerFeedback", resourceId: id });
  revalidatePath("/portal/automations");
  return { success: true };
}
