"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createWorkshopPurchase } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

type PurchaseLine = { partId: string; cantidad: string; costoUnitarioNeto: string };
const blank = (): PurchaseLine => ({ partId: "", cantidad: "1", costoUnitarioNeto: "" });

export function CreatePurchaseForm({ lang, parts }: { lang: string; parts: { id: string; sku: string; nombre: string; costoNeto: string }[] }) {
  const [lines, setLines] = useState<PurchaseLine[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const router = useRouter();
  const es = lang === "es";
  const field = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await createWorkshopPurchase({
        requestKey: crypto.randomUUID(), proveedor: String(data.get("proveedor") ?? ""), folioProveedor: String(data.get("folioProveedor") ?? ""),
        paid, method: paid ? String(data.get("method")) as "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" : undefined,
        lines,
      });
      toast.success(es ? "Compra registrada" : "Purchase recorded");
      form.reset(); setLines([blank()]); setPaid(false); router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo registrar" : "Could not record")); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Registrar compra" : "Record purchase"}</h2><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">{es ? "Proveedor" : "Supplier"}<input className={field} name="proveedor" required /></label><label className="text-sm">{es ? "Folio del proveedor" : "Supplier reference"}<input className={field} name="folioProveedor" /></label></div>
    {lines.map((line, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3"><select aria-label={es ? "Refacción" : "Part"} className={field} required value={line.partId} onChange={(event) => { const part = parts.find((p) => p.id === event.target.value); setLines((current) => current.map((row, i) => i === index ? { ...row, partId: part?.id ?? "", costoUnitarioNeto: part?.costoNeto ?? "" } : row)); }}><option value="">{es ? "Seleccionar refacción" : "Select part"}</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.sku} · {part.nombre}</option>)}</select><input aria-label={es ? "Cantidad" : "Quantity"} className={field} type="number" min="0.001" step="0.001" required value={line.cantidad} onChange={(event) => setLines((current) => current.map((row, i) => i === index ? { ...row, cantidad: event.target.value } : row))} /><input aria-label={es ? "Costo unitario neto" : "Net unit cost"} className={field} type="number" min="0" step="0.01" required value={line.costoUnitarioNeto} onChange={(event) => setLines((current) => current.map((row, i) => i === index ? { ...row, costoUnitarioNeto: event.target.value } : row))} />{lines.length > 1 && <button type="button" className="text-left text-xs text-red-700" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>{es ? "Quitar" : "Remove"}</button>}</div>)}
    <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => setLines((current) => [...current, blank()])}>{es ? "Agregar línea" : "Add line"}</button>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} />{es ? "Pagada ahora (registrar egreso de caja)" : "Paid now (record cash egress)"}</label>
    {paid && <select className={field} name="method" aria-label={es ? "Método de pago" : "Payment method"}><option value="EFECTIVO">{es ? "Efectivo" : "Cash"}</option><option value="TRANSFERENCIA">{es ? "Transferencia" : "Bank transfer"}</option><option value="TARJETA">{es ? "Tarjeta" : "Card"}</option></select>}
    <div><button disabled={busy || parts.length === 0} className="rounded-md bg-[#245A9F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar compra" : "Save purchase")}</button></div>
  </form>;
}
