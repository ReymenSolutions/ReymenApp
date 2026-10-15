"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveLoyaltyProgram } from "@/actions/loyalty";
import { getErrorMessage } from "@/lib/user-error";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { ProgressDots } from "./ProgressBar";

type RewardType = "FREE_ITEM" | "DISCOUNT_PERCENT" | "DISCOUNT_AMOUNT" | "CUSTOM";

export interface ProgramFormValues {
  programId?: string;
  createNew?: boolean;
  rewardValue?: number | null;
  name: string;
  description: string;
  status: "ACTIVE" | "PAUSED";
  visitGoal: number;
  rewardType: RewardType;
  rewardName: string;
  rewardDescription: string;
  rewardHeadline: string;
  scope: "ORGANIZATION" | "BRANCH";
  branchId: string;
}

const SELECT = "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm";

export function ProgramForm({
  initial,
  branches,
  businessName,
  isNew,
  readOnly,
}: {
  initial: ProgramFormValues;
  branches: { id: string; name: string }[];
  businessName: string;
  isNew: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ProgramFormValues>(k: K, value: ProgramFormValues[K]) => setV((s) => ({ ...s, [k]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await saveLoyaltyProgram({ ...v, visitGoal: Number(v.visitGoal) });
      if (res.ruleChanged && !res.created) toast.success(L.savedNewVersion(res.version));
      else toast.success(L.savedToast);
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, lang === "es" ? "Error al guardar" : "Error saving"));
    } finally {
      setSaving(false);
    }
  }

  const goal = Math.min(50, Math.max(2, Number(v.visitGoal) || 2));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <form onSubmit={submit} className="space-y-5 lg:col-span-3">
        <fieldset disabled={readOnly} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-name">{L.programName}</Label>
              <Input id="p-name" required minLength={2} maxLength={80} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder={L.programNamePh} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="p-desc">{L.programDescription}</Label>
              <Textarea id="p-desc" rows={2} maxLength={500} value={v.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-status">{L.programStatus}</Label>
              <select id="p-status" className={SELECT} value={v.status} onChange={(e) => set("status", e.target.value as ProgramFormValues["status"])}>
                <option value="ACTIVE">{L.statusActiveProgram}</option>
                <option value="PAUSED">{L.statusPausedProgram}</option>
              </select>
            </div>
            {branches.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="p-scope">{L.scope}</Label>
                <select id="p-scope" className={SELECT} value={v.scope} onChange={(e) => set("scope", e.target.value as ProgramFormValues["scope"])}>
                  <option value="ORGANIZATION">{L.scopeOrganization}</option>
                  <option value="BRANCH">{L.scopeBranch}</option>
                </select>
                {v.scope === "BRANCH" && (
                  <select aria-label={L.branch} className={`${SELECT} mt-2`} value={v.branchId} onChange={(e) => set("branchId", e.target.value)} required>
                    <option value="">—</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-sm font-semibold text-slate-900">{L.ruleTitle}</p>
            <p className="text-xs text-slate-500">{L.ruleVisitsOnly}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-goal">{L.visitGoal}</Label>
                <Input id="p-goal" type="number" min={2} max={50} required value={v.visitGoal} onChange={(e) => set("visitGoal", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-rtype">{L.rewardType}</Label>
                <select id="p-rtype" className={SELECT} value={v.rewardType} onChange={(e) => setV((old) => ({ ...old, rewardType: e.target.value as RewardType, rewardValue: null }))}>
                  <option value="FREE_ITEM">{L.rewardTypeFreeItem}</option>
                  <option value="DISCOUNT_PERCENT">{L.rewardTypePercent}</option>
                  <option value="DISCOUNT_AMOUNT">{L.rewardTypeAmount}</option>
                  <option value="CUSTOM">{L.rewardTypeCustom}</option>
                </select>
              </div>
              {(v.rewardType === "DISCOUNT_PERCENT" || v.rewardType === "DISCOUNT_AMOUNT") && (
              <div className="space-y-1.5">
                <Label htmlFor="p-value">{lang === "es" ? "Valor para canje en POS (% o MXN)" : "POS redemption value (% or MXN)"}</Label>
                <Input id="p-value" type="number" min="0.01" max={v.rewardType === "DISCOUNT_PERCENT" ? 100 : 100000} step="0.01" value={v.rewardValue ?? ""} onChange={(e) => set("rewardValue", e.target.value ? Number(e.target.value) : null)} />
                <p className="text-xs text-slate-500">{lang === "es" ? "Sin valor, la recompensa solo permite canje manual. Aplica a recompensas nuevas." : "Without a value, rewards can only be redeemed manually. Applies to new rewards."}</p>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="p-rname">{L.rewardName}</Label>
                <Input id="p-rname" required minLength={2} maxLength={60} value={v.rewardName} onChange={(e) => set("rewardName", e.target.value)} placeholder={L.rewardNamePh} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="p-rdesc">{L.rewardDescription}</Label>
                <Input id="p-rdesc" maxLength={300} value={v.rewardDescription} onChange={(e) => set("rewardDescription", e.target.value)} placeholder={L.rewardDescriptionPh} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="p-rhead">{L.rewardHeadline}</Label>
                <Input id="p-rhead" maxLength={120} value={v.rewardHeadline} onChange={(e) => set("rewardHeadline", e.target.value)} placeholder={L.rewardHeadlinePh} />
              </div>
            </div>
          </div>
        </fieldset>
        {!readOnly && (
          <Button type="submit" loading={saving}>
            {saving ? L.saving : isNew ? L.noProgramCta : L.save}
          </Button>
        )}
      </form>

      {/* Vista previa de la tarjeta del cliente */}
      <div className="lg:col-span-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{L.previewTitle}</p>
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 to-brand-950 p-5 text-white shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-300">{businessName}</p>
          <p className="mt-1 text-lg font-bold">{v.name || L.programNamePh}</p>
          <p className="mt-4 text-sm text-brand-100">{L.hello("Mariana")}</p>
          <p className="text-3xl font-bold tabular-nums">{L.visitsOf(Math.min(7, goal - 1), goal)}</p>
          <div className="mt-3 rounded-lg bg-white/10 p-2.5">
            <ProgressDots current={Math.min(7, goal - 1)} goal={goal} />
          </div>
          <p className="mt-3 text-sm text-brand-100">
            {L.remainingVisits(goal - Math.min(7, goal - 1))} · {v.rewardName || L.rewardNamePh}
          </p>
          {v.rewardHeadline && <p className="mt-1 text-xs italic text-orange-200">“{v.rewardHeadline}”</p>}
        </div>
      </div>
    </div>
  );
}
