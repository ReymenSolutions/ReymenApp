import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GitBranch, Users, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AddVersionDialog } from "@/components/admin/AddVersionDialog";
import { PublishTemplateButton } from "@/components/admin/PublishTemplateButton";
import { InstallForClientDialog } from "@/components/admin/InstallForClientDialog";
import { formatDate } from "@/lib/utils";
import { getServerLang } from "@/lib/i18n-server";
import { INDUSTRY_LABELS as INDUSTRY_LABELS_BY_LANG } from "@/lib/industries";


const INSTALL_STATUS_CONFIG_ES: Record<string, { label: string; icon: typeof CheckCircle2 }> = {
  ACTIVE: { label: "Activo", icon: CheckCircle2 },
  PENDING: { label: "Pendiente", icon: AlertCircle },
  FAILED: { label: "Fallido", icon: AlertCircle },
  UNINSTALLED: { label: "Desinstalado", icon: AlertCircle },
  INSTALLING: { label: "Instalando", icon: AlertCircle },
};

const INSTALL_STATUS_CONFIG_EN: Record<string, { label: string; icon: typeof CheckCircle2 }> = {
  ACTIVE: { label: "Active", icon: CheckCircle2 },
  PENDING: { label: "Pending", icon: AlertCircle },
  FAILED: { label: "Failed", icon: AlertCircle },
  UNINSTALLED: { label: "Uninstalled", icon: AlertCircle },
  INSTALLING: { label: "Installing", icon: AlertCircle },
};

async function getTemplate(templateId: string) {
  return prisma.automationTemplate.findUnique({
    where: { id: templateId },
    include: {
      versions: { orderBy: { createdAt: "desc" } },
      installations: {
        include: {
          organization: { select: { id: true, name: true } },
          version: { select: { version: true } },
        },
        orderBy: { installedAt: "desc" },
      },
    },
  });
}

async function getClients() {
  return prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const [template, clients, lang] = await Promise.all([getTemplate(templateId), getClients(), getServerLang()]);
  if (!template) notFound();

  const INDUSTRY_LABELS = INDUSTRY_LABELS_BY_LANG[lang];
  const INSTALL_STATUS_CONFIG = lang === "es" ? INSTALL_STATUS_CONFIG_ES : INSTALL_STATUS_CONFIG_EN;
  const activeInstalls = template.installations.filter((i) => i.status === "ACTIVE").length;

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/templates" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {lang === "es" ? "Volver a templates" : "Back to templates"}
        </Link>
      </div>

      <PageHeader
        title={`${template.iconEmoji} ${template.name}`}
        description={`${INDUSTRY_LABELS[template.industry] ?? template.industry} · ${template.category}`}
        actions={
          <div className="flex items-center gap-2">
            <PublishTemplateButton templateId={template.id} isPublished={template.isPublished} />
            {template.versions.length > 0 && (
              <InstallForClientDialog
                templateId={template.id}
                templateName={template.name}
                clients={clients}
                versions={template.versions}
              />
            )}
          </div>
        }
      />

      {/* Info bar */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {[
          { label: lang === "es" ? "Estado" : "Status", value: template.isPublished ? (lang === "es" ? "Publicado" : "Published") : (lang === "es" ? "Borrador" : "Draft") },
          { label: lang === "es" ? "Versión actual" : "Current version", value: template.currentVersion ? `v${template.currentVersion}` : (lang === "es" ? "Sin versiones" : "No versions") },
          { label: lang === "es" ? "Versiones" : "Versions", value: template.versions.length },
          { label: lang === "es" ? "Instalaciones activas" : "Active installs", value: activeInstalls },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <p className="text-lg font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Versions */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              {lang === "es" ? "Versiones" : "Versions"}
            </CardTitle>
            <AddVersionDialog
              templateId={template.id}
              templateName={template.name}
              currentVersion={template.currentVersion}
            />
          </CardHeader>
          <CardContent>
            {template.versions.length === 0 ? (
              <div className="py-8 text-center">
                <GitBranch className="mx-auto h-8 w-8 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">
                  {lang === "es" ? "Sin versiones. Añade la primera para poder publicar y instalar." : "No versions yet. Add the first one to be able to publish and install."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {template.versions.map((v) => (
                  <div
                    key={v.id}
                    className={`rounded-lg border p-3 ${
                      v.isLatest ? "border-brand-200 bg-brand-50" : "border-slate-100"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">v{v.version}</span>
                          {v.isLatest && <Badge variant="default">{lang === "es" ? "Última" : "Latest"}</Badge>}
                        </div>
                        {v.changelog && (
                          <p className="mt-1 text-xs text-slate-500">{v.changelog}</p>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{formatDate(v.createdAt, lang)}</span>
                    </div>
                    {v.n8nWorkflowId && (
                      <p className="mt-1 text-xs text-emerald-600">
                        ✓ {lang === "es" ? "Workflow n8n" : "n8n workflow"}: {v.n8nWorkflowId}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Installations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {lang === "es" ? "Instalaciones" : "Installations"} ({template.installations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {template.installations.length === 0 ? (
              <div className="py-8 text-center">
                <Download className="mx-auto h-8 w-8 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">
                  {lang === "es" ? "Sin instalaciones aún. Instala este template para un cliente." : "No installs yet. Install this template for a client."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {template.installations.map((inst) => {
                  const cfg = INSTALL_STATUS_CONFIG[inst.status] ?? INSTALL_STATUS_CONFIG.PENDING;
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={inst.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
                    >
                      <div>
                        <Link
                          href={`/admin/clients/${inst.organization.id}`}
                          className="text-sm font-medium text-slate-900 hover:underline"
                        >
                          {inst.organization.name}
                        </Link>
                        <p className="text-xs text-slate-400">
                          v{inst.version.version} · {formatDate(inst.installedAt, lang)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Icon className={`h-4 w-4 ${inst.status === "ACTIVE" ? "text-emerald-500" : "text-slate-400"}`} />
                        <span className={`text-xs font-medium ${inst.status === "ACTIVE" ? "text-emerald-600" : "text-slate-500"}`}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Description */}
        {template.longDescription && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>{lang === "es" ? "Descripción detallada" : "Detailed description"}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                {template.longDescription}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
