import { cookies } from "next/headers";
// Contexto común de las páginas /portal/loyalty/* (solo servidor):
// sesión, gate del módulo LOYALTY, idioma, programa vigente, zona horaria y
// sucursales. Así cada página no repite la misma media docena de consultas.

import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { getServerLang } from "@/lib/i18n-server";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { listBranches } from "@/lib/branches";
import { getActiveProgram } from "./service";
import { listLocations } from "./locations";

export const getLoyaltyContext = cache(async () => {
  const session = await auth();
  if (!session?.user.organizationId) redirect("/login");
  const orgId = session.user.organizationId;
  await requireModule(orgId, "LOYALTY");
  const role = session.user.role as UserRole;
  const viewed = (await cookies()).get("loyalty-view-program")?.value;
  const [lang, program, org, branches] = await Promise.all([
    getServerLang(),
    (async () => (viewed ? await getActiveProgram(orgId, viewed) : null) ?? await getActiveProgram(orgId))(),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true, name: true, slug: true, timezone: true } }),
    listBranches(orgId, { activeOnly: true }),
  ]);
  const activeBranches = branches.map((b) => ({ id: b.id, name: b.name }));
  const locations = await listLocations(orgId, org.name, activeBranches);
  return {
    session,
    orgId,
    role,
    lang,
    L: pickDict(loyaltyStrings, lang),
    program,
    org,
    branches: activeBranches,
    /** Principal + sucursales con su ubicación para el mapa (null = sin fijar). */
    locations,
    canManage: can(role, "loyalty:manage"),
    canOperate: can(role, "loyalty:operate"),
  };
});

export type LoyaltyContext = Awaited<ReturnType<typeof getLoyaltyContext>>;
