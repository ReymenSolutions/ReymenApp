"use client";

// Herramientas de la ficha de una propiedad: fotos, cambio de estado,
// cierre, copiar enlace y recálculo de matches.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ImagePlus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeRealtyPropertyStatus, deleteRealtyPhoto, recomputeRealtyMatches, recordRealtyClosing, setRealtyCoverPhoto, uploadRealtyPhotos } from "@/actions/realty";
import { getErrorMessage } from "@/lib/user-error";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { enumLabel, realtyStrings } from "@/lib/i18n-realty";
import { PROPERTY_STATUSES } from "@/lib/realty/constants";
import { SELECT } from "./ProspectForm";

function useR() {
  const { lang } = usePreferences();
  return pickDict(realtyStrings, lang);
}

/**
 * Reduce la foto en el navegador (≤ 1600 px, JPEG) antes de subirla: cabe en el límite de las acciones y quita EXIF.
 * Se lee como data: URL (la CSP permite data: en img-src, no blob:).
 */
async function shrink(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", 0.85));
}

export function PhotoManager({ propertyId, media, canEdit, title }: { propertyId: string; media: { id: string }[]; canEdit: boolean; title: string }) {
  const R = useR();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files).slice(0, 12)) {
        const blob = await shrink(f);
        const fd = new FormData();
        fd.set("propertyId", propertyId);
        fd.append("photos", new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
        await uploadRealtyPhotos(fd);
      }
      toast.success(R.saved);
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {media.map((m, i) => (
          <li key={m.id} className="group relative overflow-hidden rounded-md border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/realty/media/${m.id}`} alt={`${title} ${i + 1}`} className="aspect-[3/2] w-full object-cover" loading="lazy" />
            {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-[#22C55E] px-1.5 py-0.5 text-[10px] font-bold text-[#080C13]">{R.cover}</span>}
            {canEdit && (
              <div className="absolute right-1.5 top-1.5 flex gap-1">
                {i > 0 && (
                  <button type="button" disabled={busy} onClick={() => run(() => setRealtyCoverPhoto(m.id))} className="rounded bg-white/90 p-1 text-slate-700 shadow hover:bg-white" title={R.makeCover} aria-label={R.makeCover}>
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => run(() => deleteRealtyPhoto(m.id))} className="rounded bg-white/90 p-1 text-red-600 shadow hover:bg-white" title={R.delete} aria-label={R.delete}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-3">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <Button type="button" variant="outline" size="sm" loading={busy} onClick={() => input.current?.click()}>
            <ImagePlus className="h-4 w-4" />
            {R.addPhotos}
          </Button>
          <p className="mt-1 text-xs text-slate-500">{R.photosHint}</p>
        </div>
      )}
    </div>
  );
}

export function StatusChanger({ propertyId, status }: { propertyId: string; status: string }) {
  const R = useR();
  const router = useRouter();
  const [next, setNext] = useState(status);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  async function apply() {
    setBusy(true);
    try {
      await changeRealtyPropertyStatus({ propertyId, status: next, notes: notes || null });
      toast.success(R.saved);
      setNotes("");
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="st-next" className="text-xs">{R.changeStatus}</Label>
        <select id="st-next" className={SELECT + " w-44"} value={next} onChange={(e) => setNext(e.target.value)}>
          {PROPERTY_STATUSES.filter((s) => s !== "SOLD" && s !== "RENTED").map((s) => <option key={s} value={s}>{enumLabel(R, "st", s)}</option>)}
        </select>
      </div>
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={R.statusNote} className="h-9 w-48" maxLength={500} />
      <Button type="button" size="sm" loading={busy} disabled={next === status} onClick={apply} className="h-9 bg-[#031738] hover:bg-[#04275A]">{R.save}</Button>
    </div>
  );
}

export function ClosingForm({ propertyId, price, prospects, advisors, defaultAdvisorId }: { propertyId: string; price: number; prospects: { id: string; name: string }[]; advisors: { id: string; name: string | null; email: string }[]; defaultAdvisorId?: string }) {
  const R = useR();
  const router = useRouter();
  const [amount, setAmount] = useState(String(price));
  const [commission, setCommission] = useState("");
  const [profileId, setProfileId] = useState("");
  const [advisorUserId, setAdvisor] = useState(defaultAdvisorId ?? "");
  const [closedAt, setClosedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await recordRealtyClosing({ propertyId, profileId: profileId || null, advisorUserId: advisorUserId || null, opportunityId: null, finalAmount: Number(amount), commissionAmount: commission ? Number(commission) : null, closedAt: new Date(`${closedAt}T12:00:00`).toISOString(), notes: notes || null });
      toast.success(R.closingDone);
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="c-amt" className="text-xs">{R.finalAmount}</Label>
        <Input id="c-amt" type="number" min={1} step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-com" className="text-xs">{R.commission}</Label>
        <Input id="c-com" type="number" min={0} step="any" value={commission} onChange={(e) => setCommission(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-prof" className="text-xs">{R.prospect}</Label>
        <select id="c-prof" className={SELECT} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          <option value="">—</option>
          {prospects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-adv" className="text-xs">{R.advisor}</Label>
        <select id="c-adv" className={SELECT} value={advisorUserId} onChange={(e) => setAdvisor(e.target.value)}>
          <option value="">—</option>
          {advisors.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.email}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-at" className="text-xs">{R.closedAt}</Label>
        <Input id="c-at" type="date" required value={closedAt} onChange={(e) => setClosedAt(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="c-notes" className="text-xs">{R.notes}</Label>
        <Input id="c-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy} className="bg-[#22C55E] text-[#080C13] hover:bg-[#16a34a]">{R.registerClosing}</Button>
      </div>
    </form>
  );
}

export function CopyLink({ url }: { url: string }) {
  const R = useR();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error(url);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      {done ? R.copied : R.copyLink}
    </button>
  );
}

export function RecomputeButton() {
  const R = useR();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await recomputeRealtyMatches();
          toast.success(R.recomputed(r.count));
          router.refresh();
        } catch (err) {
          toast.error(getErrorMessage(err, "Error"));
        } finally {
          setBusy(false);
        }
      }}
    >
      {R.recompute}
    </Button>
  );
}
