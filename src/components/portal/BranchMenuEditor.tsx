"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { usePreferences } from "@/context/preferences";
import { setBranchDishAvailable, setBranchVariantPrice } from "@/actions/branch-menu";
import { getErrorMessage } from "@/lib/user-error";
import { cn } from "@/lib/utils";

export interface BranchMenuVariant {
  id: string;
  label: string;
  basePrice: number;
  /** Price this branch fixed, or null to follow the base price. */
  branchPrice: number | null;
}

export interface BranchMenuDish {
  id: string;
  name: string;
  categoryName: string | null;
  available: boolean;
  variants: BranchMenuVariant[];
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const money = (n: number) => `$${n.toFixed(2)}`;

/** Per-branch menu: show/hide each dish and set the branch's own price per variant. */
export function BranchMenuEditor({ branchId, dishes, canManage }: { branchId: string; dishes: BranchMenuDish[]; canManage: boolean }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  function run(fn: () => Promise<unknown>, fallback: string) {
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        toast.error(getErrorMessage(e, fallback));
      }
    });
  }

  const q = norm(query);
  const visible = dishes.filter((d) => !q || norm(d.name).includes(q));
  const groups = new Map<string, BranchMenuDish[]>();
  for (const d of visible) {
    const key = d.categoryName ?? (es ? "Sin categoría" : "No category");
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }

  return (
    <div>
      <div className="relative mb-3 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={es ? "Buscar platillo…" : "Search dish…"}
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500"
        />
      </div>
      {groups.size === 0 && <p className="py-6 text-center text-sm text-slate-500">{es ? "Ningún platillo coincide." : "No dish matches."}</p>}
      {[...groups].map(([category, list]) => (
        <section key={category} className="mb-4 overflow-hidden rounded-lg border border-slate-200">
          <h3 className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">{category}</h3>
          <ul className="divide-y divide-slate-100">
            {list.map((d) => (
              <li key={d.id} className={cn("flex flex-wrap items-start gap-3 px-4 py-3", !d.available && "bg-slate-50 opacity-70")}>
                <label className="flex min-w-[10rem] flex-1 items-center gap-2 text-sm font-medium text-slate-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-orange-500"
                    checked={d.available}
                    disabled={!canManage || pending}
                    onChange={(e) => run(() => setBranchDishAvailable(branchId, d.id, e.target.checked), es ? "No se pudo guardar" : "Couldn't save")}
                  />
                  {d.name}
                  {!d.available && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{es ? "Oculto aquí" : "Hidden here"}</span>}
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {d.variants.map((v) => (
                    <label key={`${v.id}-${v.branchPrice ?? "base"}`} className="flex items-center gap-1.5 text-xs text-slate-600">
                      {d.variants.length > 1 && <span className="font-medium">{v.label}</span>}
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        defaultValue={v.branchPrice ?? ""}
                        placeholder={money(v.basePrice)}
                        disabled={!canManage || pending}
                        aria-label={`${es ? "Precio" : "Price"} ${d.name} ${v.label}`}
                        className={cn("h-8 w-24 text-right text-sm", v.branchPrice !== null && "border-brand-400 bg-brand-50")}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const next = raw === "" ? null : Number(raw);
                          if (next !== null && !Number.isFinite(next)) return;
                          if (next === v.branchPrice) return;
                          run(() => setBranchVariantPrice(branchId, v.id, next), es ? "No se pudo guardar el precio" : "Couldn't save the price");
                        }}
                      />
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs text-slate-400">
        {es
          ? "Un precio vacío usa el precio base. La caja toma los cambios al tocar “Actualizar” en el POS."
          : "An empty price uses the base price. The register picks up changes when you tap “Refresh” in the POS."}
      </p>
    </div>
  );
}
