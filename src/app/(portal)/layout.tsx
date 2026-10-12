import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEnabledModules } from "@/lib/modules";
import { PortalShell } from "@/components/portal/PortalShell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) return redirect("/login");

  const orgId = session.user.organizationId;
  if (!orgId) return redirect("/login");

  // Re-validated on every request (not just at login) so deactivating a
  // team member or suspending their organization takes effect immediately,
  // rather than only blocking their next sign-in.
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id, isActive: true },
    select: {
      organization: { select: { id: true, name: true, logoUrl: true, isActive: true } },
    },
  });

  if (!currentUser?.organization?.isActive) return redirect("/login");
  const org = currentUser.organization;
  const enabledModules = await getEnabledModules(org.id);

  // Inbox: clientes esperando respuesta (lo último lo dijo el cliente y la conversación sigue abierta).
  // Solo se consulta si el negocio tiene CRM o WhatsApp AI, para no hacer una consulta de más al resto.
  const pendingConversations =
    enabledModules.includes("CRM") || enabledModules.includes("AI_WHATSAPP")
      ? await prisma.conversation.count({
          where: { organizationId: org.id, archivedAt: null, lastMessageRole: "USER", status: { in: ["OPEN", "ESCALATED"] } },
        })
      : 0;

  return (
    <PortalShell
      orgName={org.name}
      orgLogoUrl={org.logoUrl}
      enabledModules={enabledModules}
      pendingConversations={pendingConversations}
    >
      {children}
    </PortalShell>
  );
}
