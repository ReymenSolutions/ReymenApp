"use client";

// Interacción de la landing pública: registra la vista (una vez) y los clics con navigator.sendBeacon, galería de
// fotos, y los selectores de idioma y tema (que se guardan). Sin cookies de seguimiento ni datos personales; el origen
// viene de ?src= (smartcard, qr, meta…).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Moon, Sun } from "lucide-react";
import { usePreferences } from "@/context/preferences";

export type EventName = "property_view" | "whatsapp_click" | "schedule_click" | "share_click";

export function send(slug: string, event: EventName, src: string | null, campaign: string | null) {
  const body = JSON.stringify({ slug, event, src, campaign });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon("/api/realty/public/events", new Blob([body], { type: "text/plain" }))) return;
  } catch {
    /* sigue con fetch */
  }
  fetch("/api/realty/public/events", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

export function useSource() {
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

/**
 * Idioma y tema de la landing. Se guardan en las cookies que ya lee el servidor (y en la cuenta si hay sesión), así que
 * se conservan al recargar y en las demás pantallas. Al cambiar de idioma se vuelve a pedir la página para traducir el texto.
 */
export function LandingPrefs({ labels }: { labels: { lang: string; toDark: string; toLight: string } }) {
  const router = useRouter();
  const { theme, setTheme, lang, setLang } = usePreferences();
  const pick = useCallback(
    (l: "es" | "en") => {
      if (l === lang) return;
      // La cookie va primero: el servidor la lee en la petición que sigue.
      document.cookie = `reymen-lang=${l}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      setLang(l);
      router.refresh();
    },
    [lang, router, setLang],
  );
  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label={labels.lang} className="flex overflow-hidden rounded-full border border-white/25 text-xs font-semibold">
        {(["es", "en"] as const).map((l) => (
          <button key={l} type="button" onClick={() => pick(l)} aria-pressed={lang === l} className={`px-3 py-1.5 uppercase transition-colors ${lang === l ? "bg-white text-[#031738]" : "text-white/80 hover:bg-white/10"}`}>
            {l}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label={theme === "dark" ? labels.toLight : labels.toDark}
        title={theme === "dark" ? labels.toLight : labels.toDark}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-white hover:bg-white/10"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

export interface GalleryImage {
  id: string;
  width: number;
  height: number;
  alt: string;
}

/** Fotos con deslizado (scroll-snap), contador y flechas en pantallas grandes. */
export function Gallery({ images, labels }: { images: GalleryImage[]; labels: { /** Con marcadores {i} y {n}. */ photoOf: string; prev: string; next: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const onScroll = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.min(images.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  };
  const go = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[var(--rl-surface-2)]">
      <div ref={ref} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" tabIndex={0} aria-roledescription="carousel">
        {images.map((m, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={`/api/realty/media/${m.id}`} alt={m.alt} width={m.width} height={m.height} loading={i === 0 ? "eager" : "lazy"} className="aspect-[4/3] w-full shrink-0 snap-center object-cover sm:aspect-[16/10]" />
        ))}
      </div>
      {images.length > 1 && (
        <>
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white" aria-live="polite">
            {labels.photoOf.replace("{i}", String(index + 1)).replace("{n}", String(images.length))}
          </span>
          <button type="button" onClick={() => go(-1)} aria-label={labels.prev} className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 sm:flex">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label={labels.next} className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 sm:flex">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}
