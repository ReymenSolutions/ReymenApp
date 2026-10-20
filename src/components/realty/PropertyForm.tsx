"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveRealtyProperty } from "@/actions/realty";
import { getErrorMessage } from "@/lib/user-error";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { enumLabel, realtyStrings } from "@/lib/i18n-realty";
import { FEATURES, OPERATIONS, PROPERTY_STATUSES, PROPERTY_TYPES } from "@/lib/realty/constants";
import { cn } from "@/lib/utils";
import { SELECT } from "./ProspectForm";
import { GeoPicker } from "./GeoPicker";

export interface PropertyFormValues {
  id?: string;
  title: string;
  description: string;
  operation: string;
  propertyType: string;
  status: string;
  price: string;
  currency: string;
  zoneId: string;
  neighborhood: string;
  addressLine: string;
  showExactLocation: boolean;
  latitude: string;
  longitude: string;
  bedrooms: string;
  bathrooms: string;
  parkingSpaces: string;
  constructionArea: string;
  landArea: string;
  ageYears: string;
  furnished: boolean;
  features: string[];
  contactWhatsapp: string;
  branchId: string;
  advisorUserId: string;
  published: boolean;
}

const n = (s: string) => (s.trim() === "" ? null : Number(s));

export function PropertyForm({
  initial,
  zones,
  advisors,
  branches,
}: {
  initial: PropertyFormValues;
  zones: { id: string; name: string; latitude?: number | null; longitude?: number | null }[];
  advisors: { id: string; name: string | null; email: string }[];
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { lang } = usePreferences();
  const R = pickDict(realtyStrings, lang);
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [geoPending, setGeoPending] = useState(false);
  const set = <K extends keyof PropertyFormValues>(k: K, value: PropertyFormValues[K]) => setV((s) => ({ ...s, [k]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (geoPending) {
      toast.error(R.geoPendingBlock);
      return;
    }
    setSaving(true);
    try {
      const res = await saveRealtyProperty({
        id: v.id,
        title: v.title,
        description: v.description || null,
        operation: v.operation,
        propertyType: v.propertyType,
        status: v.status,
        price: Number(v.price),
        currency: v.currency as "MXN" | "USD",
        zoneId: v.zoneId,
        neighborhood: v.neighborhood || null,
        addressLine: v.addressLine || null,
        showExactLocation: v.showExactLocation,
        latitude: n(v.latitude),
        longitude: n(v.longitude),
        bedrooms: n(v.bedrooms),
        bathrooms: n(v.bathrooms),
        parkingSpaces: n(v.parkingSpaces),
        constructionArea: n(v.constructionArea),
        landArea: n(v.landArea),
        ageYears: n(v.ageYears),
        furnished: v.furnished,
        features: v.features as never,
        contactWhatsapp: v.contactWhatsapp || null,
        branchId: v.branchId || null,
        advisorUserId: v.advisorUserId || null,
        published: v.published,
      });
      toast.success(R.saved);
      router.push(`/portal/realty/properties/${res.id}`);
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof PropertyFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`f-${key}`}>{label}</Label>
      <Input id={`f-${key}`} value={v[key] as string} onChange={(e) => set(key, e.target.value as never)} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-slate-900">{R.property}</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">{field("title", `${R.title} *`, { required: true, minLength: 3, maxLength: 140 })}</div>
          <div className="space-y-1.5">
            <Label htmlFor="f-op">{R.operation}</Label>
            <select id="f-op" className={SELECT} value={v.operation} onChange={(e) => set("operation", e.target.value)}>
              {OPERATIONS.map((o) => <option key={o} value={o}>{enumLabel(R, "op", o)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-type">{R.type}</Label>
            <select id="f-type" className={SELECT} value={v.propertyType} onChange={(e) => set("propertyType", e.target.value)}>
              {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{enumLabel(R, "type", t)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-st">{R.status}</Label>
            <select id="f-st" className={SELECT} value={v.status} onChange={(e) => set("status", e.target.value)}>
              {PROPERTY_STATUSES.map((s) => <option key={s} value={s}>{enumLabel(R, "st", s)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-zone">{R.zone} *</Label>
            <select id="f-zone" className={SELECT} value={v.zoneId} onChange={(e) => set("zoneId", e.target.value)} required>
              <option value="" disabled>—</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          {field("price", `${R.price} *`, { type: "number", min: 1, step: "any", required: true })}
          <div className="space-y-1.5">
            <Label htmlFor="f-cur">{R.currency}</Label>
            <select id="f-cur" className={SELECT} value={v.currency} onChange={(e) => set("currency", e.target.value)}>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </div>
          {field("neighborhood", R.neighborhood, { maxLength: 120 })}
          {field("addressLine", R.address, { maxLength: 200 })}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="f-desc">{R.description}</Label>
            <Textarea id="f-desc" rows={4} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={5000} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="prop-geo-q">{R.geoTitle}</Label>
            <GeoPicker
              idPrefix="prop"
              hint={R.geoPropertyHint}
              suggestedQuery={[v.addressLine, v.neighborhood, zones.find((z) => z.id === v.zoneId)?.name].filter(Boolean).join(", ")}
              value={v.latitude !== "" && v.longitude !== "" ? { lat: Number(v.latitude), lng: Number(v.longitude) } : null}
              center={(() => {
                const z = zones.find((x) => x.id === v.zoneId);
                return z && z.latitude != null && z.longitude != null ? { lat: z.latitude, lng: z.longitude } : null;
              })()}
              onConfirm={(p) => setV((s) => ({ ...s, latitude: p ? String(p.lat) : "", longitude: p ? String(p.lng) : "" }))}
              onPendingChange={setGeoPending}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-slate-900">{R.features}</legend>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {field("bedrooms", R.bedrooms, { type: "number", min: 0, max: 50 })}
          {field("bathrooms", R.bathrooms, { type: "number", min: 0, max: 50, step: "0.5" })}
          {field("parkingSpaces", R.parking, { type: "number", min: 0, max: 50 })}
          {field("constructionArea", R.constructionArea, { type: "number", min: 0, step: "any" })}
          {field("landArea", R.landArea, { type: "number", min: 0, step: "any" })}
          {field("ageYears", R.age, { type: "number", min: 0, max: 300 })}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {FEATURES.map((f) => {
            const on = v.features.includes(f);
            return (
              <button key={f} type="button" aria-pressed={on} onClick={() => set("features", on ? v.features.filter((x) => x !== f) : [...v.features, f])} className={cn("rounded-full border px-3 py-1 text-xs font-medium", on ? "border-[#031738] bg-[#031738] text-white" : "border-slate-200 text-slate-700 hover:border-[#063C82]")}>
                {enumLabel(R, "feat", f)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-slate-900">{R.publicPage}</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            {field("contactWhatsapp", R.contactWhatsapp, { maxLength: 30, inputMode: "tel", placeholder: "+52 81…" })}
            <p className="text-xs text-slate-500">{R.contactWhatsappHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-adv">{R.advisor}</Label>
            <select id="f-adv" className={SELECT} value={v.advisorUserId} onChange={(e) => set("advisorUserId", e.target.value)}>
              <option value="">—</option>
              {advisors.map((a) => <option key={a.id} value={a.id}>{a.name ?? a.email}</option>)}
            </select>
          </div>
          {branches.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="f-br">{R.branch}</Label>
              <select id="f-br" className={SELECT} value={v.branchId} onChange={(e) => set("branchId", e.target.value)}>
                <option value="">—</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={v.showExactLocation} onChange={(e) => set("showExactLocation", e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            {R.showExactLocation}
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={v.published} onChange={(e) => set("published", e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            {R.published}
          </label>
        </div>
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>{R.cancel}</Button>
        <Button type="submit" loading={saving} className="bg-[#031738] hover:bg-[#04275A]">{saving ? R.saving : R.save}</Button>
      </div>
    </form>
  );
}
