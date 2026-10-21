"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { scheduleRealtyVisit, updateRealtyVisit } from "@/actions/realty";
import { getErrorMessage } from "@/lib/user-error";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { enumLabel, realtyStrings } from "@/lib/i18n-realty";
import { SELECT } from "./ProspectForm";

/** Agenda una visita: crea la cita del CRM y la liga a la propiedad. */
export function VisitForm({
  properties,
  prospects,
  advisors,
  defaultPropertyId,
  defaultProfileId,
  defaultAdvisorId,
}: {
  properties: { id: string; title: string }[];
  prospects: { id: string; name: string }[];
  advisors: { id: string; name: string | null; email: string }[];
  defaultPropertyId?: string;
  defaultProfileId?: string;
  defaultAdvisorId?: string;
}) {
  const router = useRouter();
  const { lang } = usePreferences();
  const R = pickDict(realtyStrings, lang);
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? properties[0]?.id ?? "");
  const [profileId, setProfileId] = useState(defaultProfileId ?? "");
  const [advisorUserId, setAdvisor] = useState(defaultAdvisorId ?? "");
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("45");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!when) return;
    setSaving(true);
    try {
      await scheduleRealtyVisit({ propertyId, profileId: profileId || null, advisorUserId: advisorUserId || null, startTime: new Date(when).toISOString(), durationMinutes: Number(duration), notes: notes || null });
      toast.success(R.saved);
      setWhen("");
      setNotes("");
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {!defaultPropertyId && (
        <div className="space-y-1.5">
          <Label htmlFor="v-prop">{R.property}</Label>
          <select id="v-prop" className={SELECT} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      )}
      {!defaultProfileId && (
        <div className="space-y-1.5">
          <Label htmlFor="v-prof">{R.prospect}</Label>
          <select id="v-prof" className={SELECT} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">—</option>
            {prospects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="v-adv">{R.advisor}</Label>
        <select id="v-adv" className={SELECT} value={advisorUserId} onChange={(e) => setAdvisor(e.target.value)}>
          <option value="">—</option>
          {advisors.map((a) => (
            <option key={a.id} value={a.id}>{a.name ?? a.email}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="v-when">{R.when}</Label>
        <Input id="v-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="v-dur">{R.duration}</Label>
        <Input id="v-dur" type="number" min={15} max={480} step={15} value={duration} onChange={(e) => setDuration(e.target.value)} />
      </div>
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
        <Label htmlFor="v-notes">{R.notes}</Label>
        <Input id="v-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
      </div>
      <div className="flex items-end sm:col-span-2 lg:col-span-3">
        <Button type="submit" loading={saving} disabled={!propertyId} className="bg-[#031738] hover:bg-[#04275A]">{R.newVisit}</Button>
      </div>
    </form>
  );
}

const NEXT: Record<string, ("CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED")[]> = {
  SCHEDULED: ["CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "NO_SHOW", "CANCELLED"],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

/** Cambia el estado de la cita (y anota el resultado) desde la lista de visitas. */
export function VisitActions({ visitId, status, outcome }: { visitId: string; status: string; outcome: string | null }) {
  const router = useRouter();
  const { lang } = usePreferences();
  const R = pickDict(realtyStrings, lang);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(outcome ?? "");
  const options = NEXT[status] ?? [];

  async function apply(next: string) {
    setBusy(true);
    try {
      await updateRealtyVisit({ visitId, status: next as never, outcome: text || null });
      toast.success(R.saved);
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={R.outcome} className="h-8 w-44 rounded-md border border-slate-200 px-2 text-xs" maxLength={1000} />
      {options.length === 0 ? (
        <button type="button" disabled={busy} onClick={() => apply(status)} className="h-8 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50">{R.save}</button>
      ) : (
        options.map((o) => (
          <button key={o} type="button" disabled={busy} onClick={() => apply(o)} className="h-8 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:border-[#063C82] hover:bg-slate-50">
            {enumLabel(R, "ap", o)}
          </button>
        ))
      )}
    </div>
  );
}
