"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createWorkshopPart } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

export function CreatePartForm({ lang }: { lang: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const es = lang === "es";
  const field = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await createWorkshopPart({ sku: String(data.get("sku") ?? ""), nombre: String(data.get("nombre") ?? ""), unidad: String(data.get("unidad") ?? ""), costoNeto: String(data.get("costoNeto") ?? ""), precioVentaNeto: String(data.get("precioVentaNeto") ?? ""), stockMinimo: String(data.get("stockMinimo") ?? "0") });
      toast.success(es ? "Refacción guardada" : "Part saved");
      form.reset();
      router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo guardar" : "Could not save")); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Agregar refacción" : "Add part"}</h2><p className="text-xs text-slate-500">{es ? "Costo y precio sin IVA. Las existencias se actualizan solo con movimientos." : "Cost and price before tax. Stock changes only through movements."}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <label className="text-sm">SKU<input className={field} name="sku" required maxLength={60} /></label>
    <label className="text-sm">{es ? "Nombre" : "Name"}<input className={field} name="nombre" required maxLength={160} /></label>
    <label className="text-sm">{es ? "Unidad" : "Unit"}<input className={field} name="unidad" defaultValue="pza" required /></label>
    <label className="text-sm">{es ? "Costo neto" : "Net cost"}<input className={field} name="costoNeto" type="number" min="0" step="0.01" required /></label>
    <label className="text-sm">{es ? "Precio de venta neto" : "Net sale price"}<input className={field} name="precioVentaNeto" type="number" min="0" step="0.01" required /></label>
    <label className="text-sm">{es ? "Stock mínimo" : "Minimum stock"}<input className={field} name="stockMinimo" type="number" min="0" step="0.001" defaultValue="0" required /></label>
  </div><button className="mt-4 rounded-md bg-[#245A9F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy}>{busy ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar refacción" : "Save part")}</button></form>;
}
