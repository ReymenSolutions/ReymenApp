"use client";

// Interacción de la landing pública: registra la vista (una vez) y los clics
// en WhatsApp / agendar / compartir con navigator.sendBeacon. Sin cookies ni
// datos personales; el origen viene de ?src= (smartcard, qr, meta…).

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, CheckCircle2, MessageCircle, Share2 } from "lucide-react";

type EventName = "property_view" | "whatsapp_click" | "schedule_click" | "share_click";

function send(slug: string, event: EventName, src: string | null, campaign: string | null) {
  const body = JSON.stringify({ slug, event, src, campaign });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/realty/public/events", new Blob([body], { type: "text/plain" }))) return;
  } catch {
    /* sigue con fetch */
  }
  fetch("/api/realty/public/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

function useSource() {
  const [s, setS] = useState<{ src: string | null; campaign: string | null }>({ src: null, campaign: null });
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // Se resuelve en el navegador para que la página pueda servirse igual a todos.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setS({ src: p.get("src") ?? p.get("utm_source"), campaign: p.get("c") });
  }, []);
  return s;
}

export function ViewTracker({ slug }: { slug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const p = new URLSearchParams(window.location.search);
    send(slug, "property_view", p.get("src") ?? p.get("utm_source"), p.get("c"));
  }, [slug]);
  return null;
}

export function PublicCtas({
  slug,
  whatsapp,
  title,
  labels,
}: {
  slug: string;
  whatsapp: string | null;
  title: string;
  labels: { whatsapp: string; schedule: string; share: string; whatsappMsg: string; scheduleMsg: string; noContact: string; copied: string };
}) {
  const { src, campaign } = useSource();
  const [copied, setCopied] = useState(false);
  const digits = whatsapp?.replace(/\D/g, "") ?? "";
  const wa = (text: string) => `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

  async function share() {
    send(slug, "share_click", src, campaign);
    const url = window.location.origin + window.location.pathname;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* el usuario canceló */
    }
  }

  return (
    <div className="space-y-2">
      {digits ? (
        <>
          <a href={wa(labels.whatsappMsg)} target="_blank" rel="noreferrer" onClick={() => send(slug, "whatsapp_click", src, campaign)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] text-base font-bold text-[#080C13] shadow-sm hover:bg-[#16a34a]">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            {labels.whatsapp}
          </a>
          <a href={wa(labels.scheduleMsg)} target="_blank" rel="noreferrer" onClick={() => send(slug, "schedule_click", src, campaign)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#031738] text-base font-semibold text-white hover:bg-[#04275A]">
            <CalendarCheck className="h-5 w-5" aria-hidden="true" />
            {labels.schedule}
          </a>
        </>
      ) : (
        <p className="rounded-xl bg-[#F2F4F6] p-3 text-center text-sm text-slate-600">{labels.noContact}</p>
      )}
      <button type="button" onClick={share} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-[#031738] hover:bg-slate-50">
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {copied ? labels.copied : labels.share}
      </button>
    </div>
  );
}

export interface InquiryLabels {
  title: string;
  intro: string;
  name: string;
  phone: string;
  operation: string;
  buy: string;
  rent: string;
  type: string;
  budgetSale: string;
  budgetRent: string;
  place: string;
  consent: string;
  submit: string;
  sending: string;
  doneTitle: string;
  doneBody: string;
  doneNotSaved: string;
  whatsapp: string;
  whatsappMsg: string;
  errors: Record<"phone_invalid" | "postal_not_found" | "postal_ambiguous" | "place_invalid" | "unavailable" | "rate_limited" | "generic", string>;
}

const INPUT = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#080C13] placeholder:text-slate-400 focus:border-[#063C82] focus:outline-none focus:ring-2 focus:ring-[#063C82]/30";

/**
 * «Quiero informes»: la persona deja WhatsApp, operación, tipo, presupuesto y colonia/CP (ya precargados con lo de la
 * propiedad) y entra al CRM como prospecto. Los botones de WhatsApp de abajo siguen disponibles: esto no los bloquea.
 */
export function InquiryForm({
  slug,
  whatsapp,
  initial,
  typeOptions,
  labels,
}: {
  slug: string;
  whatsapp: string | null;
  initial: { operation: "SALE" | "RENT"; propertyType: string; budget: number; place: string };
  typeOptions: { value: string; label: string }[];
  labels: InquiryLabels;
}) {
  const { src, campaign } = useSource();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [operation, setOperation] = useState(initial.operation);
  const [propertyType, setPropertyType] = useState(initial.propertyType);
  const [budget, setBudget] = useState(String(initial.budget));
  const [place, setPlace] = useState(initial.place);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "notSaved">("idle");
  const [error, setError] = useState<string | null>(null);
  const digits = whatsapp?.replace(/\D/g, "") ?? "";
  const budgetNumber = Number(budget.replace(/\D/g, "")) || 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setError(null);
    setStatus("sending");
    try {
      const res = await fetch("/api/realty/public/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, phone, operation, propertyType, maxBudget: budgetNumber, place, consent, website, src, campaign }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; saved?: boolean; error?: string; fields?: string[] };
      if (res.ok && data.success) {
        setStatus(data.saved === false ? "notSaved" : "done");
        return;
      }
      setStatus("idle");
      if (res.status === 429) setError(labels.errors.rate_limited);
      else if (data.error === "invalid") setError(data.fields?.includes("phone") ? labels.errors.phone_invalid : data.fields?.includes("place") ? labels.errors.place_invalid : labels.errors.generic);
      else setError((labels.errors as Record<string, string>)[data.error ?? ""] ?? labels.errors.generic);
    } catch {
      setStatus("idle");
      setError(labels.errors.generic);
    }
  }

  if (status === "done" || status === "notSaved") {
    return (
      <div role="status" className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-[#22C55E]" aria-hidden="true" />
        <p className="text-lg font-bold text-[#080C13]">{status === "done" ? labels.doneTitle : labels.title}</p>
        <p className="text-sm text-slate-600">{status === "done" ? labels.doneBody : labels.doneNotSaved}</p>
        {digits && (
          <a href={`https://wa.me/${digits}?text=${encodeURIComponent(labels.whatsappMsg)}`} target="_blank" rel="noreferrer" onClick={() => send(slug, "whatsapp_click", src, campaign)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] text-base font-bold text-[#080C13] shadow-sm hover:bg-[#16a34a]">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            {labels.whatsapp}
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div>
        <h2 className="text-base font-bold text-[#080C13]">{labels.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{labels.intro}</p>
      </div>
      <div>
        <label htmlFor="inq-name" className="mb-1 block text-sm font-medium text-slate-700">{labels.name}</label>
        <input id="inq-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} className={INPUT} />
      </div>
      <div>
        <label htmlFor="inq-phone" className="mb-1 block text-sm font-medium text-slate-700">{labels.phone}</label>
        <input id="inq-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required maxLength={30} placeholder="81 1234 5678" className={INPUT} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="inq-op" className="mb-1 block text-sm font-medium text-slate-700">{labels.operation}</label>
          <select id="inq-op" value={operation} onChange={(e) => setOperation(e.target.value as "SALE" | "RENT")} className={INPUT}>
            <option value="SALE">{labels.buy}</option>
            <option value="RENT">{labels.rent}</option>
          </select>
        </div>
        <div>
          <label htmlFor="inq-type" className="mb-1 block text-sm font-medium text-slate-700">{labels.type}</label>
          <select id="inq-type" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className={INPUT}>
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="inq-budget" className="mb-1 block text-sm font-medium text-slate-700">{operation === "RENT" ? labels.budgetRent : labels.budgetSale}</label>
        <input id="inq-budget" inputMode="numeric" value={budgetNumber ? budgetNumber.toLocaleString("es-MX") : ""} onChange={(e) => setBudget(e.target.value)} required className={INPUT} />
      </div>
      <div>
        <label htmlFor="inq-place" className="mb-1 block text-sm font-medium text-slate-700">{labels.place}</label>
        <input id="inq-place" value={place} onChange={(e) => setPlace(e.target.value)} required minLength={2} maxLength={80} className={INPUT} />
      </div>
      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{labels.consent}</span>
      </label>
      {/* Campo trampa: fuera de pantalla y sin foco; las personas no lo llenan. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={status === "sending" || !consent || name.trim().length < 2 || !phone.trim() || !budgetNumber || place.trim().length < 2} className="flex h-12 w-full items-center justify-center rounded-xl bg-[#031738] text-base font-semibold text-white hover:bg-[#04275A] disabled:cursor-not-allowed disabled:opacity-50">
        {status === "sending" ? labels.sending : labels.submit}
      </button>
    </form>
  );
}
