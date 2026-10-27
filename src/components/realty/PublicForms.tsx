"use client";

// Formularios de la landing pública (siempre con tokens --rl-*, legibles en claro y oscuro): «Agendar visita» (entra a
// Citas) y «Pedir informes» (entra al CRM como prospecto), más el panel de acciones con pestañas, WhatsApp y compartir.
// Los campos de texto salen vacíos con un ejemplo como placeholder; nada se llena por la persona.

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, CheckCircle2, Loader2, MessageCircle, Share2 } from "lucide-react";
import { send, useSource } from "./PublicLanding";

const CARD = "rounded-2xl border border-[var(--rl-line)] bg-[var(--rl-surface)] shadow-[var(--rl-shadow)]";
const INPUT = "h-12 w-full rounded-xl border border-[var(--rl-line)] bg-[var(--rl-input)] px-3.5 text-base text-[var(--rl-ink)] placeholder:text-[var(--rl-placeholder)] focus:border-[var(--rl-brand)] focus:outline-none focus:ring-4 focus:ring-[var(--rl-ring)]";
const LABEL = "mb-1.5 block text-sm font-medium text-[var(--rl-ink)]";
const BTN = "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--rl-brand)] text-base font-semibold text-[var(--rl-brand-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_WA = "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#22C55E] text-base font-bold text-[#052E14] transition hover:bg-[#16a34a]";
const ERR = "rounded-xl bg-[var(--rl-danger-bg)] px-3 py-2 text-sm font-medium text-[var(--rl-danger)]";

type ErrorKey = "phone_invalid" | "postal_not_found" | "postal_ambiguous" | "place_invalid" | "unavailable" | "rate_limited" | "generic" | "slot_unavailable" | "date_invalid";

function waLink(digits: string, text: string) {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
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
  placeholders: { name: string; phone: string; budgetSale: string; budgetRent: string; place: string };
  errors: Record<ErrorKey, string>;
}

/**
 * «Pedir informes»: WhatsApp, compra/renta, tipo, presupuesto y colonia o CP. Compra/renta y tipo arrancan con lo de la
 * propiedad (son listas, no texto editable); lo demás empieza vacío, con un ejemplo de placeholder.
 */
export function InquiryForm({
  slug,
  whatsapp,
  initial,
  typeOptions,
  labels,
  onDone,
}: {
  slug: string;
  whatsapp: string | null;
  initial: { operation: "SALE" | "RENT"; propertyType: string };
  typeOptions: { value: string; label: string }[];
  labels: InquiryLabels;
  /** Se avisa al terminar (el panel esconde su WhatsApp genérico: la confirmación ya trae el suyo). */
  onDone?: () => void;
}) {
  const { src, campaign } = useSource();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [operation, setOperation] = useState(initial.operation);
  const [propertyType, setPropertyType] = useState(initial.propertyType);
  const [budget, setBudget] = useState("");
  const [place, setPlace] = useState("");
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
        onDone?.();
        return;
      }
      setStatus("idle");
      if (res.status === 429) setError(labels.errors.rate_limited);
      else if (data.error === "invalid") setError(data.fields?.includes("phone") ? labels.errors.phone_invalid : data.fields?.includes("place") ? labels.errors.place_invalid : labels.errors.generic);
      else setError(labels.errors[(data.error ?? "") as ErrorKey] ?? labels.errors.generic);
    } catch {
      setStatus("idle");
      setError(labels.errors.generic);
    }
  }

  if (status === "done" || status === "notSaved") {
    return (
      <div role="status" className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--rl-ok)]" aria-hidden="true" />
        <p className="text-lg font-bold text-[var(--rl-ink)]">{status === "done" ? labels.doneTitle : labels.title}</p>
        <p className="text-sm text-[var(--rl-muted)]">{status === "done" ? labels.doneBody : labels.doneNotSaved}</p>
        {digits && (
          <a href={waLink(digits, labels.whatsappMsg)} target="_blank" rel="noreferrer" onClick={() => send(slug, "whatsapp_click", src, campaign)} className={BTN_WA}>
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            {labels.whatsapp}
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-[var(--rl-muted)]">{labels.intro}</p>
      <div>
        <label htmlFor="inq-name" className={LABEL}>{labels.name}</label>
        <input id="inq-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} placeholder={labels.placeholders.name} className={INPUT} />
      </div>
      <div>
        <label htmlFor="inq-phone" className={LABEL}>{labels.phone}</label>
        <input id="inq-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required maxLength={30} placeholder={labels.placeholders.phone} className={INPUT} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="inq-op" className={LABEL}>{labels.operation}</label>
          <select id="inq-op" value={operation} onChange={(e) => setOperation(e.target.value as "SALE" | "RENT")} className={INPUT}>
            <option value="SALE">{labels.buy}</option>
            <option value="RENT">{labels.rent}</option>
          </select>
        </div>
        <div>
          <label htmlFor="inq-type" className={LABEL}>{labels.type}</label>
          <select id="inq-type" value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className={INPUT}>
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="inq-budget" className={LABEL}>{operation === "RENT" ? labels.budgetRent : labels.budgetSale}</label>
        <input id="inq-budget" inputMode="numeric" value={budgetNumber ? budgetNumber.toLocaleString("es-MX") : ""} onChange={(e) => setBudget(e.target.value)} required placeholder={operation === "RENT" ? labels.placeholders.budgetRent : labels.placeholders.budgetSale} className={INPUT} />
      </div>
      <div>
        <label htmlFor="inq-place" className={LABEL}>{labels.place}</label>
        <input id="inq-place" value={place} onChange={(e) => setPlace(e.target.value)} required minLength={2} maxLength={80} placeholder={labels.placeholders.place} className={INPUT} />
      </div>
      <label className="flex items-start gap-2.5 text-xs text-[var(--rl-muted)]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--rl-brand)]" />
        <span>{labels.consent}</span>
      </label>
      {/* Campo trampa: fuera de pantalla y sin foco; las personas no lo llenan. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
      </div>
      {error && <p role="alert" className={ERR}>{error}</p>}
      <button type="submit" disabled={status === "sending" || !consent || name.trim().length < 2 || !phone.trim() || !budgetNumber || place.trim().length < 2} className={BTN}>
        {status === "sending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {status === "sending" ? labels.sending : labels.submit}
      </button>
    </form>
  );
}

export interface VisitLabels {
  intro: string;
  name: string;
  phone: string;
  date: string;
  pickDay: string;
  loading: string;
  noSlots: string;
  times: string;
  notes: string;
  consent: string;
  submit: string;
  sending: string;
  doneTitle: string;
  /** El texto de «Pediste visitar el …»: el día y la hora se ponen en el navegador (zona del negocio). */
  doneBodyTemplate: string;
  doneNote: string;
  whatsapp: string;
  /** Mensaje de WhatsApp con marcador {when}. */
  whatsappMsgTemplate: string;
  placeholders: { name: string; phone: string; notes: string };
  errors: Record<ErrorKey, string>;
}

/** «Agendar visita»: día → horarios libres de la Agenda del negocio → solicitud que entra a Citas. */
export function VisitForm({
  slug,
  whatsapp,
  locale,
  minDate,
  maxDate,
  labels,
  onDone,
}: {
  slug: string;
  whatsapp: string | null;
  locale: "es-MX" | "en-US";
  /** Primer y último día elegibles (YYYY-MM-DD, hora del negocio). */
  minDate: string;
  maxDate: string;
  labels: VisitLabels;
  onDone?: () => void;
}) {
  const { src, campaign } = useSource();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [tz, setTz] = useState("America/Mexico_City");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const reqId = useRef(0);
  const digits = whatsapp?.replace(/\D/g, "") ?? "";

  const timeFmt = (iso: string, zone = tz) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(iso));
  const whenFmt = (iso: string, zone = tz) => new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: zone }).format(new Date(iso));

  async function loadSlots(day: string, keepError = false) {
    const id = ++reqId.current;
    setSlots(null);
    setSlot(null);
    if (!day) return;
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/realty/public/visit-slots?slug=${encodeURIComponent(slug)}&date=${encodeURIComponent(day)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { timezone?: string; slots?: string[]; error?: string };
      if (id !== reqId.current) return;
      if (res.ok && data.slots) {
        if (!keepError) setError(null);
        setTz(data.timezone ?? "America/Mexico_City");
        setSlots(data.slots);
      } else {
        setSlots([]);
        setError(data.error === "date_invalid" ? labels.errors.date_invalid : labels.errors.generic);
      }
    } catch {
      if (id === reqId.current) {
        setSlots([]);
        setError(labels.errors.generic);
      }
    } finally {
      if (id === reqId.current) setLoadingSlots(false);
    }
  }

  // Si cambia el día se vuelven a pedir los horarios.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSlots(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending" || !slot) return;
    setError(null);
    setStatus("sending");
    send(slug, "schedule_click", src, campaign);
    try {
      const res = await fetch("/api/realty/public/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name, phone, startsAt: slot, notes: notes.trim() || undefined, consent, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; startsAt?: string; error?: string; fields?: string[] };
      if (res.ok && data.success) {
        setDoneAt(data.startsAt ?? slot);
        setStatus("done");
        onDone?.();
        return;
      }
      setStatus("idle");
      if (res.status === 429) setError(labels.errors.rate_limited);
      else if (data.error === "slot_unavailable") {
        setError(labels.errors.slot_unavailable);
        void loadSlots(date, true);
      } else if (data.error === "invalid") setError(data.fields?.includes("phone") ? labels.errors.phone_invalid : labels.errors.generic);
      else setError(labels.errors[(data.error ?? "") as ErrorKey] ?? labels.errors.generic);
    } catch {
      setStatus("idle");
      setError(labels.errors.generic);
    }
  }

  if (status === "done" && doneAt) {
    const when = whenFmt(doneAt);
    return (
      <div role="status" className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--rl-ok)]" aria-hidden="true" />
        <p className="text-lg font-bold text-[var(--rl-ink)]">{labels.doneTitle}</p>
        <p className="text-sm text-[var(--rl-ink)]">{labels.doneBodyTemplate.replace("{when}", when)}</p>
        <p className="text-xs text-[var(--rl-muted)]">{labels.doneNote}</p>
        {digits && (
          <a href={waLink(digits, labels.whatsappMsgTemplate.replace("{when}", when))} target="_blank" rel="noreferrer" onClick={() => send(slug, "whatsapp_click", src, campaign)} className={BTN_WA}>
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            {labels.whatsapp}
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="text-sm text-[var(--rl-muted)]">{labels.intro}</p>
      <div>
        <label htmlFor="vis-date" className={LABEL}>{labels.date}</label>
        <input id="vis-date" type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} className={INPUT} />
      </div>
      <div aria-live="polite">
        {!date && <p className="text-sm text-[var(--rl-muted)]">{labels.pickDay}</p>}
        {date && loadingSlots && <p className="flex items-center gap-2 text-sm text-[var(--rl-muted)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{labels.loading}</p>}
        {date && !loadingSlots && slots && slots.length === 0 && <p className="text-sm text-[var(--rl-muted)]">{labels.noSlots}</p>}
        {date && !loadingSlots && slots && slots.length > 0 && (
          <fieldset>
            <legend className={LABEL}>{labels.times}</legend>
            <div className="grid grid-cols-3 gap-2">
              {slots.map((s) => {
                const active = slot === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    aria-pressed={active}
                    className={`h-11 rounded-xl border text-sm font-semibold transition ${active ? "border-[var(--rl-brand)] bg-[var(--rl-brand)] text-[var(--rl-brand-ink)]" : "border-[var(--rl-line)] bg-[var(--rl-input)] text-[var(--rl-ink)] hover:border-[var(--rl-brand)]"}`}
                  >
                    {timeFmt(s)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
      <div>
        <label htmlFor="vis-name" className={LABEL}>{labels.name}</label>
        <input id="vis-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} placeholder={labels.placeholders.name} className={INPUT} />
      </div>
      <div>
        <label htmlFor="vis-phone" className={LABEL}>{labels.phone}</label>
        <input id="vis-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required maxLength={30} placeholder={labels.placeholders.phone} className={INPUT} />
      </div>
      <div>
        <label htmlFor="vis-notes" className={LABEL}>{labels.notes}</label>
        <textarea id="vis-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} rows={2} placeholder={labels.placeholders.notes} className={`${INPUT} h-auto py-3`} />
      </div>
      <label className="flex items-start gap-2.5 text-xs text-[var(--rl-muted)]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--rl-brand)]" />
        <span>{labels.consent}</span>
      </label>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
      </div>
      {error && <p role="alert" className={ERR}>{error}</p>}
      <button type="submit" disabled={status === "sending" || !slot || !consent || name.trim().length < 2 || !phone.trim()} className={BTN}>
        {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CalendarCheck className="h-5 w-5" aria-hidden="true" />}
        {status === "sending" ? labels.sending : labels.submit}
      </button>
    </form>
  );
}

export interface ActionPanelLabels {
  tabs: string;
  tabVisit: string;
  tabInfo: string;
  advisor: string;
  whatsapp: string;
  whatsappMsg: string;
  share: string;
  copied: string;
  noContact: string;
  or: string;
}

/**
 * Tarjeta de acciones: pestañas «Agendar visita» / «Pedir informes», WhatsApp directo y compartir. En el celular además
 * hay una barra fija abajo con las dos acciones principales, que abren la pestaña correspondiente.
 */
export function ActionPanel({
  slug,
  title,
  whatsapp,
  agentName,
  labels,
  visit,
  inquiry,
}: {
  slug: string;
  title: string;
  whatsapp: string | null;
  agentName: string | null;
  labels: ActionPanelLabels;
  visit: Omit<Parameters<typeof VisitForm>[0], "slug" | "whatsapp">;
  inquiry: Omit<Parameters<typeof InquiryForm>[0], "slug" | "whatsapp">;
}) {
  const { src, campaign } = useSource();
  const [tab, setTab] = useState<"visit" | "info">("visit");
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const digits = whatsapp?.replace(/\D/g, "") ?? "";

  function open(next: "visit" | "info") {
    setTab(next);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
      /* la persona canceló */
    }
  }

  return (
    <>
      <div ref={panelRef} id="acciones" className={`${CARD} relative scroll-mt-4 p-4 sm:p-5`}>
        {agentName && (
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--rl-brand)] text-sm font-bold text-[var(--rl-brand-ink)]" aria-hidden="true">{agentName.trim().slice(0, 1).toUpperCase()}</span>
            <p className="text-sm text-[var(--rl-muted)]">
              {labels.advisor}
              <strong className="block text-base text-[var(--rl-ink)]">{agentName}</strong>
            </p>
          </div>
        )}
        <div role="tablist" aria-label={labels.tabs} className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-[var(--rl-surface-2)] p-1">
          {([["visit", labels.tabVisit], ["info", labels.tabInfo]] as const).map(([key, text]) => (
            <button key={key} id={`tab-${key}`} role="tab" type="button" aria-selected={tab === key} aria-controls={`panel-${key}`} onClick={() => setTab(key)} className={`h-10 rounded-lg text-sm font-semibold transition ${tab === key ? "bg-[var(--rl-surface)] text-[var(--rl-ink)] shadow-sm" : "text-[var(--rl-muted)] hover:text-[var(--rl-ink)]"}`}>
              {text}
            </button>
          ))}
        </div>
        <div id="panel-visit" role="tabpanel" aria-labelledby="tab-visit" hidden={tab !== "visit"}>
          <VisitForm slug={slug} whatsapp={whatsapp} onDone={() => setDone(true)} {...visit} />
        </div>
        <div id="panel-info" role="tabpanel" aria-labelledby="tab-info" hidden={tab !== "info"}>
          <InquiryForm slug={slug} whatsapp={whatsapp} onDone={() => setDone(true)} {...inquiry} />
        </div>

        {!done && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-[var(--rl-muted)]" aria-hidden="true">
              <span className="h-px flex-1 bg-[var(--rl-line)]" />
              {labels.or}
              <span className="h-px flex-1 bg-[var(--rl-line)]" />
            </div>
            {digits ? (
              <a href={waLink(digits, labels.whatsappMsg)} target="_blank" rel="noreferrer" onClick={() => send(slug, "whatsapp_click", src, campaign)} className={BTN_WA}>
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                {labels.whatsapp}
              </a>
            ) : (
              <p className="rounded-xl bg-[var(--rl-surface-2)] p-3 text-center text-sm text-[var(--rl-muted)]">{labels.noContact}</p>
            )}
          </>
        )}
        <button type="button" onClick={share} className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--rl-line)] text-sm font-semibold text-[var(--rl-ink)] hover:bg-[var(--rl-surface-2)] ${done ? "mt-5" : "mt-2"}`}>
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {copied ? labels.copied : labels.share}
        </button>
      </div>

      {/* Barra fija del celular: las dos acciones principales siempre a la mano. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--rl-line)] bg-[var(--rl-surface)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] lg:hidden">
        <div className="mx-auto flex max-w-xl gap-2">
          <button type="button" onClick={() => open("visit")} className={`${BTN} flex-1`}>
            <CalendarCheck className="h-5 w-5" aria-hidden="true" />
            {labels.tabVisit}
          </button>
          {digits && (
            <a href={waLink(digits, labels.whatsappMsg)} target="_blank" rel="noreferrer" onClick={() => send(slug, "whatsapp_click", src, campaign)} aria-label={labels.whatsapp} className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl bg-[#22C55E] text-[#052E14]">
              <MessageCircle className="h-6 w-6" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </>
  );
}
