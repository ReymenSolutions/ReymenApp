"use client";

import { useState, useTransition } from "react";
import { holdItemFromWeb } from "@/lib/retail/public/actions";

const REASON: Record<string, string> = {
  NOT_AVAILABLE: "Esta prenda ya no está disponible: alguien la apartó o la compró. Revisa el catálogo para ver otras.",
  NOT_READY: "Por ahora no se pueden hacer apartados en línea. Intenta más tarde.",
  RATE_LIMITED: "Hiciste varios intentos seguidos. Espera unos minutos y vuelve a intentar.",
  INVALID: "Revisa tu nombre y tu teléfono a 10 dígitos.",
};

// Apartar por WhatsApp: crea el apartado en el inventario (con vencimiento) y abre WhatsApp con la tienda.
export function HoldForm({ slug, code, storeHasWhatsapp }: { slug: string; code: string; storeHasWhatsapp: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ url: string | null } | null>(null);
  const [pending, start] = useTransition();

  if (!storeHasWhatsapp) {
    return <p className="rounded-xl bg-[var(--rt-bg)] p-4 text-sm text-[var(--rt-muted)]">Los apartados en línea de esta tienda estarán disponibles pronto.</p>;
  }
  if (done) {
    return (
      <div className="rounded-xl border border-[var(--rt-ok)] bg-white p-4 text-sm">
        <p className="font-bold text-[var(--rt-ok)]">¡Listo, la prenda quedó apartada a tu nombre!</p>
        <p className="mt-1 text-[var(--rt-muted)]">Confirma por WhatsApp con la tienda para recogerla.</p>
        {done.url && (
          <a href={done.url} target="_blank" rel="noopener" className="mt-3 inline-flex rounded-xl bg-[#25d366] px-4 py-2.5 font-bold text-white">Abrir WhatsApp</a>
        )}
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await holdItemFromWeb({ slug, code, name, phone });
          if (!r.ok) return setError(REASON[r.reason] ?? REASON.NOT_READY);
          setDone({ url: r.whatsappUrl });
          if (r.whatsappUrl) window.location.href = r.whatsappUrl;
        });
      }}
    >
      <label className="block text-sm font-semibold">
        Tu nombre
        <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
          className="mt-1 w-full rounded-xl border border-[var(--rt-line)] bg-white px-3 py-2.5 font-normal" />
      </label>
      <label className="block text-sm font-semibold">
        Tu WhatsApp (10 dígitos)
        <input required inputMode="tel" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel"
          className="mt-1 w-full rounded-xl border border-[var(--rt-line)] bg-white px-3 py-2.5 font-normal" />
      </label>
      {error && <p role="alert" className="text-sm font-medium text-[var(--rt-danger)]">{error}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-[#25d366] px-4 py-3 font-bold text-white disabled:opacity-60">
        {pending ? "Apartando…" : "Apartar por WhatsApp"}
      </button>
      <p className="text-xs text-[var(--rt-muted)]">El apartado tiene tiempo límite. Se recoge en la tienda; el pago se confirma en tienda o por transferencia.</p>
    </form>
  );
}
