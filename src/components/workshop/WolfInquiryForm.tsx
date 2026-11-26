"use client";

import { useRef, useState } from "react";
import vehicleCatalog from "@/lib/workshop/vehicle-catalog.json";

const field = "mt-1 w-full min-w-0 rounded-md border border-white/25 bg-[#171717] px-3 py-2.5 text-sm text-white outline-none focus:border-red-400";

export function WolfInquiryForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const requestKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [make, setMake] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  function whatsappUrl() {
    const data = new FormData(formRef.current ?? undefined);
    const parts = ["Hola, quisiera solicitar una cotización en Taller Wolf."];
    for (const [label, key] of [["Nombre", "name"], ["Vehículo", "marca"], ["Modelo", "modelo"], ["Año", "anio"], ["Placas", "placas"], ["Kilometraje", "kilometraje"], ["Servicio o falla", "servicioFalla"]]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) parts.push(`${label}: ${value}`);
    }
    return `https://wa.me/528711079931?text=${encodeURIComponent(parts.join("\n"))}`;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    requestKey.current ??= crypto.randomUUID();
    setBusy(true); setStatus("idle");
    try {
      const payload: Record<string, unknown> = Object.fromEntries(data.entries());
      payload.requestKey = requestKey.current;
      payload.consent = data.get("consent") === "on";
      payload.anio = Number(data.get("anio"));
      payload.placas = String(data.get("placas") ?? "").trim() || null;
      payload.kilometraje = data.get("kilometraje") === "" ? null : Number(data.get("kilometraje"));
      const response = await fetch("/api/workshop/public/inquiries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok || (await response.json()).success !== true) throw new Error("Request failed");
      requestKey.current = null;
      form.reset();
      setMake("");
      setStatus("success");
    } catch {
      setStatus("error");
    } finally { setBusy(false); }
  }

  const models = Object.entries(vehicleCatalog).find(([name]) => name.toLocaleLowerCase() === make.trim().toLocaleLowerCase())?.[1] ?? [];
  return <form ref={formRef} onSubmit={submit} className="rounded-xl border border-white/15 bg-white/5 p-5" aria-label="Solicitud de cotización / Quote request">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold">Nombre / Name<input className={field} name="name" autoComplete="name" required minLength={2} maxLength={120} /></label>
      <label className="text-xs font-semibold">Teléfono o WhatsApp / Phone<input className={field} name="phone" autoComplete="tel" type="tel" required minLength={10} maxLength={30} /></label>
      <label className="text-xs font-semibold">Marca / Make<input className={field} name="marca" list="wolf-makes" placeholder="Buscar o escribir / Search or type" required maxLength={80} value={make} onChange={(event) => { setMake(event.target.value); const model = event.currentTarget.form?.elements.namedItem("modelo"); if (model instanceof HTMLInputElement) model.value = ""; }} /></label>
      <label className="text-xs font-semibold">Modelo / Model<input className={field} name="modelo" list="wolf-models" placeholder="Buscar o escribir / Search or type" required maxLength={80} /></label>
      <datalist id="wolf-makes">{Object.keys(vehicleCatalog).map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="wolf-models">{models.map((name) => <option key={name} value={name} />)}</datalist>
      <label className="text-xs font-semibold">Año / Year<input className={field} name="anio" type="number" min={1900} max={2100} required /></label>
      <label className="text-xs font-semibold">Placas (opcional) / License plate (optional)<input className={field} name="placas" minLength={2} maxLength={20} /></label>
      <label className="text-xs font-semibold">Kilometraje (opcional) / Mileage (optional)<input className={field} name="kilometraje" type="number" min={0} max={10000000} /></label>
      <label className="text-xs font-semibold sm:col-span-2">Servicio o falla / Service or issue<textarea className={field} name="servicioFalla" required minLength={5} maxLength={2000} rows={3} /></label>
    </div>
    <div aria-hidden="true" className="absolute -left-[10000px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className="mt-5 flex items-start gap-2 text-xs text-white/70"><input name="consent" type="checkbox" required className="mt-0.5" /><span>Autorizo que Taller Wolf me contacte sobre esta solicitud. / I authorize Taller Wolf to contact me about this request.</span></label>
    <div className="mt-5 flex flex-wrap gap-3"><button disabled={busy} className="rounded-md bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50">{busy ? "Enviando / Sending…" : "Enviar solicitud / Send request"}</button><a href="https://wa.me/528711079931" target="_blank" rel="noopener noreferrer" onClick={(event) => { event.currentTarget.href = whatsappUrl(); }} className="rounded-md border border-white/30 px-5 py-3 text-sm font-bold">Enviar por WhatsApp / Send via WhatsApp</a></div>
    {status === "success" && <p role="status" className="mt-4 text-sm text-green-300">Solicitud recibida. / Request received.</p>}
    {status === "error" && <p role="alert" className="mt-4 text-sm text-red-300">No se pudo guardar. Intenta de nuevo o usa WhatsApp. / Could not save. Try again or use WhatsApp.</p>}
  </form>;
}
