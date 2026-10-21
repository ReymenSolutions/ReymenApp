// Barra de filtros por GET (sin JS): los filtros viven en la URL.

export interface FilterField {
  name: string;
  label: string;
  value?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export function FilterBar({ fields, submitLabel, extra }: { fields: FilterField[]; submitLabel: string; extra?: React.ReactNode }) {
  return (
    <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          {f.label}
          {f.options ? (
            <select name={f.name} defaultValue={f.value ?? ""} className="h-9 min-w-[9rem] rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800">
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input name={f.name} defaultValue={f.value ?? ""} placeholder={f.placeholder} className="h-9 w-48 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800" />
          )}
        </label>
      ))}
      <button type="submit" className="h-9 rounded-md bg-[#031738] px-4 text-sm font-semibold text-white hover:bg-[#04275A]">{submitLabel}</button>
      {extra}
    </form>
  );
}
