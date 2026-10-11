"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createFoodPurchase } from "@/actions/food-inventory";
import { usePreferences } from "@/context/preferences";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { getErrorMessage } from "@/lib/user-error";
import { formatMoney } from "@/lib/utils";

export interface PurchasableItem {
  id: string;
  name: string;
  unit: string;
  unitCost: number | null;
}

interface Line {
  key: number;
  inventoryItemId: string;
  quantity: string;
  unitCost: string;
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const selectClass = "h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-brand-500";

/** Captura de una compra: proveedor, fecha y renglones insumo/cantidad/costo. */
export function FoodPurchaseForm({ suppliers, items, branches = [] }: { suppliers: { id: string; name: string }[]; items: PurchasableItem[]; /** Con inventario por sucursal: a cuál se recibe la compra. */ branches?: { id: string; name: string }[] }) {
  const { lang } = usePreferences();
  const f = pickDict(foodStrings, lang);
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: 0, inventoryItemId: "", quantity: "", unitCost: "" }]);
  const [nextKey, setNextKey] = useState(1);
  const [loading, setLoading] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const total = lines.reduce((sum, l) => {
    const q = Number(l.quantity);
    const c = Number(l.unitCost);
    return Number.isFinite(q) && Number.isFinite(c) ? sum + q * c : sum;
  }, 0);

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // Al elegir el insumo se propone su costo actual; el usuario lo corrige si pagó otro precio.
        if (patch.inventoryItemId !== undefined && !l.unitCost) {
          const cost = byId.get(patch.inventoryItemId)?.unitCost;
          if (cost !== null && cost !== undefined) next.unitCost = String(cost);
        }
        return next;
      })
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createFoodPurchase({
        supplierId: supplierId || null,
        // Mediodía local para que la fecha no se corra de día por la zona horaria.
        purchasedAt: new Date(`${date}T12:00:00`).toISOString(),
        notes: notes || undefined,
        branchId: branchId || null,
        items: lines.map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
      });
      toast.success(f.purchaseSaved);
      setLines([{ key: nextKey, inventoryItemId: "", quantity: "", unitCost: "" }]);
      setNextKey((k) => k + 1);
      setNotes("");
    } catch (err) {
      toast.error(getErrorMessage(err, lang === "es" ? "Error al guardar" : "Error saving"));
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) return <p className="text-sm text-slate-500">{f.needSuppliesFirst}</p>;

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className="space-y-1">
          <Label htmlFor="purchase-supplier" className="text-xs text-slate-600">{f.purchaseSupplier}</Label>
          <select id="purchase-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
            <option value="">{f.noSupplierOption}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        {branches.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor="purchase-branch" className="text-xs text-slate-600">{lang === "es" ? "Sucursal que la recibe" : "Receiving branch"}</Label>
            <select id="purchase-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectClass}>
              <option value="">{lang === "es" ? "Principal" : "Main"}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="purchase-date" className="text-xs text-slate-600">{f.purchaseDate}</Label>
          <Input id="purchase-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((l) => {
          const item = byId.get(l.inventoryItemId);
          return (
            <div key={l.key} className="rounded-md border border-slate-200 p-2.5">
              <div className="flex items-center gap-2">
                <select
                  aria-label={f.purchaseItem}
                  required
                  value={l.inventoryItemId}
                  onChange={(e) => updateLine(l.key, { inventoryItemId: e.target.value })}
                  className={selectClass}
                >
                  <option value="">{f.selectSupply}</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    className="h-8 w-8 shrink-0 p-0 text-slate-400 hover:text-red-600"
                    title={f.removePurchaseLine}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`qty-${l.key}`} className="text-[11px] text-slate-500">
                    {f.purchaseQty}{item ? ` (${item.unit})` : ""}
                  </Label>
                  <Input id={`qty-${l.key}`} type="number" step="0.001" min="0.001" required value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`cost-${l.key}`} className="text-[11px] text-slate-500">{f.purchaseUnitCost}</Label>
                  <Input id={`cost-${l.key}`} type="number" step="0.01" min="0" required value={l.unitCost} onChange={(e) => updateLine(l.key, { unitCost: e.target.value })} />
                </div>
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLines((prev) => [...prev, { key: nextKey, inventoryItemId: "", quantity: "", unitCost: "" }]);
            setNextKey((k) => k + 1);
          }}
          className="self-start"
        >
          <Plus className="h-3.5 w-3.5" />
          {f.addPurchaseLine}
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="purchase-notes" className="text-xs text-slate-600">{f.purchaseNotes}</Label>
        <Textarea id="purchase-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-500">{f.purchaseTotal}</span>
        <span className="text-base font-semibold text-slate-900">{formatMoney(total)}</span>
      </div>

      <Button type="submit" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {f.savePurchase}
      </Button>
    </form>
  );
}
