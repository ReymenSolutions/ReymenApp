import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { notifyAdmins } from "@/lib/admin-notifications";
import { BUDGET_ALERT_THRESHOLDS, getBudgetState } from "./budget";

// Alertas de consumo 50/75/90/100 %: una por umbral y ciclo (la llave única las hace idempotentes aunque varias llamadas
// crucen el umbral a la vez). Reutilizan lo que ya existe: correo a los admins de Reymen y, desde 90 %, correo a los
// dueños del negocio (aviso comercial); todo queda en la bitácora de auditoría.

const COPY: Record<number, string> = {
  50: "seguimiento interno: llegó al 50 % de su presupuesto de IA del ciclo",
  75: "alerta preventiva: llegó al 75 % de su presupuesto de IA del ciclo",
  90: "alerta crítica: llegó al 90 % de su presupuesto de IA del ciclo",
  100: "agotó su presupuesto de IA del ciclo: los agentes de IA quedan en pausa hasta que se renueve, se amplíe o recargue",
};

/** Emite las alertas de los umbrales ya cruzados que aún no se habían emitido. `forceExhausted` = hubo un bloqueo por presupuesto. */
export async function evaluateBudgetAlerts(organizationId: string, now: Date = new Date(), opts: { forceExhausted?: boolean } = {}): Promise<number[]> {
  const state = await getBudgetState(organizationId, now);
  const crossed = BUDGET_ALERT_THRESHOLDS.filter((t) => state.percent >= t || (t === 100 && opts.forceExhausted));
  const emitted: number[] = [];
  for (const threshold of crossed) {
    try {
      await prisma.aiBudgetAlert.create({ data: { organizationId, cycleStart: state.cycleStart, threshold } });
    } catch {
      continue; // ya emitida en este ciclo
    }
    emitted.push(threshold);
    await notify(organizationId, threshold, state.percent, state.spentMxn, state.availableMxn);
  }
  return emitted;
}

async function notify(organizationId: string, threshold: number, percent: number, spent: number, available: number) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  const name = org?.name ?? organizationId;
  await logAudit({ organizationId, action: "ai.budget_alert", resource: "Organization", resourceId: organizationId, metadata: { threshold, percent: Math.round(percent), spentMxn: spent, availableMxn: available } });
  try {
    const summary = `${name}: ${COPY[threshold]} ($${spent.toFixed(2)} de $${available.toFixed(2)} MXN).`;
    if (threshold >= 75) await notifyAdmins({ subject: `IA: ${name} al ${threshold} % de su presupuesto`, html: `<p>${summary}</p>`, text: summary });
    if (threshold >= 90) {
      // Aviso comercial al cliente: sin costos internos, solo su uso.
      const owners = await prisma.user.findMany({ where: { organizationId, role: { in: ["OWNER", "SUPER_ADMIN"] }, isActive: true }, select: { email: true } });
      const text = threshold === 100 ? "Tu plan alcanzó su capacidad de IA de este periodo. Tus agentes pasan a atención humana y se reanudan al renovarse tu plan o al adquirir capacidad adicional." : `Tu plan lleva el ${threshold} % de su capacidad de IA de este periodo. Puedes consultar tu consumo en Reymen y adquirir capacidad adicional cuando la necesites.`;
      await Promise.all(owners.map((o) => sendEmail({ to: o.email, subject: `Tu consumo de IA: ${threshold} %`, html: `<p>${text}</p>`, text }).catch(() => undefined)));
    }
  } catch {
    // Un fallo al avisar nunca debe romper la llamada de IA.
  }
}
