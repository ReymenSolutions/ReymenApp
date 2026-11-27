"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createWorkshopQuote } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

type Line = { tipo: "REFACCION" | "MANO_DE_OBRA" | "SERVICIO"; partId: string; concepto: string; cantidad: string; unidad: string; precioUnitarioNeto: string; costoUnitarioNeto: string };
const blankLine = (): Line => ({ tipo: "SERVICIO", partId: "", concepto: "", cantidad: "1", unidad: "serv.", precioUnitarioNeto: "", costoUnitarioNeto: "" });

export function CreateQuoteForm({ lang, vehicles, parts, services, initialVehicleId, initialService, requestId }: { lang: string; vehicles: { id: string; placas: string | null; vin: string | null; customer: { name: string | null; phone: string } }[]; parts: { id: string; nombre: string; sku: string; unidad: string; precioVentaNeto: string; costoNeto: string }[]; services: { id: string; nameEs: string; nameEn: string; precioVentaNeto: string; costoNeto: string }[]; initialVehicleId?: string; initialService?: string; requestId?: string }) {
  const [items, setItems] = useState<Line[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const es = lang === "es";
  const field = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

  function change(index: number, key: keyof Line, value: string) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await createWorkshopQuote({
        vehicleId: String(data.get("vehicleId") ?? ""),
        requestId,
        servicioTitulo: String(data.get("servicioTitulo") ?? ""),
        tiempoEstimado: String(data.get("tiempoEstimado") ?? ""),
        notas: String(data.get("notas") ?? ""),
        items: items.map((item) => ({ ...item, partId: item.partId || undefined, costoUnitarioNeto: item.costoUnitarioNeto || undefined })),
      });
      toast.success(es ? "Borrador de cotización guardado" : "Quote draft saved");
      form.reset();
      setItems([blankLine()]);
      router.push("/portal/workshop?tab=quotes&view=mine");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, es ? "No se pudo guardar" : "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
    <div><p className="text-xs text-slate-600">{es ? "Se guarda como borrador sin folio. Captura precios y costos sin IVA." : "Saved as a draft without a reference number. Enter prices and costs before tax."}</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">{es ? "Vehículo" : "Vehicle"}<select className={field} name="vehicleId" required defaultValue={initialVehicleId ?? ""}><option value="">{es ? "Seleccionar" : "Select"}</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.placas ?? v.vin ?? "—"} · {v.customer.name ?? v.customer.phone}</option>)}</select></label>
      <label className="text-sm">{es ? "Servicio" : "Service"}<input className={field} name="servicioTitulo" required maxLength={160} defaultValue={initialService?.slice(0, 160)} /></label>
      <label className="text-sm">{es ? "Tiempo estimado" : "Estimated time"}<input className={field} name="tiempoEstimado" maxLength={100} /></label>
      <label className="text-sm sm:col-span-2">{es ? "Notas para el cliente (aparecen en el PDF)" : "Customer notes (shown in the PDF)"}<textarea className={field} name="notas" maxLength={2000} rows={2} defaultValue={initialService} /></label>
    </div>
    <div className="space-y-3">{items.map((item, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <select aria-label={es ? "Tipo" : "Type"} className={field} value={item.tipo} onChange={(e) => change(index, "tipo", e.target.value)}><option value="SERVICIO">{es ? "Servicio" : "Service"}</option><option value="MANO_DE_OBRA">{es ? "Mano de obra" : "Labor"}</option><option value="REFACCION">{es ? "Refacción" : "Part"}</option></select>
      {item.tipo === "SERVICIO" && <select aria-label={es ? "Servicio del catálogo" : "Catalog service"} className={field} defaultValue="" onChange={(event) => {
        const service = services.find((row) => row.id === event.target.value);
        if (!service) return;
        setItems((current) => current.map((line, i) => i === index ? { ...line, concepto: es ? service.nameEs : service.nameEn, precioUnitarioNeto: service.precioVentaNeto, costoUnitarioNeto: service.costoNeto } : line));
      }}><option value="">{es ? "Elegir concepto o escribirlo" : "Choose or enter a service"}</option>{services.map((service) => <option key={service.id} value={service.id}>{es ? service.nameEs : service.nameEn}</option>)}</select>}
      {item.tipo === "REFACCION" && <select aria-label={es ? "Refacción de inventario" : "Inventory part"} className={field} value={item.partId} required onChange={(e) => {
        const part = parts.find((p) => p.id === e.target.value);
        setItems((current) => current.map((line, i) => i === index ? { ...line, partId: part?.id ?? "", concepto: part?.nombre ?? line.concepto, unidad: part?.unidad ?? line.unidad, precioUnitarioNeto: part?.precioVentaNeto ?? line.precioUnitarioNeto, costoUnitarioNeto: part?.costoNeto ?? line.costoUnitarioNeto } : line));
      }}><option value="">{es ? "Seleccionar refacción" : "Select part"}</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.sku} · {part.nombre}</option>)}</select>}
      <input aria-label={es ? "Concepto" : "Description"} className={field} placeholder={es ? "Concepto" : "Description"} value={item.concepto} onChange={(e) => change(index, "concepto", e.target.value)} required />
      <input aria-label={es ? "Cantidad" : "Quantity"} className={field} type="number" min="0.001" step="0.001" value={item.cantidad} onChange={(e) => change(index, "cantidad", e.target.value)} required />
      <input aria-label={es ? "Unidad" : "Unit"} className={field} value={item.unidad} onChange={(e) => change(index, "unidad", e.target.value)} required />
      <input aria-label={es ? "Precio unitario neto" : "Net unit price"} className={field} type="number" min="0" step="0.01" placeholder={es ? "Precio neto" : "Net price"} value={item.precioUnitarioNeto} onChange={(e) => change(index, "precioUnitarioNeto", e.target.value)} required />
      <input aria-label={es ? "Costo unitario neto" : "Net unit cost"} className={field} type="number" min="0" step="0.01" placeholder={es ? "Costo neto interno" : "Internal net cost"} value={item.costoUnitarioNeto} onChange={(e) => change(index, "costoUnitarioNeto", e.target.value)} />
      {items.length > 1 && <button type="button" className="text-left text-xs text-red-700" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>{es ? "Quitar línea" : "Remove line"}</button>}
    </div>)}</div>
    <div className="flex flex-wrap gap-2"><button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => setItems((current) => [...current, blankLine()])}>{es ? "Agregar línea" : "Add line"}</button><button disabled={busy || vehicles.length === 0} className="rounded-md bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar borrador" : "Save draft")}</button></div>
  </form>;
}
