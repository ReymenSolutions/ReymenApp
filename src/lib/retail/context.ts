import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerLang } from "@/lib/i18n-server";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/** Tenant and entitlement are resolved on the server for every Retail page. */
export const getRetailContext = cache(async () => {
  const session = await auth();
  if (!session?.user.organizationId || !session.user.id) redirect("/login");
  const organizationId = session.user.organizationId;
  await requireModule(organizationId, "RETAIL");
  const [org, lang, actor] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { id: true, name: true, timezone: true },
    }),
    getServerLang(),
    prisma.user.findFirst({ where: { id: session.user.id, organizationId, isActive: true }, select: { role: true } }),
  ]);
  if (!actor) redirect("/login");
  const role = actor.role;
  return {
    organizationId,
    org,
    lang,
    canManage: can(role, "retail:manage"),
    canOperate: can(role, "retail:operate"),
  };
});
