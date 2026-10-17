"use client";

// Formularios de gerencia: campañas, zonas y ajustes de la landing.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteRealtyCampaign, deleteRealtyZone, saveRealtyCampaign, saveRealtySettings, saveRealtyZone } from "@/actions/realty";
import { getErrorMessage } from "@/lib/user-error";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { enumLabel, realtyStrings } from "@/lib/i18n-realty";
import { SELECT } from "./ProspectForm";

const CHANNELS = ["META", "INSTAGRAM", "GOOGLE", "SMARTCARD", "WHATSAPP", "PORTAL", "REFERRAL", "OTHER"] as const;

function useR() {
  const { lang } = usePreferences();
  return pickDict(realtyStrings, lang);
}

function useRun() {
  const router = useRouter();
  const R = useR();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    try {
      await fn();
      toast.success(R.saved);
      after?.();
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

export interface CampaignValues {
  id?: string;
  name: string;
  channel: string;
  propertyId: string;
  spend: string;
  startDate: string;
  endDate: string;
  leadsCount: string;
  visitsCount: string;
  closingsCount: string;
  attributedRevenue: string;
  status: string;
}

export const EMPTY_CAMPAIGN: CampaignValues = { name: "", channel: "META", propertyId: "", spend: "", startDate: new Date().toISOString().slice(0, 10), endDate: "", leadsCount: "0", visitsCount: "0", closingsCount: "0", attributedRevenue: "", status: "ACTIVE" };

export function CampaignForm({ initial, properties, onDone }: { initial: CampaignValues; properties: { id: string; title: string }[]; onDone?: () => void }) {
  const R = useR();
  const { busy, run } = useRun();
  const [v, setV] = useState(initial);
  const set = <K extends keyof CampaignValues>(k: K, val: string) => setV((s) => ({ ...s, [k]: val }));
  const inp = (k: keyof CampaignValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`cf-${k}-${initial.id ?? "new"}`} className="text-xs">{label}</Label>
      <Input id={`cf-${k}-${initial.id ?? "new"}`} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} {...props} />
    </div>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            saveRealtyCampaign({
              id: v.id,
              name: v.name,
              channel: v.channel as (typeof CHANNELS)[number],
              propertyId: v.propertyId || null,
              spend: Number(v.spend || 0),
              startDate: new Date(`${v.startDate}T12:00:00`).toISOString(),
              endDate: v.endDate ? new Date(`${v.endDate}T12:00:00`).toISOString() : null,
              leadsCount: Number(v.leadsCount || 0),
              visitsCount: Number(v.visitsCount || 0),
              closingsCount: Number(v.closingsCount || 0),
              attributedRevenue: v.attributedRevenue === "" ? null : Number(v.attributedRevenue),
              status: v.status as "ACTIVE",
            }),
          () => {
            if (!v.id) setV(EMPTY_CAMPAIGN);
            onDone?.();
          },
        );
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="sm:col-span-2">{inp("name", R.campaign, { required: true, minLength: 2, maxLength: 120 })}</div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`cf-ch-${initial.id ?? "new"}`}>{R.channel}</Label>
        <select id={`cf-ch-${initial.id ?? "new"}`} className={SELECT} value={v.channel} onChange={(e) => set("channel", e.target.value)}>
          {CHANNELS.map((c) => <option key={c} value={c}>{enumLabel(R, "ch", c)}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`cf-st-${initial.id ?? "new"}`}>{R.status}</Label>
        <select id={`cf-st-${initial.id ?? "new"}`} className={SELECT} value={v.status} onChange={(e) => set("status", e.target.value)}>
          {(["ACTIVE", "PAUSED", "ENDED"] as const).map((s) => <option key={s} value={s}>{enumLabel(R, "cst", s)}</option>)}
        </select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label className="text-xs" htmlFor={`cf-p-${initial.id ?? "new"}`}>{R.property}</Label>
        <select id={`cf-p-${initial.id ?? "new"}`} className={SELECT} value={v.propertyId} onChange={(e) => set("propertyId", e.target.value)}>
          <option value="">—</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      {inp("startDate", R.startDate, { type: "date", required: true })}
      {inp("endDate", R.endDate, { type: "date" })}
      {inp("spend", R.spend, { type: "number", min: 0, step: "any", required: true })}
      {inp("leadsCount", R.leads, { type: "number", min: 0 })}
      {inp("visitsCount", R.visits, { type: "number", min: 0 })}
      {inp("closingsCount", R.closingsCount, { type: "number", min: 0 })}
      {inp("attributedRevenue", R.revenue, { type: "number", min: 0, step: "any" })}
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" loading={busy} className="bg-[#031738] hover:bg-[#04275A]">{v.id ? R.save : R.newCampaign}</Button>
        {v.id && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => deleteRealtyCampaign(v.id!), onDone)} className="text-red-600">
            <Trash2 className="h-4 w-4" />
            {R.delete}
          </Button>
        )}
      </div>
    </form>
  );
}

export function CampaignEditToggle({ initial, properties }: { initial: CampaignValues; properties: { id: string; title: string }[] }) {
  const R = useR();
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="mt-3 rounded-lg bg-[#F2F4F6] p-3">
      <CampaignForm initial={initial} properties={properties} onDone={() => setOpen(false)} />
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-[#063C82] hover:underline">{R.edit}</button>
  );
}

export function ZoneRow({ zone }: { zone: { id?: string; name: string; latitude: number | null; longitude: number | null; usage?: string } }) {
  const R = useR();
  const { busy, run } = useRun();
  const [name, setName] = useState(zone.name);
  const [lat, setLat] = useState(zone.latitude?.toString() ?? "");
  const [lng, setLng] = useState(zone.longitude?.toString() ?? "");
  const isNew = !zone.id;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveRealtyZone({ id: zone.id, name, latitude: lat === "" ? null : Number(lat), longitude: lng === "" ? null : Number(lng) }),
          () => {
            if (isNew) {
              setName("");
              setLat("");
              setLng("");
            }
          },
        );
      }}
      className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_8rem_8rem_auto]"
    >
      <div className="col-span-2 space-y-1 sm:col-span-1">
        <Label className="text-xs" htmlFor={`z-n-${zone.id ?? "new"}`}>{R.zone}</Label>
        <Input id={`z-n-${zone.id ?? "new"}`} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} placeholder={isNew ? R.addZone : undefined} />
        {zone.usage && <p className="text-[11px] text-slate-500">{zone.usage}</p>}
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`z-la-${zone.id ?? "new"}`}>{R.latitude}</Label>
        <Input id={`z-la-${zone.id ?? "new"}`} type="number" step="any" min={-90} max={90} value={lat} onChange={(e) => setLat(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`z-lo-${zone.id ?? "new"}`}>{R.longitude}</Label>
        <Input id={`z-lo-${zone.id ?? "new"}`} type="number" step="any" min={-180} max={180} value={lng} onChange={(e) => setLng(e.target.value)} />
      </div>
      <div className="col-span-2 flex gap-1.5 sm:col-span-1">
        <Button type="submit" size="sm" loading={busy} className="h-9 bg-[#031738] hover:bg-[#04275A]">{isNew ? R.addZone : R.save}</Button>
        {!isNew && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => deleteRealtyZone(zone.id!))} className="h-9 text-red-600" aria-label={R.delete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}

export function SettingsForm({ publicWhatsapp, defaultCurrency }: { publicWhatsapp: string; defaultCurrency: string }) {
  const R = useR();
  const { busy, run } = useRun();
  const [wa, setWa] = useState(publicWhatsapp);
  const [cur, setCur] = useState(defaultCurrency);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveRealtySettings({ publicWhatsapp: wa || null, defaultCurrency: cur as "MXN" }));
      }}
      className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_auto]"
    >
      <div className="space-y-1">
        <Label htmlFor="s-wa" className="text-xs">{R.publicWhatsapp}</Label>
        <Input id="s-wa" value={wa} onChange={(e) => setWa(e.target.value)} inputMode="tel" maxLength={30} placeholder="+52 81…" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="s-cur" className="text-xs">{R.defaultCurrency}</Label>
        <select id="s-cur" className={SELECT} value={cur} onChange={(e) => setCur(e.target.value)}>
          <option value="MXN">MXN</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <Button type="submit" loading={busy} className="bg-[#031738] hover:bg-[#04275A]">{R.save}</Button>
    </form>
  );
}
