import { prisma } from "./prisma";
import type { FollowUpLog } from "@prisma/client";

export interface DueFollowUp {
  leadId: string;
  ruleId: string;
  channel: string;
  template: string;
  attemptNumber: number;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
}

/**
 * Seguimientos que ya tocan: leads cuyo estado coincide con una regla activa,
 * que llevan más del retraso de la regla sin cambios y a los que aún no se les
 * agotaron los intentos. Lo usan el endpoint que consulta n8n y la vista "Hoy".
 */
export async function getDueFollowUps(orgId: string, now = new Date()): Promise<DueFollowUp[]> {
  const rules = await prisma.followUpRule.findMany({ where: { organizationId: orgId, isActive: true } });
  if (rules.length === 0) return [];

  const dueByRule = await Promise.all(
    rules.map(async (rule) => {
      const cutoff = new Date(now.getTime() - rule.delayMinutes * 60 * 1000);
      const candidates = await prisma.lead.findMany({
        where: {
          organizationId: orgId,
          status: rule.triggerStatus,
          doNotContact: false,
          deletedAt: null,
          updatedAt: { lte: cutoff },
        },
        select: { id: true, name: true, phone: true, email: true },
      });
      if (candidates.length === 0) return [];

      const logs = await prisma.followUpLog.findMany({
        where: { ruleId: rule.id, leadId: { in: candidates.map((c) => c.id) } },
        orderBy: { sentAt: "desc" },
      });
      const logsByLead = new Map<string, FollowUpLog[]>();
      for (const log of logs) {
        const arr = logsByLead.get(log.leadId) ?? [];
        arr.push(log);
        logsByLead.set(log.leadId, arr);
      }

      return candidates
        .filter((c) => {
          const leadLogs = logsByLead.get(c.id) ?? [];
          if (leadLogs.length === 0) return true; // never attempted — the delayMinutes cutoff above already applies
          if (leadLogs.length >= rule.maxAttempts) return false;
          if (!rule.repeatIntervalMinutes) return false; // single-fire rule already used its one attempt
          const lastAttempt = leadLogs[0].sentAt;
          return lastAttempt.getTime() <= now.getTime() - rule.repeatIntervalMinutes * 60 * 1000;
        })
        .map((c) => ({
          leadId: c.id,
          ruleId: rule.id,
          channel: rule.channel,
          template: rule.template,
          attemptNumber: (logsByLead.get(c.id)?.length ?? 0) + 1,
          contactName: c.name,
          contactPhone: c.phone,
          contactEmail: c.email,
        }));
    })
  );

  return dueByRule.flat();
}
