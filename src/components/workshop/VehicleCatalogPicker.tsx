"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export function VehicleCatalogPicker({ name, label, value, onChange, options, placeholder }: {
  name: string; label: string; value: string; onChange: (value: string) => void; options: string[]; placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const matches = options.filter((option) => option.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase())).slice(0, 40);
  return <label className="min-w-0 text-sm text-slate-700">{label}<span className="relative mt-1 block">
    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    <input name={name} value={value} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} autoComplete="off" required maxLength={80} placeholder={placeholder} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${name}-options`} className="w-full min-w-0 rounded-md border border-slate-300 bg-white py-2 pl-9 pr-10 text-sm text-slate-900" />
    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen(!open)} aria-label={`${label}: ${open ? "cerrar / close" : "ver opciones / show options"}`} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-slate-600"><ChevronDown aria-hidden="true" className="h-4 w-4" /></button>
    {open && <span id={`${name}-options`} role="listbox" className="absolute z-30 mt-1 block max-h-52 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">{matches.length ? matches.map((option) => <button key={option} type="button" role="option" aria-selected={option === value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option); setOpen(false); }} className="block w-full rounded px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100">{option}</button>) : <span className="block px-3 py-2 text-xs text-slate-500">{value ? "Puedes escribir un valor nuevo / You can type a new value" : "Sin opciones / No options"}</span>}</span>}
  </span></label>;
}
