import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ count: 0, items: [] }, { status: 401 });
  }

  const isPortal = !!session.user.organizationId;
  const orgFilter = isPortal ? { organizationId: session.user.organizationId! } : {};

  const [escalated, openRequests, seenAt, aiActions, alerts] = await Promise.all([
    prisma.conversation.findMany({
      where: { ...orgFilter, status: "ESCALATED" },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: { id: true, contactName: true, updatedAt: true },
    }),
    prisma.request.findMany({
      where: { ...orgFilter, status: "OPEN" },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { notificationsSeenAt: true } })
      .then((u) => u?.notificationsSeenAt ?? null),
    // Lo que el Agente IA hizo solo (con deshacer) y lo que sugiere: el aviso de "aplica lo seguro y avisa".
    isPortal
      ? prisma.pipelineAiAction.findMany({
          where: { organizationId: session.user.organizationId!, OR: [{ status: "SUGGESTED" }, { status: "APPLIED", createdAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } }] },
          take: 5,
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, kind: true, opportunityTitle: true, toStageName: true, createdAt: true },
        })
      : Promise.resolve([]),
    // Avisos internos de las automatizaciones (p. ej. insumo bajo el mínimo). Las pruebas (dry-run) no avisan.
    isPortal
      ? prisma.automationExecution.findMany({
          where: { organizationId: session.user.organizationId!, status: "SUCCEEDED", createdAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }, action: { path: ["type"], equals: "alert" } },
          take: 5,
          orderBy: { createdAt: "desc" },
          select: { action: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const items = [
    ...escalated.map((c) => ({
      type: "escalation",
      label: "Conversación escalada",
      detail: c.contactName ?? "Sin nombre",
      href: isPortal ? "/portal/conversations" : "/admin/escalations",
      at: c.updatedAt,
    })),
    ...aiActions.map((a) => ({
      type: a.status === "SUGGESTED" ? "ai_suggestion" : "ai_action",
      label: a.status === "SUGGESTED" ? "El Agente IA sugiere" : "El Agente IA actualizó el pipeline",
      detail: `${a.opportunityTitle}${a.toStageName ? ` → ${a.toStageName}` : ""}`,
      href: "/portal/pipeline",
      at: a.createdAt,
    })),
    ...alerts.map((a) => {
      const action = (a.action ?? {}) as { title?: string; body?: string; href?: string; severity?: string };
      return { type: "automation_alert", label: action.severity === "critical" ? "Alerta crítica" : "Alerta", detail: `${action.title ?? ""}${action.body ? ` — ${action.body}` : ""}`, href: action.href ?? "/portal/automations", at: a.createdAt };
    }),
    ...openRequests.map((r) => ({
      type: "request",
      label: "Solicitud abierta",
      detail: r.title,
      href: isPortal ? "/portal/requests" : "/admin/requests",
      at: r.createdAt,
    })),
  ].slice(0, 8);

  // The badge only counts items newer than the last time the bell was
  // opened — the list itself still shows everything pending, so nothing
  // that still needs action disappears, only the "new since last look" count.
  const unreadCount = seenAt ? items.filter((i) => i.at > seenAt).length : items.length;

  return NextResponse.json({
    count: unreadCount,
    items: items.map(({ at: _at, ...rest }) => rest),
  });
}

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ success: false }, { status: 401 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { notificationsSeenAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
