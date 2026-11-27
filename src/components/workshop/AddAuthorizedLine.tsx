"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addWorkshopAuthorizedLine } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

type Part = { id: string; sku: string; nombre: string; unidad: string; costoNeto: string; precioVentaNeto: string };

export function AddAuthorizedLine({ orderId, parts, lang }: { orderId: string; parts: Part[]; lang: string }) {
  const [busy, setBusy] = useState(false);
  const [tipo, setTipo] = useState<"SERVICIO" | "MANO_DE_OBRA" | "REFACCION">("SERVICIO");
  const [partId, setPartId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const requestKey = useRef<string | null>(null);
  const router = useRouter();
  const es = lang === "es";
  const field = "mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    requestKey.current ??= crypto.randomUUID();
    setBusy(true);
    try {
      await addWorkshopAuthorizedLine(orderId, {
        requestKey: requestKey.current, tipo, partId: tipo === "REFACCION" ? partId : undefined,
        concepto: String(data.get("concepto") ?? ""), detalle: String(data.get("detalle") ?? ""),
        cantidad: String(data.get("cantidad") ?? ""), unidad: String(data.get("unidad") ?? ""),
        precioUnitarioNeto: String(data.get("precioUnitarioNeto") ?? ""), costoUnitarioNeto: String(data.get("costoUnitarioNeto") ?? "") || undefined,
        autorizadaVia: String(data.get("autorizadaVia") ?? ""),
      });
      requestKey.current = null;
      formRef.current?.reset(); setTipo("SERVICIO"); setPartId("");
      toast.success(es ? "Trabajo adicional autorizado y registrado" : "Authorized additional work recorded"); router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo agregar" : "Could not add item")); }
    finally { setBusy(false); }
  }

  const selectedPart = parts.find((part) => part.id === partId);
  return <details className="rounded-md border border-slate-200 p-3 text-xs"><summary className="cursor-pointer font-semibold">{es ? "Agregar trabajo autorizado" : "Add authorized work"}</summary>
    <p className="mt-2 text-slate-600">{es ? "Registra la línea solo después de que el cliente autorice el trabajo adicional. La fecha se guarda automáticamente." : "Record the item only after the customer authorizes the additional work. The date is saved automatically."}</p>
    <form ref={formRef} onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-2">
      <label>{es ? "Tipo" : "Type"}<select className={field} value={tipo} onChange={(event) => { setTipo(event.target.value as typeof tipo); setPartId(""); }}><option value="SERVICIO">{es ? "Servicio" : "Service"}</option><option value="MANO_DE_OBRA">{es ? "Mano de obra" : "Labor"}</option><option value="REFACCION">{es ? "Refacción" : "Part"}</option></select></label>
      {tipo === "REFACCION" && <label>{es ? "Refacción de inventario" : "Inventory part"}<select className={field} required value={partId} onChange={(event) => setPartId(event.target.value)}><option value="">{es ? "Seleccionar" : "Select"}</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.sku} · {part.nombre}</option>)}</select></label>}
      <label>{es ? "Concepto" : "Item"}<input key={selectedPart?.id ?? "none"} className={field} name="concepto" required maxLength={160} defaultValue={selectedPart?.nombre ?? ""} /></label>
      <label>{es ? "Detalle" : "Details"}<input className={field} name="detalle" maxLength={1000} /></label>
      <label>{es ? "Cantidad" : "Quantity"}<input className={field} name="cantidad" type="number" min="0.001" step="0.001" required defaultValue="1" /></label>
      <label>{es ? "Unidad" : "Unit"}<input key={`${selectedPart?.id ?? "none"}-unit`} className={field} name="unidad" required maxLength={24} defaultValue={selectedPart?.unidad ?? "serv."} /></label>
      <label>{es ? "Precio unitario neto" : "Net unit price"}<input key={`${selectedPart?.id ?? "none"}-price`} className={field} name="precioUnitarioNeto" type="number" min="0" step="0.01" required defaultValue={selectedPart?.precioVentaNeto ?? ""} /></label>
      <label>{es ? "Costo unitario neto (interno)" : "Net unit cost (internal)"}<input key={`${selectedPart?.id ?? "none"}-cost`} className={field} name="costoUnitarioNeto" type="number" min="0" step="0.01" defaultValue={selectedPart?.costoNeto ?? ""} /></label>
      <label>{es ? "Autorizado por" : "Approved via"}<select className={field} name="autorizadaVia" required><option value="WhatsApp">WhatsApp</option><option value="En persona">{es ? "En persona" : "In person"}</option><option value="Llamada">{es ? "Llamada" : "Call"}</option></select></label>
      <button disabled={busy} className="rounded-md bg-[#B91C1C] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 sm:col-span-2">{es ? "Registrar línea autorizada" : "Record authorized item"}</button>
    </form>
  </details>;
}
