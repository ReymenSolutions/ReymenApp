"use client";

import { useState } from "react";
import { ArrowLeftRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IngredientCombobox, type IngredientOption } from "@/components/portal/IngredientCombobox";
import { transferInventoryBetweenBranches } from "@/actions/food-inventory";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

interface Row {
  key: number;
  itemId: string;
  quantity: string;
}

const selectClass = "h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus:border-brand-500";

/** Traspaso de existencias entre sucursales (la Principal incluida): sale de una y entra a la otra. */
export function FoodTransferDialog({ items, branches, defaultFrom }: { items: IngredientOption[]; branches: { id: string; name: string }[]; defaultFrom: string | null }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom ?? "");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([{ key: 0, itemId: "", quantity: "" }]);
  const [nextKey, setNextKey] = useState(1);
  const [busy, setBusy] = useState(false);
  const unit = new Map(items.map((i) => [i.id, i.unit]));
  const places = [{ id: "", name: es ? "Principal" : "Main" }, ...branches];

  async function save() {
    setBusy(true);
    try {
      const result = await transferInventoryBetweenBranches({
        fromBranchId: from || null,
        toBranchId: to || null,
        note: note || undefined,
        lines: rows.filter((r) => r.itemId).map((r) => ({ itemId: r.itemId, quantity: Number(r.quantity) })),
      });
      toast.success(es ? `Traspaso registrado (${result.movements} movimientos)` : `Transfer recorded (${result.movements} movements)`);
      setOpen(false);
      setRows([{ key: nextKey, itemId: "", quantity: "" }]);
      setNextKey((k) => k + 1);
      setNote("");
    } catch (e) {
      toast.error(getErrorMessage(e, es ? "No se pudo hacer el traspaso" : "Couldn't make the transfer"));
    } finally {
      setBusy(false);
    }
  }

  const ready = from !== to && rows.some((r) => r.itemId && Number(r.quantity) > 0) && rows.every((r) => !r.itemId || Number(r.quantity) > 0);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ArrowLeftRight className="h-4 w-4" />
        {es ? "Traspaso entre sucursales" : "Transfer between branches"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{es ? "Traspaso entre sucursales" : "Transfer between branches"}</DialogTitle>
            <DialogDescription>{es ? "Sale de la existencia del origen y entra a la del destino." : "Leaves the origin's stock and enters the destination's."}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-medium text-slate-600">
              {es ? "Origen" : "From"}
              <select value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass}>
                {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-600">
              {es ? "Destino" : "To"}
              <select value={to} onChange={(e) => setTo(e.target.value)} className={selectClass}>
                {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          {from === to && <p className="text-xs text-amber-600">{es ? "Elige un destino distinto del origen." : "Pick a destination different from the origin."}</p>}
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.key} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <IngredientCombobox items={items} value={r.itemId} usedIds={rows.map((x) => x.itemId)} onChange={(id) => setRows((p) => p.map((x) => (x.key === r.key ? { ...x, itemId: id } : x)))} />
                </div>
                <div className="relative w-28">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    min="0"
                    value={r.quantity}
                    placeholder={es ? "Cantidad" : "Quantity"}
                    className="pr-9 text-right"
                    onChange={(e) => setRows((p) => p.map((x) => (x.key === r.key ? { ...x, quantity: e.target.value } : x)))}
                  />
                  <span className="pointer-events-none absolute right-2 top-2.5 text-xs text-slate-400">{unit.get(r.itemId) ?? ""}</span>
                </div>
                {rows.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 text-slate-400 hover:text-red-600" onClick={() => setRows((p) => p.filter((x) => x.key !== r.key))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRows((p) => [...p, { key: nextKey, itemId: "", quantity: "" }]);
                setNextKey((k) => k + 1);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {es ? "Agregar insumo" : "Add item"}
            </Button>
          </div>
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={es ? "Nota (opcional)" : "Note (optional)"} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{es ? "Cancelar" : "Cancel"}</Button>
            <Button type="button" onClick={save} disabled={busy || !ready}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {es ? "Hacer traspaso" : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
