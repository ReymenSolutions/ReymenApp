"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { matchesSearch } from "@/lib/search-text";

export type SearchableOption = { value: string; label: string; hint?: string };

/**
 * Lista desplegable con búsqueda por texto: cuando las opciones crecen se escribe para encontrar la que se busca (sin
 * acentos ni mayúsculas, por varias palabras). Teclado: ↑ ↓ para moverse, Enter para elegir, Esc para cerrar.
 * Con `name` se comporta como un campo de formulario (manda su valor en un campo oculto).
 */
export function SearchableSelect({ options, value, onChange, name, label, placeholder, allLabel, noResults, className }: {
  options: SearchableOption[];
  value: string;
  onChange?: (value: string) => void;
  name?: string;
  label: string;
  placeholder?: string;
  /** Texto de la opción "sin filtro" (valor vacío). */
  allLabel: string;
  noResults: string;
  className?: string;
}) {
  const id = useId();
  const [current, setCurrent] = useState(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setCurrent(value), [value]);
  const all = useMemo<SearchableOption[]>(() => [{ value: "", label: allLabel }, ...options], [options, allLabel]);
  const shown = useMemo(() => (query ? all.filter((o) => o.value !== "" && matchesSearch(query, o.label, o.hint)) : all), [all, query]);
  const selected = all.find((o) => o.value === current);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  function choose(v: string) {
    setCurrent(v);
    onChange?.(v);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open) {
      e.preventDefault(); // no manda el formulario: solo elige
      if (shown[active]) choose(shown[active].value);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const listId = `${id}-list`;
  return (
    <div ref={root} className={cn("relative", className)}>
      <label htmlFor={`${id}-input`} className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {name && <input type="hidden" name={name} value={current} />}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          ref={input}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          value={open ? query : (selected?.label ?? "")}
          placeholder={open ? (selected?.label ?? placeholder) : placeholder}
          onFocus={() => { setOpen(true); setActive(0); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-md border border-slate-200 bg-transparent pl-8 pr-14 text-sm outline-none focus:border-brand-500"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {current !== "" && (
            <button type="button" aria-label={allLabel} onClick={() => choose("")} className="rounded p-1 text-slate-400 hover:text-slate-700">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" tabIndex={-1} aria-label={label} onClick={() => { setOpen((o) => !o); input.current?.focus(); }} className="rounded p-1 text-slate-400 hover:text-slate-700">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute z-30 mt-1 max-h-64 w-full min-w-[12rem] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">{noResults}</li>
          ) : (
            shown.map((o, i) => (
              <li
                key={o.value || "__all"}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={o.value === current}
                onMouseDown={(e) => { e.preventDefault(); choose(o.value); }}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5", i === active ? "bg-brand-50 text-brand-900" : "text-slate-800")}
              >
                <span className="min-w-0 truncate">{o.label}{o.hint && <span className="ml-2 text-xs text-slate-400">{o.hint}</span>}</span>
                {o.value === current && <Check className="h-3.5 w-3.5 flex-shrink-0 text-brand-600" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
