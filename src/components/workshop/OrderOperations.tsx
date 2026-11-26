"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { advanceWorkshopOrder, authorizeWorkshopCredit, deliverWorkshopOrder, recordWorkshopOrderPayment, saveWorkshopReception, setWorkshopInvoiceRequested } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

type Phase = "RECEPCION" | "PROCESO" | "ENTREGA";

export function OrderOperations({ id, estado, kilometrajeIngreso, nivelCombustible, fallaReportada, diagnostico, checklist, saldo, facturaSolicitada, canManageFinancials, lang }: { id: string; estado: string; kilometrajeIngreso: number; nivelCombustible: string | null; fallaReportada: string | null; diagnostico: string | null; checklist: { danosPrevios?: string; testigos?: string; pertenencias?: string }; saldo?: string; facturaSolicitada?: boolean; canManageFinancials: boolean; lang: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState("");
  const [method, setMethod] = useState<"EFECTIVO" | "TRANSFERENCIA" | "TARJETA">("EFECTIVO");
  const [creditNote, setCreditNote] = useState("");
  const [deliveryKm, setDeliveryKm] = useState(String(kilometrajeIngreso));
  const [partsReturned, setPartsReturned] = useState(false);
  const es = lang === "es";
  const button = "rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50";
  const field = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

  async function run(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    try { await operation(); toast.success(message); router.refresh(); }
    catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo completar" : "Could not complete")); }
    finally { setBusy(false); }
  }

  async function upload(phase: Phase, file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const data = new FormData(); data.set("phase", phase); data.set("file", file);
      const response = await fetch(`/api/workshop/orders/${id}/photos`, { method: "POST", body: data });
      if (!response.ok) throw new Error(es ? "Revisa la foto (JPG, PNG o WebP, máximo 5 MB) y el estado de la orden" : "Check the photo (JPG, PNG or WebP, max 5 MB) and order state");
      toast.success(es ? "Foto guardada" : "Photo saved"); router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo subir" : "Upload failed")); }
    finally { setBusy(false); }
  }

  async function saveReception(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(() => saveWorkshopReception(id, {
      kilometrajeIngreso: Number(data.get("kilometrajeIngreso")), nivelCombustible: String(data.get("nivelCombustible") ?? ""),
      fallaReportada: String(data.get("fallaReportada") ?? ""), diagnostico: String(data.get("diagnostico") ?? ""),
      danosPrevios: String(data.get("danosPrevios") ?? ""), testigos: String(data.get("testigos") ?? ""), pertenencias: String(data.get("pertenencias") ?? ""),
    }), es ? "Recepción guardada" : "Reception saved");
  }

  return <div className="space-y-3 border-t border-slate-100 pt-3">
    {canManageFinancials && <a href={`/api/workshop/orders/${id}/pdf`} className="inline-block rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold">{es ? "Descargar orden PDF" : "Download work order PDF"}</a>}
    {["RECEPCION", "DIAGNOSTICO"].includes(estado) && <form onSubmit={saveReception} className="grid gap-2 sm:grid-cols-2">
      <input aria-label={es ? "Kilometraje de ingreso" : "Arrival mileage"} className={field} type="number" name="kilometrajeIngreso" min="0" defaultValue={kilometrajeIngreso} required />
      <input aria-label={es ? "Nivel de combustible" : "Fuel level"} className={field} name="nivelCombustible" defaultValue={nivelCombustible ?? ""} placeholder={es ? "Nivel de combustible" : "Fuel level"} required />
      <input aria-label={es ? "Falla reportada" : "Reported fault"} className={field} name="fallaReportada" defaultValue={fallaReportada ?? ""} placeholder={es ? "Falla reportada" : "Reported fault"} required />
      <input aria-label={es ? "Diagnóstico" : "Diagnosis"} className={field} name="diagnostico" defaultValue={diagnostico ?? ""} placeholder={es ? "Diagnóstico" : "Diagnosis"} />
      <input aria-label={es ? "Daños previos" : "Prior damage"} className={field} name="danosPrevios" defaultValue={checklist.danosPrevios ?? ""} placeholder={es ? "Daños previos" : "Prior damage"} />
      <input aria-label={es ? "Testigos encendidos" : "Warning lights"} className={field} name="testigos" defaultValue={checklist.testigos ?? ""} placeholder={es ? "Testigos encendidos" : "Warning lights"} />
      <input aria-label={es ? "Pertenencias" : "Belongings"} className={field} name="pertenencias" defaultValue={checklist.pertenencias ?? ""} placeholder={es ? "Pertenencias" : "Belongings"} />
      <button disabled={busy} className={button}>{es ? "Guardar recepción y diagnóstico" : "Save reception and diagnosis"}</button>
    </form>}
    {["RECEPCION", "EN_REPARACION", "LISTA_PARA_ENTREGA"].includes(estado) && <label className="block text-xs text-slate-600">{es ? "Subir foto" : "Upload photo"} · {estado === "LISTA_PARA_ENTREGA" ? (es ? "entrega" : "delivery") : estado === "EN_REPARACION" ? (es ? "proceso" : "work") : (es ? "recepción" : "reception")}<input className="mt-1 block w-full text-xs" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => upload(estado === "LISTA_PARA_ENTREGA" ? "ENTREGA" : estado === "EN_REPARACION" ? "PROCESO" : "RECEPCION", event.target.files?.[0] ?? null)} /></label>}
    {estado === "RECEPCION" && <button className={button} disabled={busy} onClick={() => run(() => advanceWorkshopOrder(id, "DIAGNOSTICO"), es ? "Orden en diagnóstico" : "Order in diagnosis")}>{es ? "Pasar a diagnóstico" : "Move to diagnosis"}</button>}
    {estado === "DIAGNOSTICO" && <button className={button} disabled={busy} onClick={() => run(() => advanceWorkshopOrder(id, "EN_REPARACION"), es ? "Trabajo iniciado" : "Work started")}>{es ? "Iniciar reparación" : "Start repair"}</button>}
    {estado === "EN_REPARACION" && <button className={button} disabled={busy} onClick={() => run(() => advanceWorkshopOrder(id, "LISTA_PARA_ENTREGA"), es ? "Lista para entregar" : "Ready for delivery")}>{es ? "Lista para entregar" : "Ready for delivery"}</button>}
    {canManageFinancials && saldo !== undefined && <div className="text-xs font-semibold text-slate-700">{es ? "Saldo pendiente" : "Outstanding balance"}: ${saldo} MXN</div>}
    {canManageFinancials && facturaSolicitada !== undefined && <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={facturaSolicitada} disabled={busy || ["ENTREGADA", "CANCELADA"].includes(estado)} onChange={(event) => run(() => setWorkshopInvoiceRequested(id, event.target.checked), es ? "Solicitud de factura actualizada" : "Invoice request updated")} />{es ? "El cliente solicitó factura (se emite fuera de Reymen)" : "Customer requested an invoice (issued outside Reymen)"}</label>}
    {canManageFinancials && saldo !== undefined && Number(saldo) > 0 && !["ENTREGADA", "CANCELADA"].includes(estado) && <div className="flex flex-wrap gap-2"><input aria-label={es ? "Monto del pago" : "Payment amount"} className={`${field} max-w-40`} type="number" min="0.01" step="0.01" max={saldo} value={payment} onChange={(event) => setPayment(event.target.value)} /><select aria-label={es ? "Método de pago" : "Payment method"} className={field} value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="EFECTIVO">{es ? "Efectivo" : "Cash"}</option><option value="TRANSFERENCIA">{es ? "Transferencia" : "Bank transfer"}</option><option value="TARJETA">{es ? "Tarjeta" : "Card"}</option></select><button className={button} disabled={busy || !(Number(payment) > 0)} onClick={() => run(() => recordWorkshopOrderPayment(id, { requestKey: crypto.randomUUID(), monto: payment, metodo: method }), es ? "Pago registrado" : "Payment recorded")}>{es ? "Registrar pago" : "Record payment"}</button></div>}
    {estado === "LISTA_PARA_ENTREGA" && <div className="space-y-2">
      {canManageFinancials && saldo !== undefined && Number(saldo) > 0 && <div className="flex flex-wrap gap-2"><input aria-label={es ? "Condiciones del crédito" : "Credit terms"} className={field} value={creditNote} onChange={(event) => setCreditNote(event.target.value)} placeholder={es ? "Motivo y condiciones del crédito" : "Reason and credit terms"} /><button className={button} disabled={busy || creditNote.trim().length < 10} onClick={() => run(() => authorizeWorkshopCredit(id, creditNote), es ? "Crédito registrado" : "Credit recorded")}>{es ? "Autorizar crédito" : "Authorize credit"}</button></div>}
      <div className="flex flex-wrap items-center gap-2"><input aria-label={es ? "Kilometraje de entrega" : "Delivery mileage"} className={`${field} max-w-44`} type="number" min={kilometrajeIngreso} value={deliveryKm} onChange={(event) => setDeliveryKm(event.target.value)} /><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={partsReturned} onChange={(event) => setPartsReturned(event.target.checked)} />{es ? "Refacciones usadas entregadas" : "Replaced parts handed over"}</label><button className={button} disabled={busy} onClick={() => run(() => deliverWorkshopOrder(id, Number(deliveryKm), partsReturned), es ? "Orden entregada" : "Order delivered")}>{es ? "Marcar entregada" : "Mark delivered"}</button></div>
    </div>}
  </div>;
}
