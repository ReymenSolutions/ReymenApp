import { getSmartcardAdminClient } from "./smartcard-supabase";
import { prisma } from "./prisma";

export interface RosterPerson {
  name: string | null;
  email: string | null;
}

/**
 * Nombre y correo de cada integrante (por user_id de SmartCard), tomados de
 * la cuenta de Reymen del mismo cliente. Solo para quien administra el
 * equipo (dueño, administrador, gerente): ya ven esos nombres en
 * Configuración → Equipo.
 */
export async function getRosterPeople(organizationId: string, userIds: string[]): Promise<Record<string, RosterPerson>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase || userIds.length === 0) return {};
  const emails = await Promise.all(
    userIds.map(async (id) => {
      const { data } = await supabase.auth.admin.getUserById(id);
      return [id, data?.user?.email?.toLowerCase() ?? null] as const;
    })
  );
  const known = emails.map(([, e]) => e).filter((e): e is string => !!e);
  const users = known.length
    ? await prisma.user.findMany({
        where: { organizationId, email: { in: known, mode: "insensitive" } },
        select: { name: true, email: true },
      })
    : [];
  const nameByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.name]));
  return Object.fromEntries(emails.map(([id, email]) => [id, { email, name: email ? (nameByEmail.get(email) ?? null) : null }]));
}
