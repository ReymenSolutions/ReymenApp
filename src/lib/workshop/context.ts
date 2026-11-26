import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerLang } from "@/lib/i18n-server";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";

/** Contexto único y protegido del módulo. Los datos financieros quedan limitados al dueño. */
export const getWorkshopContext = cache(async () => {
  const session = await auth();
  if (!session?.user.organizationId) redirect("/login");
  const organizationId = session.user.organizationId;
  await requireModule(organizationId, "WORKSHOP");
  const [lang, org] = await Promise.all([
    getServerLang(),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, timezone: true } }),
  ]);
  return {
    organizationId,
    orgName: org.name,
    timezone: org.timezone,
    lang,
    canManageFinancials: ["OWNER", "ADMIN", "SUPER_ADMIN"].includes(session.user.role),
    canPrintQuotes: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "AGENT"].includes(session.user.role),
  };
});
