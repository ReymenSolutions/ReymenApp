import { prisma } from "./prisma";
import { phoneKey } from "./phone";
import type { Lead } from "@prisma/client";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Finds existing leads in the same org that plausibly refer to the same
 * contact as {email, phone} — matched on email (sin importar mayúsculas) OR
 * on the phone key (últimos 10 dígitos, ver phone.ts), so "+52 1 55 1234 5678"
 * and "(55) 1234-5678" are the same number. Either is enough; a shared phone
 * with a different name is still worth surfacing (a couple sharing a household
 * number). Never used to block creation from the portal — only to surface a
 * "possible duplicate, review?" prompt, since two different people can
 * legitimately share an email (a shared company inbox) or a phone.
 */
export async function findPotentialDuplicateLeads(
  organizationId: string,
  contact: { email?: string | null; phone?: string | null },
  excludeLeadId?: string
): Promise<Lead[]> {
  const email = contact.email ? normalizeEmail(contact.email) : null;
  const key = phoneKey(contact.phone);
  if (!email && !key) return [];

  return prisma.lead.findMany({
    where: {
      organizationId,
      deletedAt: null,
      id: excludeLeadId ? { not: excludeLeadId } : undefined,
      OR: [...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []), ...(key ? [{ phoneKey: key }] : [])],
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
}

export interface DuplicateGroup {
  /** Por qué se consideran el mismo: mismo teléfono o mismo correo. */
  reason: "phone" | "email";
  /** Valor compartido (últimos 10 dígitos o correo en minúsculas). */
  value: string;
  /** Del más antiguo al más reciente; el primero es el que se conserva al fusionar. */
  leads: Pick<Lead, "id" | "name" | "email" | "phone" | "source" | "status" | "createdAt">[];
}

const SELECT = { id: true, name: true, email: true, phone: true, source: true, status: true, createdAt: true } as const;

/** Grupos de contactos vivos de una organización que comparten teléfono o correo. */
export async function findDuplicateGroups(organizationId: string, limit = 50): Promise<DuplicateGroup[]> {
  const [phoneRows, emailRows] = await Promise.all([
    prisma.$queryRaw<{ value: string }[]>`
      SELECT "phoneKey" AS value FROM "Lead"
      WHERE "organizationId" = ${organizationId} AND "deletedAt" IS NULL AND "phoneKey" IS NOT NULL
      GROUP BY "phoneKey" HAVING count(*) > 1 ORDER BY count(*) DESC, "phoneKey" LIMIT ${limit}`,
    prisma.$queryRaw<{ value: string }[]>`
      SELECT lower(trim("email")) AS value FROM "Lead"
      WHERE "organizationId" = ${organizationId} AND "deletedAt" IS NULL AND "email" IS NOT NULL AND trim("email") <> ''
      GROUP BY lower(trim("email")) HAVING count(*) > 1 ORDER BY count(*) DESC, lower(trim("email")) LIMIT ${limit}`,
  ]);

  const phoneGroups = await Promise.all(
    phoneRows.map(async (r): Promise<DuplicateGroup> => ({
      reason: "phone",
      value: r.value,
      leads: await prisma.lead.findMany({ where: { organizationId, deletedAt: null, phoneKey: r.value }, orderBy: { createdAt: "asc" }, select: SELECT }),
    }))
  );
  const emailGroups = await Promise.all(
    emailRows.map(async (r): Promise<DuplicateGroup> => ({
      reason: "email",
      value: r.value,
      leads: await prisma.lead.findMany({ where: { organizationId, deletedAt: null, email: { equals: r.value, mode: "insensitive" } }, orderBy: { createdAt: "asc" }, select: SELECT }),
    }))
  );

  // Si dos grupos tienen exactamente a las mismas personas (mismo teléfono y mismo correo), se muestra uno solo.
  const seen = new Set<string>();
  return [...phoneGroups, ...emailGroups].filter((g) => {
    const sig = g.leads.map((l) => l.id).join(",");
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

/** Cuántos grupos de posibles duplicados tiene la organización (para el aviso en la lista de leads). */
export async function countDuplicateGroups(organizationId: string): Promise<number> {
  const [phones, emails] = await Promise.all([
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM (SELECT 1 FROM "Lead"
        WHERE "organizationId" = ${organizationId} AND "deletedAt" IS NULL AND "phoneKey" IS NOT NULL
        GROUP BY "phoneKey" HAVING count(*) > 1) g`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM (SELECT 1 FROM "Lead"
        WHERE "organizationId" = ${organizationId} AND "deletedAt" IS NULL AND "email" IS NOT NULL AND trim("email") <> ''
        GROUP BY lower(trim("email")) HAVING count(*) > 1) g`,
  ]);
  return Number(phones[0]?.n ?? 0) + Number(emails[0]?.n ?? 0);
}
