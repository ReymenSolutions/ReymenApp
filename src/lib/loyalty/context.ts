// Contexto común de las páginas /portal/food/loyalty/* (solo servidor):
// sesión, gate del módulo Food, idioma, programa vigente, zona horaria y
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

export const getLoyaltyContext = cache(async () => {
  const session = await auth();
  if (!session?.user.organizationId) redirect("/login");
  const orgId = session.user.organizationId;
  await requireModule(orgId, "FOOD_OPS");
  const role = session.user.role as UserRole;
  const [lang, program, org, branches] = await Promise.all([
    getServerLang(),
    getActiveProgram(orgId),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true, name: true, slug: true, timezone: true } }),
    listBranches(orgId, { activeOnly: true }),
  ]);
  return {
    session,
    orgId,
    role,
    lang,
    L: pickDict(loyaltyStrings, lang),
    program,
    org,
    branches: branches.map((b) => ({ id: b.id, name: b.name })),
    canManage: can(role, "food:manage"),
    canOperate: can(role, "loyalty:operate"),
  };
});

export type LoyaltyContext = Awaited<ReturnType<typeof getLoyaltyContext>>;
