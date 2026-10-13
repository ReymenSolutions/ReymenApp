"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Plus, Webhook, Pencil, Archive, Pause, Play,
  RotateCcw, Copy, Eye, EyeOff, Loader2, Zap, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import {
  createAutomation,
  updateAutomation,
  toggleAutomationStatus,
  rotateWebhookSecret,
  archiveAutomation,
} from "@/actions/admin/automations";
import { CopyButton, useCopyToClipboard } from "@/components/shared/CopyButton";
import { getErrorMessage } from "@/lib/user-error";

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PAUSED: "bg-amber-50 text-amber-700 border-amber-200",
  ERROR: "bg-red-50 text-red-700 border-red-200",
  ARCHIVED: "bg-slate-100 text-slate-500 border-slate-200",
};

export type AutomationRow = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  n8nWorkflowId: string | null;
  webhookSecret: string;
  organizationId: string;
  createdAt: Date;
  organization: { name: string; slug: string };
  _count: { events: number };
};

export type OrgOption = { id: string; name: string };



function CodeBlock({ value }: { value: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="relative">
      <pre className="bg-slate-950 text-slate-100 rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
        {value}
      </pre>
      <button
        onClick={() => copy(value)}
        className="absolute top-2 right-2 p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
        title="Copiar"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ─── Webhook Info Dialog ──────────────────────────────────────────────────────

function WebhookInfoDialog({
  automation,
  open,
  onClose,
}: {
  automation: AutomationRow;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const [secretVisible, setSecretVisible] = useState(false);
  const [currentSecret, setCurrentSecret] = useState(automation.webhookSecret);
  const [rotating, startRotate] = useTransition();

  const endpoint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/n8n/automations`
      : "/api/webhooks/n8n/automations";

  const exampleStart = JSON.stringify(
    {
      automationId: automation.id,
      event: "START",
      data: { triggeredBy: "n8n", workflowId: automation.n8nWorkflowId ?? "YOUR_WORKFLOW_ID" },
    },
    null,
    2
  );

  const exampleSuccess = JSON.stringify(
    {
      automationId: automation.id,
      event: "SUCCESS",
      data: { duration: 1230, result: { leadsProcessed: 5 } },
    },
    null,
    2
  );

  const curlExample = `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "x-reymen-orgid: ${automation.organizationId}" \\
  -H "x-reymen-secret: ${currentSecret}" \\
  -d '{"automationId":"${automation.id}","event":"SUCCESS","data":{}}'`;

  function handleRotate() {
    startRotate(async () => {
      try {
        const res = await rotateWebhookSecret(automation.id);
        setCurrentSecret(res.secret);
        toast.success(t.adminWebhookRotated);
      } catch {
        toast.error(t.adminWebhookRotateError);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-brand-600" />
            {t.adminWebhookTitle} — {automation.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.adminWebhookEndpointLabel}</Label>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <code className="flex-1 text-xs text-slate-800 break-all">{endpoint}</code>
              <CopyButton text={endpoint} label={t.save} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.adminWebhookHeadersLabel}</Label>
            <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
              <div className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <code className="text-xs font-medium text-slate-700">x-reymen-orgid</code>
                  <p className="text-xs text-slate-400 mt-0.5 break-all">{automation.organizationId}</p>
                </div>
                <CopyButton text={automation.organizationId} label="Copy" />
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 gap-3">
                <div className="min-w-0 flex-1">
                  <code className="text-xs font-medium text-slate-700">x-reymen-secret</code>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono break-all">
                    {secretVisible ? currentSecret : "•".repeat(20)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setSecretVisible((v) => !v)}
                    className="text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    {secretVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <CopyButton text={currentSecret} label="Copy" />
                  <button
                    onClick={handleRotate}
                    disabled={rotating}
                    className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 transition-colors disabled:opacity-50"
                  >
                    {rotating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    <span>{t.adminWebhookRotateBtn}</span>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <code className="text-xs font-medium text-slate-700">Content-Type</code>
                  <p className="text-xs text-slate-400 mt-0.5">application/json</p>
                </div>
                <CopyButton text="application/json" label="Copy" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.adminWebhookAutoIdLabel}</Label>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <code className="flex-1 text-xs text-slate-800">{automation.id}</code>
              <CopyButton text={automation.id} label="Copy" />
            </div>
          </div>

          <div className="info-box rounded-md border border-brand-200 bg-brand-50 p-3 space-y-1.5">
            <p className="info-box-title text-xs font-semibold text-brand-700">{t.adminWebhookN8nGuide}</p>
            <ol className="info-box-text text-xs text-brand-700 space-y-1 list-decimal list-inside">
              <li>{t.adminWebhookN8nStep1}</li>
              <li>{t.adminWebhookN8nStep2}</li>
              <li>{t.adminWebhookN8nStep3}</li>
              <li>{t.adminWebhookN8nStep4}</li>
              <li>{t.adminWebhookN8nStep5}</li>
            </ol>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.adminWebhookPayloadsLabel}</Label>
            <div>
              <p className="text-xs text-slate-500 mb-1.5">{t.adminWebhookPayloadStart}</p>
              <CodeBlock value={exampleStart} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1.5">{t.adminWebhookPayloadSuccess}</p>
              <CodeBlock value={exampleSuccess} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t.adminWebhookCurlLabel}</Label>
            <CodeBlock value={curlExample} />
          </div>

          <div className="text-xs text-slate-500 bg-slate-50 rounded-md p-3">
            <p className="font-medium text-slate-700 mb-1">{t.adminWebhookValidEvents}</p>
            <div className="flex flex-wrap gap-2">
              {["START", "SUCCESS", "FAILED", "RETRYING"].map((e) => (
                <code key={e} className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-xs">{e}</code>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.close}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Dialog ────────────────────────────────────────────────────────────

function CreateAutomationDialog({
  orgs,
  open,
  onClose,
}: {
  orgs: OrgOption[];
  open: boolean;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const [form, setForm] = useState({ organizationId: "", name: "", type: "", description: "", n8nWorkflowId: "" });
  const [pending, startCreate] = useTransition();

  const automationTypes = [
    { value: "lead_capture", label: t.adminTypeLeadCapture },
    { value: "lead_scoring", label: t.adminTypeLeadScoring },
    { value: "appointment", label: t.adminTypeAppointment },
    { value: "follow_up", label: t.adminTypeFollowUp },
    { value: "notification", label: t.adminTypeNotification },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "custom", label: t.adminTypeCustom },
  ];

  function handleClose() {
    setForm({ organizationId: "", name: "", type: "", description: "", n8nWorkflowId: "" });
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.organizationId || !form.name || !form.type) {
      toast.error(t.adminCompleteFields);
      return;
    }
    startCreate(async () => {
      try {
        await createAutomation({
          organizationId: form.organizationId,
          name: form.name,
          type: form.type,
          description: form.description || undefined,
          n8nWorkflowId: form.n8nWorkflowId || undefined,
        });
        toast.success(t.adminAutoCreatedMsg);
        handleClose();
      } catch (err) {
        toast.error(getErrorMessage(err, t.adminCreateError));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.adminNewAutomation}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t.adminColClient} *</Label>
            <Select value={form.organizationId} onValueChange={(v) => setForm((f) => ({ ...f, organizationId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder={t.adminAutoSelectClient} />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="automationsmanager-f1">{t.colName ?? "Nombre"} *</Label>
            <Input id="automationsmanager-f1"
              placeholder="Captura leads WhatsApp"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.adminColType} *</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger>
                <SelectValue placeholder={t.adminAutoSelectType} />
              </SelectTrigger>
              <SelectContent>
                {automationTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="automationsmanager-f2">{t.colName ? "Descripción" : "Description"}</Label>
            <Input id="automationsmanager-f2"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="automationsmanager-f3">ID Workflow n8n</Label>
            <Input id="automationsmanager-f3"
              placeholder="n8n workflow ID"
              value={form.n8nWorkflowId}
              onChange={(e) => setForm((f) => ({ ...f, n8nWorkflowId: e.target.value }))}
            />
            <p className="text-xs text-slate-400">{t.adminAutoN8nHint}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>{t.cancel}</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.adminAutoCreateBtn}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────

function EditAutomationDialog({
  automation,
  open,
  onClose,
}: {
  automation: AutomationRow;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const [form, setForm] = useState({
    name: automation.name,
    type: automation.type,
    description: automation.description ?? "",
    n8nWorkflowId: automation.n8nWorkflowId ?? "",
    status: automation.status,
  });
  const [pending, startUpdate] = useTransition();

  const automationTypes = [
    { value: "lead_capture", label: t.adminTypeLeadCapture },
    { value: "lead_scoring", label: t.adminTypeLeadScoring },
    { value: "appointment", label: t.adminTypeAppointment },
    { value: "follow_up", label: t.adminTypeFollowUp },
    { value: "notification", label: t.adminTypeNotification },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "custom", label: t.adminTypeCustom },
  ];
  // Automations installed from a template can carry a type/category (e.g. "retention")
  // outside this fixed list — keep it selectable so the dropdown doesn't show blank.
  if (!automationTypes.some((type) => type.value === automation.type)) {
    automationTypes.push({ value: automation.type, label: automation.type });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startUpdate(async () => {
      try {
        await updateAutomation(automation.id, {
          name: form.name,
          type: form.type,
          description: form.description || undefined,
          n8nWorkflowId: form.n8nWorkflowId,
          status: form.status,
        });
        toast.success(t.adminAutoUpdatedMsg);
        onClose();
      } catch {
        toast.error(t.adminUpdateError);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.adminAutoEditTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="automationsmanager-f4">{t.colName ?? "Nombre"}</Label>
            <Input id="automationsmanager-f4" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label>{t.adminColType}</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {automationTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="automationsmanager-f5">{t.colName ? "Descripción" : "Description"}</Label>
            <Input id="automationsmanager-f5"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="automationsmanager-f6">ID Workflow n8n</Label>
            <Input id="automationsmanager-f6"
              value={form.n8nWorkflowId}
              onChange={(e) => setForm((f) => ({ ...f, n8nWorkflowId: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.colStatus}</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">{t.adminAutoStatusActive}</SelectItem>
                <SelectItem value="PAUSED">{t.adminAutoStatusPaused}</SelectItem>
                <SelectItem value="ARCHIVED">{t.adminAutoStatusArchived}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.adminAutoSaveBtn}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AutomationsManager({
  automations,
  orgs,
}: {
  automations: AutomationRow[];
  orgs: OrgOption[];
}) {
  const { t } = usePreferences();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AutomationRow | null>(null);
  const [webhookTarget, setWebhookTarget] = useState<AutomationRow | null>(null);
  const [togglePending, startToggle] = useTransition();
  const [archivePending, startArchive] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);

  const activeCount = automations.filter((a) => a.status === "ACTIVE").length;
  const errorCount = automations.filter((a) => a.status === "ERROR").length;

  const statusLabels: Record<string, string> = {
    ACTIVE: t.adminAutoStatusActive,
    PAUSED: t.adminAutoStatusPaused,
    ERROR: t.adminAutoStatusError,
    ARCHIVED: t.adminAutoStatusArchived,
  };

  const automationTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      lead_capture: t.adminTypeLeadCapture,
      lead_scoring: t.adminTypeLeadScoring,
      appointment: t.adminTypeAppointment,
      follow_up: t.adminTypeFollowUp,
      notification: t.adminTypeNotification,
      whatsapp: "WhatsApp",
      custom: t.adminTypeCustom,
    };
    return map[type] ?? type;
  };

  function handleToggle(id: string) {
    setActionId(id);
    startToggle(async () => {
      try {
        const res = await toggleAutomationStatus(id);
        toast.success(res.status === "ACTIVE" ? t.adminAutoActivatedMsg : t.adminAutoPausedMsg);
      } catch {
        toast.error(t.adminStatusChangeError);
      } finally {
        setActionId(null);
      }
    });
  }

  function handleArchive(id: string, name: string) {
    if (!confirm(`${name}\n${t.adminAutoArchiveNoEvents}`)) return;
    setActionId(id);
    startArchive(async () => {
      try {
        await archiveAutomation(id);
        toast.success(t.adminAutoArchivedMsg);
      } catch {
        toast.error(t.adminArchiveError);
      } finally {
        setActionId(null);
      }
    });
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900">{t.automations}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {automations.length} {t.adminAutoTotalCount} · {activeCount} {t.adminAutoActiveCount}
            {errorCount > 0 && <span className="text-red-500"> · {errorCount} {t.adminAutoWithErrors}</span>}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          {t.adminNewAutomation}
        </Button>
      </div>

      {automations.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Zap className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">{t.adminAutoNoAuto}</p>
            <Button className="mt-4" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t.adminAutoCreateFirst}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.adminAutoColAutomation}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.adminColClient}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.adminColType}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.adminAutoColEvents}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.colStatus}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{t.createdOn}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">{t.adminAutoColActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {automations.map((auto) => {
                const isWorking = actionId === auto.id;
                return (
                  <tr key={auto.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{auto.name}</p>
                      {auto.description && (
                        <p className="text-xs text-slate-400 truncate max-w-[200px]">{auto.description}</p>
                      )}
                      {auto.n8nWorkflowId && (
                        <p className="text-xs text-slate-300 font-mono truncate max-w-[200px]">
                          n8n: {auto.n8nWorkflowId}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{auto.organization.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-xs">{automationTypeLabel(auto.type)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{auto._count.events}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[auto.status] ?? STATUS_COLORS.ARCHIVED}`}
                      >
                        {statusLabels[auto.status] ?? auto.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(auto.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => setWebhookTarget(auto)}
                        >
                          <Webhook className="h-3 w-3" />
                          <span className="hidden lg:inline">Webhook</span>
                        </Button>

                        {auto.status !== "ARCHIVED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => setEditTarget(auto)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}

                        {(auto.status === "ACTIVE" || auto.status === "PAUSED") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => handleToggle(auto.id)}
                            disabled={isWorking && (togglePending || archivePending)}
                          >
                            {isWorking && togglePending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : auto.status === "ACTIVE" ? (
                              <Pause className="h-3 w-3" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                          </Button>
                        )}

                        {auto.status !== "ARCHIVED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs text-slate-400 hover:text-red-500 hover:border-red-300"
                            onClick={() => handleArchive(auto.id, auto.name)}
                            disabled={isWorking && archivePending}
                          >
                            {isWorking && archivePending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Archive className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateAutomationDialog orgs={orgs} open={createOpen} onClose={() => setCreateOpen(false)} />
      {editTarget && (
        <EditAutomationDialog
          automation={editTarget}
          open={true}
          onClose={() => setEditTarget(null)}
        />
      )}
      {webhookTarget && (
        <WebhookInfoDialog
          automation={webhookTarget}
          open={true}
          onClose={() => setWebhookTarget(null)}
        />
      )}
    </>
  );
}
