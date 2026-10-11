"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FoodDishFormDialog, type FoodCategoryOption, type FoodInventoryOption, type FoodModifierGroupOption } from "@/components/portal/FoodDishFormDialog";
import { FoodDishActiveToggle } from "@/components/portal/FoodDishActiveToggle";
import { usePreferences } from "@/context/preferences";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { cn } from "@/lib/utils";

export interface DishListVariant {
  id: string;
  label: string;
  price: number;
  cost: number;
  marginPct: number | null;
  ingredients: { inventoryItemId: string; quantity: number }[];
}

export interface DishListDish {
  id: string;
  name: string;
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
  modifierGroupIds: string[];
  variants: DishListVariant[];
}

function marginColor(marginPct: number | null): string {
  if (marginPct === null) return "text-slate-400";
  if (marginPct < 15) return "text-red-600";
  if (marginPct < 30) return "text-amber-600";
  return "text-emerald-600";
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const NO_CATEGORY = "__none__";

/** Dishes grouped by category (collapsible, with search); clicking anywhere on a dish opens its editor. */
export function FoodDishList({
  dishes,
  inventoryItems,
  categories,
  modifierGroups,
  canManage,
}: {
  dishes: DishListDish[];
  inventoryItems: FoodInventoryOption[];
  categories: FoodCategoryOption[];
  modifierGroups: FoodModifierGroupOption[];
  canManage: boolean;
}) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const f = pickDict(foodStrings, lang);
  const [query, setQuery] = useState("");
  // A long menu starts collapsed so categories are easy to scan; a short one starts open.
  const [open, setOpen] = useState<Set<string>>(() => (dishes.length <= 12 ? new Set([...categories.map((c) => c.id), NO_CATEGORY]) : new Set()));

  const q = norm(query);
  const sections = useMemo(() => {
    const matches = (d: DishListDish) => !q || norm(d.name).includes(q);
    const out = categories.map((c) => ({ id: c.id, name: c.name, dishes: dishes.filter((d) => d.categoryId === c.id && matches(d)) }));
    out.push({ id: NO_CATEGORY, name: es ? "Sin categoría" : "No category", dishes: dishes.filter((d) => !d.categoryId && matches(d)) });
    return out.filter((s) => s.dishes.length > 0);
  }, [dishes, categories, q, es]);

  const allIds = sections.map((s) => s.id);
  const isOpen = (id: string) => !!q || open.has(id);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-6">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={es ? "Buscar platillo…" : "Search dish…"}
            className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
          />
        </div>
        {!q && sections.length > 1 && (
          <div className="flex gap-1 text-xs font-medium">
            <button type="button" onClick={() => setOpen(new Set(allIds))} className="rounded-md px-2 py-1.5 text-brand-700 hover:bg-brand-50">
              {es ? "Expandir todo" : "Expand all"}
            </button>
            <button type="button" onClick={() => setOpen(new Set())} className="rounded-md px-2 py-1.5 text-slate-600 hover:bg-slate-100">
              {es ? "Contraer todo" : "Collapse all"}
            </button>
          </div>
        )}
      </div>

      {sections.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-slate-500">{es ? "Ningún platillo coincide." : "No dish matches."}</p>
      ) : (
        sections.map((s) => (
          <section key={s.id} className="border-b border-slate-100 last:border-b-0">
            <button
              type="button"
              onClick={() => toggle(s.id)}
              aria-expanded={isOpen(s.id)}
              className="flex w-full items-center gap-2 bg-slate-50 px-4 py-2.5 text-left hover:bg-slate-100 sm:px-6"
            >
              {isOpen(s.id) ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
              <span className="text-sm font-semibold text-slate-800">{s.name}</span>
              <span className="text-xs text-slate-400">{f.dishCount(s.dishes.length)}</span>
            </button>
            {isOpen(s.id) && (
              <ul className="divide-y divide-slate-100">
                {s.dishes.map((dish) => (
                  <DishRow
                    key={dish.id}
                    dish={dish}
                    inventoryItems={inventoryItems}
                    categories={categories}
                    modifierGroups={modifierGroups}
                    canManage={canManage}
                  />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}

function DishRow({
  dish,
  inventoryItems,
  categories,
  modifierGroups,
  canManage,
}: {
  dish: DishListDish;
  inventoryItems: FoodInventoryOption[];
  categories: FoodCategoryOption[];
  modifierGroups: FoodModifierGroupOption[];
  canManage: boolean;
}) {
  const { lang } = usePreferences();
  const f = pickDict(foodStrings, lang);
  const [editing, setEditing] = useState(false);
  const groupById = new Map(modifierGroups.map((g) => [g.id, g]));

  return (
    <li className={cn("flex items-start gap-2 px-4 py-3 sm:px-6", !dish.isActive && "opacity-50")}>
      {/* The whole dish is the click target; the pencil and the toggle stay as they were. */}
      <div
        role={canManage ? "button" : undefined}
        tabIndex={canManage ? 0 : undefined}
        aria-label={canManage ? `${lang === "es" ? "Editar" : "Edit"} ${dish.name}` : undefined}
        onClick={canManage ? () => setEditing(true) : undefined}
        onKeyDown={
          canManage
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditing(true);
                }
              }
            : undefined
        }
        className={cn("min-w-0 flex-1 rounded-md", canManage && "-m-1 cursor-pointer p-1 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-900">{dish.name}</p>
          {!dish.isActive && <Badge variant="secondary" className="text-[10px]">{f.inactive}</Badge>}
        </div>
        <ul className="mt-1.5 space-y-0.5 pl-0.5">
          {dish.variants.map((v) => (
            <li key={v.id} className="text-xs text-slate-500">
              {dish.variants.length > 1 && <span className="font-medium text-slate-600">{v.label}: </span>}
              {f.costPriceLine(`$${v.cost.toFixed(2)}`, `$${v.price.toFixed(2)}`)}
              {v.marginPct !== null && <span className={cn("ml-1 font-medium", marginColor(v.marginPct))}>{f.marginLine(v.marginPct)}</span>}
            </li>
          ))}
        </ul>
        {dish.modifierGroupIds.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1 pl-0.5">
            {dish.modifierGroupIds.map((gid) => {
              const g = groupById.get(gid);
              if (!g) return null;
              return (
                <span key={gid} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {g.name}
                </span>
              );
            })}
          </div>
        )}
      </div>
      {canManage && (
        <div className="flex flex-shrink-0 items-center gap-1">
          <FoodDishFormDialog
            inventoryItems={inventoryItems}
            categories={categories}
            modifierGroups={modifierGroups}
            open={editing}
            onOpenChange={setEditing}
            dish={{
              id: dish.id,
              name: dish.name,
              categoryId: dish.categoryId,
              modifierGroupIds: dish.modifierGroupIds,
              variants: dish.variants.map((v) => ({ id: v.id, label: v.label, price: v.price, ingredients: v.ingredients })),
            }}
          />
          <FoodDishActiveToggle dishId={dish.id} isActive={dish.isActive} />
        </div>
      )}
    </li>
  );
}
