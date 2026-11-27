type Values = { q?: string; client?: string; vehicle?: string; from?: string; to?: string; status?: string };

const STATUSES = ["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA", "VENCIDA", "CONVERTIDA"] as const;

export function WorkshopFilters({ lang, tab, view, values, statusFilter = false }: { lang: string; tab: string; view?: string; values: Values; statusFilter?: boolean }) {
  const es = lang === "es";
  const field = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  return <form method="get" className="mx-auto w-full max-w-6xl rounded-xl border border-slate-300 bg-white p-4">
    <input type="hidden" name="tab" value={tab} />{view && <input type="hidden" name="view" value={view} />}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-semibold text-slate-700">{es ? "Buscar" : "Search"}<input name="q" defaultValue={values.q} className={field} placeholder={es ? "Folio, servicio, teléfono…" : "Number, service, phone…"} /></label>
      {tab !== "inventory" && <label className="text-xs font-semibold text-slate-700">{es ? "Cliente" : "Customer"}<input name="client" defaultValue={values.client} className={field} placeholder={es ? "Nombre o teléfono" : "Name or phone"} /></label>}
      {tab !== "inventory" && <label className="text-xs font-semibold text-slate-700">{es ? "Vehículo" : "Vehicle"}<input name="vehicle" defaultValue={values.vehicle} className={field} placeholder={es ? "Marca, modelo o placas" : "Make, model or plate"} /></label>}
      {statusFilter && <label className="text-xs font-semibold text-slate-700">{es ? "Estado" : "Status"}<select name="status" defaultValue={values.status || ""} className={field}><option value="">{es ? "Todas" : "All"}</option>{STATUSES.map((status) => <option key={status} value={status}>{status.charAt(0) + status.slice(1).toLocaleLowerCase(es ? "es-MX" : "en-US")}</option>)}</select></label>}
      <label className="text-xs font-semibold text-slate-700">{es ? "Desde" : "From"}<input type="date" name="from" defaultValue={values.from} className={field} /></label>
      <label className="text-xs font-semibold text-slate-700">{es ? "Hasta" : "To"}<input type="date" name="to" defaultValue={values.to} className={field} /></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-md bg-[#245A9F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1C4A84]">{es ? "Filtrar" : "Filter"}</button><a href={`/portal/workshop?tab=${tab}${view ? `&view=${view}` : ""}`} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">{es ? "Limpiar" : "Clear"}</a></div>
  </form>;
}
