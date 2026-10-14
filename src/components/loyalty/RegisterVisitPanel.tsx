"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, CameraOff, CheckCircle2, Gift, PartyPopper, Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { getErrorMessage } from "@/lib/user-error";
import { MAIN_BRANCH_PARAM } from "@/lib/branch-param";
import { money, relativeDay } from "@/lib/loyalty/format";
import {
  getLoyaltyMemberForCheckout,
  lookupLoyaltyMemberByCode,
  registerLoyaltyVisit,
  searchLoyaltyMembers,
} from "@/actions/loyalty";
import type { CheckoutMember } from "@/lib/loyalty/queries";
import type { RegisterVisitResult } from "@/lib/loyalty/service";
import { ProgressDots } from "./ProgressBar";
import { RedeemRewardButton } from "./RedeemRewardButton";
import { useStationBranch } from "./useStationBranch";

// BarcodeDetector todavía no viene en los tipos de TypeScript del DOM.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Step = { kind: "identify" } | { kind: "confirm"; member: CheckoutMember } | { kind: "done"; member: CheckoutMember; result: RegisterVisitResult; amount: number | null };

export function RegisterVisitPanel({
  branches,
  fixedBranch,
  initialMember,
  canOperate,
  programActive,
}: {
  branches: { id: string; name: string }[];
  fixedBranch?: string | null;
  initialMember: CheckoutMember | null;
  canOperate: boolean;
  programActive: boolean;
}) {
  const router = useRouter();
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const { branch, setBranch } = useStationBranch(branches, fixedBranch);

  const [step, setStep] = useState<Step>(initialMember ? { kind: "confirm", member: initialMember } : { kind: "identify" });
  const [code, setCode] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; maskedWhatsapp: string; postalCode: string }[]>([]);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  // Una llave por intento de registro: si el mismo envío llega dos veces, el servidor no duplica.
  const keyRef = useRef(newKey());

  // ── Cámara ──
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    setCameraSupported(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
    return () => stopCamera();
  }, [stopCamera]);

  const pickMember = useCallback((member: CheckoutMember) => {
    keyRef.current = newKey();
    setAmount("");
    setLookupError(null);
    setResults([]);
    setQuery("");
    setCode("");
    setStep({ kind: "confirm", member });
  }, []);

  const lookup = useCallback(
    async (raw: string) => {
      if (!raw.trim()) return;
      setLooking(true);
      setLookupError(null);
      try {
        const res = await lookupLoyaltyMemberByCode(raw);
        if (res.member) pickMember(res.member);
        else setLookupError(res.reason === "invalid" ? L.invalidCode : L.memberNotFound);
      } catch (err) {
        setLookupError(getErrorMessage(err, L.memberNotFound));
      } finally {
        setLooking(false);
      }
    },
    [L, pickMember]
  );

  async function startCamera() {
    const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Ctor) {
      setCameraSupported(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOn(true);
      const detector = new Ctor({ formats: ["qr_code"] });
      requestAnimationFrame(function loop() {
        const video = videoRef.current;
        if (!streamRef.current || !video) return;
        if (video.srcObject !== stream) {
          video.srcObject = stream;
          void video.play();
        }
        detector
          .detect(video)
          .then((codes) => {
            if (codes[0]?.rawValue) {
              stopCamera();
              void lookup(codes[0].rawValue);
            } else if (streamRef.current) {
              setTimeout(() => requestAnimationFrame(loop), 250);
            }
          })
          .catch(() => streamRef.current && setTimeout(() => requestAnimationFrame(loop), 400));
      });
    } catch {
      toast.error(L.cameraError);
      stopCamera();
    }
  }

  // ── Búsqueda por nombre / teléfono ──
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchLoyaltyMembers(query).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function chooseResult(id: string) {
    setLooking(true);
    try {
      const m = await getLoyaltyMemberForCheckout(id);
      if (m) pickMember(m);
      else setLookupError(L.memberNotFound);
    } catch (err) {
      setLookupError(getErrorMessage(err, L.memberNotFound));
    } finally {
      setLooking(false);
    }
  }

  async function refreshMember(id: string) {
    const m = await getLoyaltyMemberForCheckout(id).catch(() => null);
    if (m) setStep((s) => (s.kind === "confirm" ? { kind: "confirm", member: m } : s.kind === "done" ? { ...s, member: m } : s));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "confirm" || saving) return;
    setSaving(true);
    try {
      const value = amount.trim().replace(",", ".");
      const result = await registerLoyaltyVisit({ memberId: step.member.id, branch, saleAmount: value === "" ? "" : Number(value), idempotencyKey: keyRef.current });
      if (result.replay) toast.info(L.replayNotice);
      else toast.success(L.visitRegistered);
      setStep({ kind: "done", member: step.member, result, amount: value === "" ? null : Number(value) });
      router.refresh();
      void refreshMember(step.member.id);
    } catch (err) {
      toast.error(getErrorMessage(err, lang === "es" ? "No se pudo registrar la visita" : "Couldn't record the visit"));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    keyRef.current = newKey();
    setAmount("");
    setStep({ kind: "identify" });
  }

  if (!canOperate) {
    return <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">{L.cannotOperate}</p>;
  }
  if (!programActive) {
    return <p className="rounded-lg bg-amber-50 px-4 py-6 text-center text-sm text-amber-800">{L.pausedBanner}</p>;
  }

  const branchSelect =
    !fixedBranch && branches.length > 0 ? (
      <div className="space-y-1.5">
        <Label htmlFor="visit-branch">{L.branchForVisit}</Label>
        <select id="visit-branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
          <option value={MAIN_BRANCH_PARAM}>{L.mainBranch}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
    ) : null;

  // ── Paso 1: identificar ──
  if (step.kind === "identify") {
    return (
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">{L.step1}</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(code);
            }}
          >
            <Input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={L.codePlaceholder} aria-label={L.codePlaceholder} className="h-11" />
            <Button type="submit" loading={looking} className="h-11">
              {L.identify}
            </Button>
          </form>
          {lookupError && <p className="mt-2 text-sm text-red-600" role="alert">{lookupError}</p>}
        </div>

        <div>
          {cameraSupported ? (
            <Button type="button" variant="outline" onClick={() => (cameraOn ? stopCamera() : void startCamera())}>
              {cameraOn ? <CameraOff className="h-4 w-4" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
              {cameraOn ? L.stopCamera : L.scanCamera}
            </Button>
          ) : (
            <p className="text-xs text-slate-400">{L.cameraUnsupported}</p>
          )}
          {cameraOn && (
            <video ref={videoRef} muted playsInline className="mt-3 aspect-video w-full max-w-md rounded-lg bg-black object-cover" />
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <Label htmlFor="visit-search" className="text-slate-600">{L.orSearch}</Label>
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input id="visit-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L.searchMemberPlaceholder} className="h-10 pl-9" />
          </div>
          {results.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => void chooseResult(r.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                    <span className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      <span className="text-sm font-medium text-slate-900">{r.name}</span>
                    </span>
                    <span className="text-xs text-slate-500">{r.maskedWhatsapp} · CP {r.postalCode}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const member = step.member;
  const memberCard = (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">{member.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <p className="text-lg font-bold text-slate-900">{member.name}</p>
            <p className="text-sm text-slate-500">
              WhatsApp {member.maskedWhatsapp} · CP {member.postalCode}
            </p>
          </div>
        </div>
        {step.kind === "confirm" && (
          <button type="button" onClick={reset} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-slate-500 hover:text-slate-800">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {L.changeMember}
          </button>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <ProgressDots current={member.progress.current} goal={member.progress.goal} size="lg" />
        <span className="text-xl font-bold tabular-nums text-slate-900">
          {member.progress.current}/{member.progress.goal}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {L.totalVisitsShort(member.totalVisits)}
        {member.lastVisitAt ? ` · ${L.lastVisitAgo(relativeDay(new Date(member.lastVisitAt), lang))}` : ""}
        {member.avgTicket > 0 ? ` · ${L.kpiAvgTicket.toLowerCase()} ${money(member.avgTicket)}` : ""}
      </p>
      {member.availableRewards.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg bg-emerald-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{L.availableRewardsHere}</p>
          {member.availableRewards.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-800">
                <Gift className="h-4 w-4" aria-hidden="true" /> {r.rewardName}
              </span>
              <RedeemRewardButton rewardId={r.id} rewardName={r.rewardName} branches={branches} fixedBranch={fixedBranch} onRedeemed={() => void refreshMember(member.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Paso 3 terminado ──
  if (step.kind === "done") {
    const r = step.result;
    return (
      <div className="space-y-4">
        <div className={cn("rounded-xl p-5 text-center", r.reward ? "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white" : "bg-brand-50")}>
          {r.reward ? (
            <>
              <PartyPopper className="mx-auto h-10 w-10" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold">{L.rewardUnlocked}</p>
              <p className="mt-1 text-lg">{L.rewardReady(r.reward.rewardName)}</p>
              <p className="mt-2 text-sm text-emerald-100">{L.newProgress(r.progress.current, r.progress.goal)}</p>
            </>
          ) : (
            <>
              <CheckCircle2 className="mx-auto h-10 w-10 text-brand-600" aria-hidden="true" />
              <p className="mt-2 text-xl font-bold text-slate-900">{L.visitRegistered}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-brand-700">
                {r.progress.current} / {r.progress.goal}
              </p>
              {step.amount !== null && <p className="mt-1 text-sm text-slate-600">{money(step.amount, true)}</p>}
            </>
          )}
          {r.replay && <p className="mt-2 text-xs opacity-80">{L.replayNotice}</p>}
        </div>
        {memberCard}
        <Button type="button" onClick={reset} className="w-full h-11">
          {L.nextCustomer}
        </Button>
      </div>
    );
  }

  // ── Pasos 2 y 3 ──
  const noAmount = amount.trim() === "";
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">{L.step2}</p>
        {memberCard}
        <p className="mt-2 text-xs text-slate-500">{L.confirmIdentity}</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">{L.step3}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="visit-amount">{L.saleAmount}</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400">$</span>
              <Input
                id="visit-amount"
                autoFocus
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="0.00"
                className="h-10 pl-7 text-lg font-semibold"
              />
            </div>
            <p className={cn("text-xs", noAmount ? "text-amber-600" : "text-slate-500")}>{noAmount ? L.noAmountWarning : L.saleAmountHint}</p>
          </div>
          {branchSelect}
        </div>
      </div>
      <Button type="submit" loading={saving} className="h-12 w-full bg-orange-500 text-base font-semibold hover:bg-orange-600">
        {saving ? L.registering : L.registerVisit}
      </Button>
    </form>
  );
}
