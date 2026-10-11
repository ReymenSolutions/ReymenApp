"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";

export interface IngredientOption {
  id: string;
  name: string;
  unit: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/**
 * Ingredient picker: a real list of supply items to choose from (tap or arrow keys + Enter) that
 * also filters as you type. Choosing sets the item's id, so cost and stock count against it.
 */
export function IngredientCombobox({
  items,
  value,
  usedIds = [],
  onChange,
  inputRef,
}: {
  items: IngredientOption[];
  value: string;
  /** Items already in this recipe: shown with a check, still selectable. */
  usedIds?: string[];
  onChange: (id: string) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const listboxId = useId();
  const current = items.find((i) => i.id === value);
  const [text, setText] = useState(current?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // The form changed the id (e.g. a copied variant): show its name.
  const [shownId, setShownId] = useState(value);
  if (value !== shownId) {
    setShownId(value);
    if (current) setText(current.name);
  }

  const query = norm(text);
  // With a chosen item and untouched text, show the whole list so it can be changed.
  const filtered = useMemo(
    () => (current && norm(current.name) === query ? items : items.filter((i) => norm(i.name).includes(query))),
    [items, query, current],
  );
  const used = new Set(usedIds);
  const unknown = text.trim() !== "" && !current;

  function pick(item: IngredientOption) {
    setText(item.name);
    setShownId(item.id);
    onChange(item.id);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        value={text}
        placeholder={es ? "Insumo (elige o escribe para buscar)" : "Supply item (pick or type to search)"}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          const match = items.find((i) => norm(i.name) === norm(e.target.value));
          if (match) setShownId(match.id);
          onChange(match?.id ?? "");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(filtered.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && open && filtered[active]) {
            e.preventDefault();
            pick(filtered[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "w-full rounded-md border px-3 py-2 pr-8 text-sm outline-none focus:border-brand-500",
          unknown ? "border-red-300" : "border-slate-300",
        )}
      />
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-slate-400" />
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">{es ? "Ningún insumo coincide." : "No supply item matches."}</li>
          ) : (
            filtered.map((item, idx) => (
              <li
                key={item.id}
                role="option"
                aria-selected={item.id === value}
                // mouseDown (not click) so the input's blur doesn't close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
                onMouseEnter={() => setActive(idx)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-slate-800",
                  idx === active ? "bg-brand-50" : "",
                  item.id === value ? "font-semibold" : "",
                )}
              >
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
                  {item.unit}
                  {(item.id === value || used.has(item.id)) && <Check className="h-3.5 w-3.5 text-emerald-600" aria-label={es ? "en la receta" : "in the recipe"} />}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
