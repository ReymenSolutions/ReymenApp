"use client";

import { useActionState, useState } from "react";
import { attachRetailLocationAction, createRetailLocationAction, registerRetailItemAction } from "@/app/(portal)/portal/retail/actions";
import { translateMessage } from "@/lib/user-error";

const input = "min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white";
const label = "block space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200";
const button = "rounded-lg bg-[#22C55E] px-4 py-2 text-sm font-semibold text-[#061b35] disabled:opacity-50";

function Feedback({ error, success, lang, pending }: { error?: string; success?: boolean; lang: "es" | "en"; pending: boolean }) {
  return <p role="status" aria-live="polite" className="text-sm text-slate-600 dark:text-slate-300">
    {pending ? (lang === "en" ? "Saving…" : "Guardando…") : error ? translateMessage(error) : success ? (lang === "en" ? "Saved." : "Guardado.") : null}
  </p>;
}

export function LocationForm({ lang }: { lang: "es" | "en" }) {
  const [state, action, pending] = useActionState(createRetailLocationAction, {});
  const [type, setType] = useState("TIENDA");
  const formats = type === "TIENDA" ? ["PREMIUM", "OUTLET", "HOGAR"] : [type];
  return <form action={action} className="grid gap-3 sm:grid-cols-2">
    <label className={label}>{lang === "en" ? "Location name" : "Nombre de ubicación"}<input className={input} name="name" maxLength={120} required /></label>
    <label className={label}>{lang === "en" ? "Type" : "Tipo"}<select className={input} name="type" value={type} onChange={(event) => setType(event.target.value)}><option value="TIENDA">{lang === "en" ? "Store" : "Tienda"}</option><option value="BODEGA">{lang === "en" ? "Warehouse" : "Bodega"}</option><option value="MAYOREO">{lang === "en" ? "Wholesale (inactive)" : "Mayoreo (inactiva)"}</option></select></label>
    <label className={label}>{lang === "en" ? "Format" : "Formato"}<select key={type} className={input} name="format" defaultValue={formats[0]}>{formats.map((format) => <option key={format} value={format}>{format === "HOGAR" ? (lang === "en" ? "Home" : "Hogar") : format === "BODEGA" ? (lang === "en" ? "Warehouse" : "Bodega") : format === "MAYOREO" ? (lang === "en" ? "Wholesale" : "Mayoreo") : format}</option>)}</select></label>
    <label className={label}>{lang === "en" ? "Area (m², optional)" : "Área (m², opcional)"}<input className={input} name="areaM2" inputMode="decimal" /></label>
    <label className={label}>{lang === "en" ? "Address (optional)" : "Dirección (opcional)"}<input className={input} name="address" /></label>
    <label className={label}>WhatsApp ({lang === "en" ? "optional" : "opcional"})<input className={input} name="whatsappPhone" inputMode="tel" /></label>
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><input type="checkbox" name="isActive" defaultChecked />{lang === "en" ? "Active location (wholesale always stays inactive)" : "Ubicación activa (mayoreo siempre queda inactiva)"}</label>
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button className={button} disabled={pending}>{lang === "en" ? "Add location" : "Agregar ubicación"}</button><Feedback {...state} lang={lang} pending={pending} /></div>
  </form>;
}

export function AttachLocationForm({ lang, branches }: { lang: "es" | "en"; branches: { id: string; name: string; isActive: boolean }[] }) {
  const [state, action, pending] = useActionState(attachRetailLocationAction, {});
  const [type, setType] = useState("TIENDA");
  const formats = type === "TIENDA" ? ["PREMIUM", "OUTLET", "HOGAR"] : [type];
  return <form action={action} className="grid gap-3 sm:grid-cols-3">
    <label className={label}>{lang === "en" ? "Existing branch" : "Sucursal existente"}<select className={input} name="branchId" required><option value="">{lang === "en" ? "Choose a branch" : "Elige una sucursal"}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.isActive ? "" : ` (${lang === "en" ? "inactive" : "inactiva"})`}</option>)}</select></label>
    <label className={label}>{lang === "en" ? "Type" : "Tipo"}<select className={input} name="type" value={type} onChange={(event) => setType(event.target.value)}><option value="TIENDA">{lang === "en" ? "Store" : "Tienda"}</option><option value="BODEGA">{lang === "en" ? "Warehouse" : "Bodega"}</option><option value="MAYOREO">{lang === "en" ? "Wholesale" : "Mayoreo"}</option></select></label>
    <label className={label}>{lang === "en" ? "Format" : "Formato"}<select key={type} className={input} name="format" defaultValue={formats[0]}>{formats.map((format) => <option key={format} value={format}>{format}</option>)}</select></label>
    <div className="flex flex-wrap items-center gap-3 sm:col-span-3"><button className={button} disabled={pending}>{lang === "en" ? "Enable for Retail" : "Habilitar para Retail"}</button><Feedback {...state} lang={lang} pending={pending} /></div>
  </form>;
}

export function ItemForm({ lang, warehouses, canManage }: { lang: "es" | "en"; warehouses: { id: string; name: string }[]; canManage: boolean }) {
  const [state, action, pending] = useActionState(registerRetailItemAction, {});
  return <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <label className={label}>{lang === "en" ? "Unique code" : "Código único"}<input className={input} name="code" maxLength={80} required autoCapitalize="characters" /></label>
    <label className={label}>{lang === "en" ? "Warehouse" : "Bodega"}<select className={input} name="locationId" required><option value="">{lang === "en" ? "Choose a warehouse" : "Elige una bodega"}</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
    <label className={label}>{lang === "en" ? "Sale price (MXN)" : "Precio de venta (MXN)"}<input className={input} name="salePrice" type="number" min="0" step="0.01" required /></label>
    {canManage && <label className={label}>{lang === "en" ? "Cost (optional)" : "Costo (opcional)"}<input className={input} name="cost" type="number" min="0" step="0.01" /></label>}
    {(["brand", "category", "garmentType", "size", "color", "style"] as const).map((key) => <label key={key} className={label}>{({ brand: lang === "en" ? "Brand" : "Marca", category: lang === "en" ? "Category" : "Categoría", garmentType: lang === "en" ? "Garment" : "Prenda", size: lang === "en" ? "Size" : "Talla", color: lang === "en" ? "Color" : "Color", style: lang === "en" ? "Style" : "Estilo" })[key]}<input className={input} name={key} /></label>)}
    <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3"><button className={button} disabled={pending || warehouses.length === 0}>{lang === "en" ? "Register item" : "Dar de alta prenda"}</button><Feedback {...state} lang={lang} pending={pending} /></div>
  </form>;
}
