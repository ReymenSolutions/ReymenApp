"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureRealtyColoniaZone, saveRealtyProspect, searchRealtyLeads } from "@/actions/realty";
import { getErrorMessage } from "@/lib/user-error";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { enumLabel, realtyStrings } from "@/lib/i18n-realty";
import { FEATURES, OPERATIONS, PROPERTY_TYPES } from "@/lib/realty/constants";
import { cn } from "@/lib/utils";

import { SELECT } from "./select";
import { AddressFields, type AddressValue } from "./AddressFields";
export { SELECT };

export interface ProspectFormValues {
  id?: string;
  leadId: string | null;
  leadLabel: string | null;
  name: string;
  phone: string;
  email: string;
  operation: string;
  propertyType: string;
  minBudget: string;
  maxBudget: string;
  currency: string;
  minBedrooms: string;
  minBathrooms: string;
  minArea: string;
  moveTimeline: string;
  financingNeeded: "" | "yes" | "no";
  preferences: string[];
  zoneIds: string[];
  branchId: string;
  advisorUserId: string;
  active: boolean;
  source: string;
}

const n = (s: string) => (s.trim() === "" ? null : Number(s));
/** "¿Cuándo se mudaría?" se guarda como fecha AAAA-MM-DD (antes era texto libre). */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function ProspectForm({
  initial,
  zones: initialZones,
  advisors,
  branches,
}: {
  initial: ProspectFormValues;
  zones: { id: string; name: string }[];
  advisors: { id: string; name: string | null; email: string }[];
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { lang } = usePreferences();
  const R = pickDict(realtyStrings, lang);
  const [v, setV] = useState(initial);
  const [zones, setZones] = useState(initialZones);
  // Colonias que todavía no son zona: se buscan por CP y se agregan (la zona es la colonia).
  const [addr, setAddr] = useState<AddressValue>({ cp: "", colonia: "", municipio: "", estado: "", street: "" });
  const [addingZone, setAddingZone] = useState(false);
  async function addColonia() {
    if (addr.colonia.trim().length < 2) return toast.error(R.chooseColonia);
    if (v.zoneIds.length >= 5) return;
    setAddingZone(true);
    try {
      const z = await ensureRealtyColoniaZone({ colonia: addr.colonia, postalCode: addr.cp || null, municipality: addr.municipio || null, state: addr.estado || null });
      setZones((zs) => (zs.some((x) => x.id === z.id) ? zs : [...zs, { id: z.id, name: z.name }]));
      setV((s) => (s.zoneIds.includes(z.id) ? s : { ...s, zoneIds: [...s.zoneIds, z.id] }));
      setAddr({ cp: "", colonia: "", municipio: "", estado: "", street: "" });
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setAddingZone(false);
    }
  }
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; phone: string | null; email: string | null }[]>([]);
  const set = <K extends keyof ProspectFormValues>(k: K, value: ProspectFormValues[K]) => setV((s) => ({ ...s, [k]: value }));
  const isEdit = !!v.id;

  async function search(term: string) {
    setQ(term);
    if (term.trim().length < 2) return setHits([]);
    try {
      setHits(await searchRealtyLeads(term));
    } catch {
      setHits([]);
    }
  }

  function moveZone(i: number, d: -1 | 1) {
    const z = [...v.zoneIds];
    const j = i + d;
    if (j < 0 || j >= z.length) return;
    [z[i], z[j]] = [z[j], z[i]];
    set("zoneIds", z);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Si eligió una colonia por CP pero no le dio "Agregar colonia", se agrega al guardar.
      let zoneIds = v.zoneIds;
      if (addr.colonia.trim().length >= 2 && zoneIds.length < 5) {
        const z = await ensureRealtyColoniaZone({ colonia: addr.colonia, postalCode: addr.cp || null, municipality: addr.municipio || null, state: addr.estado || null });
        if (!zoneIds.includes(z.id)) zoneIds = [...zoneIds, z.id];
      }
      const res = await saveRealtyProspect({
        id: v.id,
        leadId: v.leadId,
        name: v.leadId ? null : v.name || null,
        phone: v.leadId ? null : v.phone || null,
        email: v.leadId ? null : v.email || null,
        operation: v.operation,
        propertyType: v.propertyType || null,
        minBudget: n(v.minBudget),
        maxBudget: Number(v.maxBudget),
        currency: v.currency as "MXN" | "USD",
        minBedrooms: n(v.minBedrooms),
        minBathrooms: n(v.minBathrooms),
        minArea: n(v.minArea),
        moveTimeline: v.moveTimeline || null,
        financingNeeded: v.financingNeeded === "" ? null : v.financingNeeded === "yes",
        preferences: v.preferences as never,
        zoneIds,
        branchId: v.branchId || null,
        advisorUserId: v.advisorUserId || null,
        active: v.active,
        source: v.source || null,
      });
      toast.success(R.saved);
      router.push(`/portal/realty/prospects/${res.id}`);
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setSaving(false);
    }
  }

  const zoneName = new Map(zones.map((z) => [z.id, z.name]));

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-slate-900">{R.contact}</legend>
        <p className="mb-3 text-xs text-slate-500">{R.crmContactNote}</p>
        {v.leadId ? (
          <div className="flex items-center justify-between gap-2 rounded-md bg-[#F2F4F6] px-3 py-2 text-sm">
            <span className="font-medium text-slate-900">{v.leadLabel}</span>
            <button type="button" onClick={() => setV((s) => ({ ...s, leadId: null, leadLabel: null }))} className="text-slate-500 hover:text-slate-800" aria-label={R.cancel}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Label htmlFor="lead-q">{R.existingLead}</Label>
              <Input id="lead-q" value={q} onChange={(e) => search(e.target.value)} placeholder={`${R.search}…`} autoComplete="off" />
              {hits.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => {
                          setV((s) => ({ ...s, leadId: h.id, leadLabel: [h.name, h.phone].filter(Boolean).join(" · ") }));
                          setHits([]);
                          setQ("");
                        }}
                      >
                        <span className="font-medium">{h.name}</span> <span className="text-xs text-slate-500">{h.phone ?? h.email ?? ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {!isEdit && (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{R.orNewContact}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="p-name">{R.name}</Label>
                    <Input id="p-name" value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-phone">{R.phone}</Label>
                    <Input id="p-phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" maxLength={30} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-email">{R.email}</Label>
                    <Input id="p-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} maxLength={160} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-slate-900">{R.lookingFor}</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-op">{R.operation}</Label>
            <select id="p-op" className={SELECT} value={v.operation} onChange={(e) => set("operation", e.target.value)}>
              {OPERATIONS.map((o) => (
                <option key={o} value={o}>{enumLabel(R, "opBuy", o)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-type">{R.type}</Label>
            <select id="p-type" className={SELECT} value={v.propertyType} onChange={(e) => set("propertyType", e.target.value)}>
              <option value="">{R.any}</option>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>{enumLabel(R, "type", t)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-min">{R.minBudget}</Label>
            <Input id="p-min" type="number" min={0} step="any" value={v.minBudget} onChange={(e) => set("minBudget", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-max">{R.maxBudget} *</Label>
            <Input id="p-max" type="number" min={1} step="any" required value={v.maxBudget} onChange={(e) => set("maxBudget", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-beds">{R.minBedrooms}</Label>
            <Input id="p-beds" type="number" min={0} max={50} value={v.minBedrooms} onChange={(e) => set("minBedrooms", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-baths">{R.minBathrooms}</Label>
            <Input id="p-baths" type="number" min={0} max={50} step="0.5" value={v.minBathrooms} onChange={(e) => set("minBathrooms", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-area">{R.minArea}</Label>
            <Input id="p-area" type="number" min={0} value={v.minArea} onChange={(e) => set("minArea", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-cur">{R.currency}</Label>
            <select id="p-cur" className={SELECT} value={v.currency} onChange={(e) => set("currency", e.target.value)}>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          <Label>{R.zones}</Label>
          <p className="mb-2 text-xs text-slate-500">{R.zonesHint}</p>
          {v.zoneIds.length === 0 && <p className="mb-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{R.zonesNone}</p>}
          <ol className="mb-2 space-y-1.5">
            {v.zoneIds.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-[#F2F4F6] px-2 py-1.5 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#031738] text-[11px] font-bold text-white">{i + 1}</span>
                <span className="flex-1 font-medium">{zoneName.get(id)}</span>
                <button type="button" onClick={() => moveZone(i, -1)} disabled={i === 0} className="p-1 text-slate-500 disabled:opacity-30" aria-label="↑"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => moveZone(i, 1)} disabled={i === v.zoneIds.length - 1} className="p-1 text-slate-500 disabled:opacity-30" aria-label="↓"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => set("zoneIds", v.zoneIds.filter((z) => z !== id))} className="p-1 text-slate-500" aria-label={R.delete}><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ol>
          {zones.some((z) => !v.zoneIds.includes(z.id)) && <p className="mb-1.5 text-xs text-slate-500">{R.zonesSuggested}</p>}
          <div className="flex flex-wrap gap-1.5">
            {zones
              .filter((z) => !v.zoneIds.includes(z.id))
              .map((z) => (
                <button key={z.id} type="button" disabled={v.zoneIds.length >= 5} onClick={() => set("zoneIds", [...v.zoneIds, z.id])} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:border-[#063C82] disabled:opacity-40">
                  + {z.name}
                </button>
              ))}
          </div>
          {v.zoneIds.length < 5 && (
            <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-3">
              <p className="mb-2 text-xs font-medium text-slate-600">{R.addColoniaTitle}</p>
              <AddressFields idPrefix="pz" value={addr} onChange={(p) => setAddr((a) => ({ ...a, ...p }))} withStreet={false} />
              <Button type="button" size="sm" variant="outline" className="mt-2" loading={addingZone} disabled={addr.colonia.trim().length < 2} onClick={addColonia}>
                {R.addColonia}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-5">
          <Label>{R.preferences}</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FEATURES.map((f) => {
              const on = v.preferences.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("preferences", on ? v.preferences.filter((x) => x !== f) : [...v.preferences, f])}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium", on ? "border-[#031738] bg-[#031738] text-white" : "border-slate-200 text-slate-700 hover:border-[#063C82]")}
                >
                  {enumLabel(R, "feat", f)}
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-card border border-slate-200 bg-white p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-slate-900">{R.prospectProfile}</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="p-time">{R.moveTimeline}</Label>
            <Input
              id="p-time"
              type="date"
              value={ISO_DATE.test(v.moveTimeline) ? v.moveTimeline : ""}
              onChange={(e) => set("moveTimeline", e.target.value)}
            />
            {v.moveTimeline && !ISO_DATE.test(v.moveTimeline) && <p className="text-xs text-slate-500">{R.moveTimelineBefore(v.moveTimeline)}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-fin">{R.financing}</Label>
            <select id="p-fin" className={SELECT} value={v.financingNeeded} onChange={(e) => set("financingNeeded", e.target.value as ProspectFormValues["financingNeeded"])}>
              <option value="">—</option>
              <option value="yes">{R.yes}</option>
              <option value="no">{R.no}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-src">{R.source}</Label>
            <Input id="p-src" value={v.source} onChange={(e) => set("source", e.target.value)} maxLength={60} placeholder="SmartCard, Meta, Referido…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-adv">{R.advisor}</Label>
            <select id="p-adv" className={SELECT} value={v.advisorUserId} onChange={(e) => set("advisorUserId", e.target.value)}>
              <option value="">—</option>
              {advisors.map((a) => (
                <option key={a.id} value={a.id}>{a.name ?? a.email}</option>
              ))}
            </select>
          </div>
          {branches.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="p-br">{R.branch}</Label>
              <select id="p-br" className={SELECT} value={v.branchId} onChange={(e) => set("branchId", e.target.value)}>
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            {R.active}
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
