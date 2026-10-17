"use client";

// Interacción de la landing pública: registra la vista (una vez) y los clics
// en WhatsApp / agendar / compartir con navigator.sendBeacon. Sin cookies ni
// datos personales; el origen viene de ?src= (smartcard, qr, meta…).

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, MessageCircle, Share2 } from "lucide-react";

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
