"use client";

// Selector con buscador: como un <select>, pero se escribe para filtrar.
// Para listas que crecen (prospectos, propiedades) donde desplazarse por
// todas las opciones hace perder tiempo.

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchOption {
  id: string;
  label: string;
  /** Texto chico debajo (teléfono, colonia…); también cuenta para buscar. */
  hint?: string | null;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  emptyText,
  allowEmpty = false,
  required = false,
  className,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  options: SearchOption[];
  placeholder: string;
  /** Mensaje cuando el texto no coincide con nada. */
  emptyText: string;
  /** Permite dejarlo sin elegir (botón para limpiar). */
  allowEmpty?: boolean;
  required?: boolean;
  className?: string;
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value) ?? null;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);

  const term = fold(text.trim());
  const shown = (term ? options.filter((o) => fold(`${o.label} ${o.hint ?? ""}`).includes(term)) : options).slice(0, 50);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(o: SearchOption) {
    onChange(o.id);
    setText("");
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setText("");
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          required={required && !value}
          value={open ? text : (selected?.label ?? "")}
          placeholder={selected?.label ?? placeholder}
          onFocus={() => {
            setOpen(true);
            setText("");
            setActive(0);
          }}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKey}
          className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 pr-14 text-sm text-slate-900 placeholder:text-slate-500 focus:border-[#063C82] focus:outline-none focus:ring-2 focus:ring-[#063C82]/20"
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-slate-400">
          {allowEmpty && value && (
            <button
              type="button"
              className="pointer-events-auto rounded p-0.5 hover:text-slate-700"
              aria-label="Limpiar"
              onClick={() => {
                onChange("");
                setText("");
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">{emptyText}</li>
          ) : (
            shown.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={o.id === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("cursor-pointer rounded px-3 py-1.5 text-sm", i === active ? "bg-[#F2F4F6]" : "", o.id === value ? "font-semibold text-[#031738]" : "text-slate-700")}
              >
                {o.label}
                {o.hint && <span className="block text-xs font-normal text-slate-500">{o.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
