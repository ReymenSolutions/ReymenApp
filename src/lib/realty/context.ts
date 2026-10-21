// Solo servidor. Contexto común de /portal/realty/*: sesión, gate del módulo
// REALTY, idioma, organización, sucursales, permisos y ajustes.

import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { getServerLang } from "@/lib/i18n-server";
import { pickDict } from "@/lib/i18n-dict";
import { realtyStrings } from "@/lib/i18n-realty";
import { listBranches } from "@/lib/branches";

export const getRealtyContext = cache(async () => {
  const session = await auth();
  if (!session?.user.organizationId) redirect("/login");
  const orgId = session.user.organizationId;
  await requireModule(orgId, "REALTY");
  const role = session.user.role as UserRole;
  const [lang, org, branches, settings, demoCount] = await Promise.all([
    getServerLang(),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { id: true, name: true, slug: true, timezone: true } }),
    listBranches(orgId, { activeOnly: true }),
    prisma.realtySettings.findUnique({ where: { organizationId: orgId } }),
    prisma.realtyProperty.count({ where: { organizationId: orgId, isDemo: true } }),
  ]);
  return {
    session,
    orgId,
    userId: session.user.id,
    role,
    lang,
    R: pickDict(realtyStrings, lang),
    org,
    branches: branches.map((b) => ({ id: b.id, name: b.name })),
    settings,
    currency: settings?.defaultCurrency ?? "MXN",
    isDemo: demoCount > 0,
    canManage: can(role, "realty:manage"),
    canOperate: can(role, "realty:operate"),
  };
});

export type RealtyContext = Awaited<ReturnType<typeof getRealtyContext>>;
