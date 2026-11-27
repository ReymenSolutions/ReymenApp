"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveWorkshopService } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

type Service = { id: string; nameEs: string; nameEn: string; costoNeto: string; precioVentaNeto: string; active: boolean; provisional: boolean };

function ServiceForm({ service, lang }: { service?: Service; lang: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const es = lang === "es";
  const field = "mt-1 block w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const d = new FormData(form);
    setBusy(true);
    try {
      await saveWorkshopService(service?.id ?? null, {
        nameEs: String(d.get("nameEs") ?? ""), nameEn: String(d.get("nameEn") ?? ""),
        costoNeto: String(d.get("costoNeto") ?? ""), precioVentaNeto: String(d.get("precioVentaNeto") ?? ""), active: d.get("active") === "on",
      });
      toast.success(es ? "Servicio guardado" : "Service saved");
      if (!service) form.reset();
      router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo guardar" : "Could not save")); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="grid gap-2 border-t border-slate-100 py-3 sm:grid-cols-2">
    <label>{es ? "Nombre en español" : "Spanish name"}<input className={field} name="nameEs" required maxLength={120} defaultValue={service?.nameEs} /></label>
    <label>{es ? "Nombre en inglés" : "English name"}<input className={field} name="nameEn" required maxLength={120} defaultValue={service?.nameEn} /></label>
    <label>{es ? "Costo neto (opcional)" : "Net cost (optional)"}<input className={field} name="costoNeto" type="number" min="0" step="0.01" defaultValue={service?.costoNeto} /></label>
    <label>{es ? "Precio neto (opcional)" : "Net price (optional)"}<input className={field} name="precioVentaNeto" type="number" min="0" step="0.01" defaultValue={service?.precioVentaNeto} /></label>
    <label className="flex items-center gap-2"><input name="active" type="checkbox" defaultChecked={service?.active ?? true} />{es ? "Visible en la landing" : "Visible on landing"}</label>
    <div className="flex items-center justify-end gap-3">{service?.provisional && <span className="text-xs text-amber-700">{es ? "Provisional" : "Provisional"}</span>}<button disabled={busy} className="rounded-md bg-[#245A9F] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{es ? "Guardar" : "Save"}</button></div>
  </form>;
}

export function WorkshopServices({ services, lang }: { services: Service[]; lang: string }) {
  const es = lang === "es";
  return <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Servicios" : "Services"}</h2><p className="mt-1 text-xs text-slate-600">{es ? "Catálogo editable. Los conceptos iniciales son provisionales y no tienen precio ni costo hasta que captures los reales." : "Editable catalog. Initial concepts are provisional and have no price or cost until you enter actual values."}</p>
    <div className="mt-3">{services.map((service) => <ServiceForm key={service.id} service={service} lang={lang} />)}</div>
    <details><summary className="cursor-pointer text-sm font-medium text-red-700">{es ? "Agregar servicio" : "Add service"}</summary><ServiceForm lang={lang} /></details>
  </section>;
}
