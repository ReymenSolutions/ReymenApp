import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { CreateRequestDialog } from "@/components/portal/CreateRequestDialog";
import { formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";

export default async function PortalRequestsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");

  const [t, lang, requests] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.request.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const typeLabels: Record<string, string> = {
    support: t.typeSupport,
    new_automation: t.typeNewAutomation,
    change: t.typeChange,
    question: t.typeQuestion,
    ai_capacity: t.typeAiCapacity,
  };

  const openCount = requests.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS").length;

  return (
    <div>
      <PageHeader
        title={t.requestsTitle}
        description={`${openCount} ${t.requestsActive} · ${requests.length} ${t.requestsTotal}`}
        actions={<CreateRequestDialog />}
      />

      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={FileText}
              title={t.noRequests}
              description={t.requestsEmptyDesc}
              action={<CreateRequestDialog />}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-slate-900">{req.title}</p>
                      <Badge variant="secondary" className="text-xs">
                        {typeLabels[req.type] ?? req.type}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 line-clamp-2">{req.description}</p>
                    <p className="mt-2 text-xs text-slate-400">{formatDate(req.createdAt, lang)}</p>
                  </div>
                  <StatusBadge status={req.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
