"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createWorkshopVehicle } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";
import { Search } from "lucide-react";
import vehicleCatalog from "@/lib/workshop/vehicle-catalog.json";

export function CreateVehicleForm({ lang, customers }: { lang: string; customers: { id: string; name: string | null; phone: string }[] }) {
  const [busy, setBusy] = useState(false);
  const [make, setMake] = useState("");
  const router = useRouter();
  const es = lang === "es";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await createWorkshopVehicle({
        customerId: String(data.get("customerId") ?? ""),
        placas: String(data.get("placas") ?? ""),
        vin: String(data.get("vin") ?? ""),
        marca: String(data.get("marca") ?? ""),
        modelo: String(data.get("modelo") ?? ""),
        anio: String(data.get("anio") ?? ""),
        kilometrajeActual: String(data.get("kilometrajeActual") ?? ""),
      });
      toast.success(es ? "Vehículo guardado" : "Vehicle saved");
      form.reset();
      setMake("");
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, es ? "No se pudo guardar" : "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  const models = Object.entries(vehicleCatalog).find(([name]) => name.toLocaleLowerCase() === make.trim().toLocaleLowerCase())?.[1] ?? [];
  return <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="font-semibold text-slate-900">{es ? "Agregar vehículo" : "Add vehicle"}</h2>
    <p className="mt-1 text-xs text-slate-500">{es ? "Selecciona primero un cliente registrado en el CRM." : "Select a customer already registered in the CRM."}</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm text-slate-700">{es ? "Cliente" : "Customer"}<select className={field} name="customerId" required defaultValue=""><option value="">{es ? "Seleccionar" : "Select"}</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name ?? customer.phone} · {customer.phone}</option>)}</select></label>
      <label className="text-sm text-slate-700">{es ? "Placas" : "Plates"}<input className={field} name="placas" required maxLength={20} /></label>
      <label className="text-sm text-slate-700">VIN<input className={field} name="vin" required minLength={11} maxLength={17} /></label>
      <label className="text-sm text-slate-700">{es ? "Marca" : "Make"}<span className="relative mt-1 block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input className={`${field} pl-9`} name="marca" list="workshop-vehicle-makes" placeholder={es ? "Busca o escribe la marca" : "Search or type a make"} required maxLength={80} value={make} onChange={(event) => { setMake(event.target.value); const model = event.currentTarget.form?.elements.namedItem("modelo"); if (model instanceof HTMLInputElement) model.value = ""; }} /></span></label>
      <label className="text-sm text-slate-700">{es ? "Modelo" : "Model"}<span className="relative mt-1 block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input className={`${field} pl-9`} name="modelo" list="workshop-vehicle-models" placeholder={es ? "Busca o escribe el modelo" : "Search or type a model"} required maxLength={80} /></span></label>
      <datalist id="workshop-vehicle-makes">{Object.keys(vehicleCatalog).map((name) => <option key={name} value={name} />)}</datalist>
      <datalist id="workshop-vehicle-models">{models.map((name) => <option key={name} value={name} />)}</datalist>
      <label className="text-sm text-slate-700">{es ? "Año" : "Year"}<input className={field} name="anio" type="number" min={1900} max={2100} required /></label>
      <label className="text-sm text-slate-700">{es ? "Kilometraje actual" : "Current mileage"}<input className={field} name="kilometrajeActual" type="number" min={0} required /></label>
    </div>
    <button disabled={busy || customers.length === 0} className="mt-4 rounded-md bg-[#063C82] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar vehículo" : "Save vehicle")}</button>
  </form>;
}
