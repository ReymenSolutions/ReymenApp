"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enrollInLoyaltyProgram } from "@/actions/loyalty-public";
import { getErrorMessage } from "@/lib/user-error";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { memberCardPath } from "@/lib/loyalty/token";

/** Formulario público de inscripción: nombre, WhatsApp y CP (correo opcional). Pensado para el celular. */
export function EnrollForm({ orgSlug, businessName, branch, programId }: { programId?: string; orgSlug: string; businessName: string; branch: string | null }) {
  const router = useRouter();
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const [form, setForm] = useState({ name: "", whatsapp: "", postalCode: "", email: "", consent: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [already, setAlready] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await enrollInLoyaltyProgram({ orgSlug, programId, ...form, email: form.email || undefined, branch: branch ?? undefined });
      if (res.status === "created") {
        router.push(memberCardPath(orgSlug, res.token));
        return;
      }
      setAlready(true);
    } catch (err) {
      setError(getErrorMessage(err, lang === "es" ? "No se pudo completar el registro." : "Couldn't complete sign-up."));
    }
    setLoading(false);
  }

  if (already) {
    return (
      <div className="rounded-xl bg-amber-50 p-5 text-center" role="status">
        <p className="font-semibold text-amber-900">{L.alreadyEnrolledTitle}</p>
        <p className="mt-1 text-sm text-amber-800">{L.alreadyEnrolledDesc}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate={false}>
      <div className="space-y-1.5">
        <Label htmlFor="e-name">{L.fieldName}</Label>
        <Input id="e-name" required minLength={2} maxLength={80} autoComplete="given-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={L.fieldNamePh} className="h-12 text-base" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-wa">{L.fieldWhatsapp}</Label>
        <Input id="e-wa" required type="tel" inputMode="tel" autoComplete="tel-national" maxLength={20} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder={L.fieldWhatsappPh} className="h-12 text-base" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-cp">{L.fieldPostalCode}</Label>
        <Input
          id="e-cp"
          required
          inputMode="numeric"
          autoComplete="postal-code"
          pattern="\d{5}"
          maxLength={5}
          value={form.postalCode}
          onChange={(e) => setForm({ ...form, postalCode: e.target.value.replace(/\D/g, "").slice(0, 5) })}
          placeholder={L.fieldPostalCodePh}
          className="h-12 text-base"
          aria-describedby="e-cp-hint"
        />
        <p id="e-cp-hint" className="text-xs text-slate-500">{L.fieldPostalCodeHint}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-mail">{L.fieldEmail}</Label>
        <Input id="e-mail" type="email" autoComplete="email" maxLength={160} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-12 text-base" />
      </div>
      <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        <input type="checkbox" required checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
        <span>{L.consentLabel(businessName)}</span>
      </label>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <Button type="submit" loading={loading} className="h-12 w-full bg-orange-500 text-base font-semibold hover:bg-orange-600">
        {loading ? L.joining : L.joinCta}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {L.poweredBy}
      </p>
    </form>
  );
}
