"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ClipboardList, Loader2, PackagePlus, Plus, Soup, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { recordInventoryAdjustment } from "@/actions/food-inventory";
import { usePreferences } from "@/context/preferences";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/user-error";

// Ajustes rápidos de inventario (Food → Inventario): ingreso de stock,
// producción de preparados, desecho y conteo. Cada uno es un solo
// formulario con varios insumos; el insumo se busca escribiendo y Enter en
// la cantidad agrega otra fila, para capturar sin soltar el teclado.

export interface QuickAdjustItem {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
}

/** Última producción de cada preparado: sus insumos se proponen solos. */
export type ProductionTemplates = Record<string, { quantity: number; inputs: { itemId: string; quantity: number }[] }>;

type Kind = "in" | "production" | "waste" | "count";

const TEXT = {
  es: {
    title: "¿Qué ajuste de inventario quieres hacer?",
    kinds: {
      in: ["Ingreso de stock", "Sumar existencias que llegaron"],
      production: ["Producción de preparados", "Convertir insumos en un preparado"],
      waste: ["Desecho de stock", "Restar merma, con motivo"],
      count: ["Conteo de stock", "Capturar lo que hay físicamente"],
    },
    item: "Insumo",
    search: "Escribe para buscar…",
    qty: "Cantidad",
    addRow: "Otro insumo",
    unknown: "No existe ese insumo",
    output: "Preparado que se obtuvo",
    outputQty: "Cantidad producida",
    inputs: "Insumos que se usaron",
    template: "Se propusieron los insumos de la última producción; ajústalos si cambió.",
    reason: "Motivo",
    reasons: ["Caducado", "Se echó a perder", "Se cayó / se rompió", "Mal preparado", "Cortesía"],
    note: "Nota (opcional)",
    system: "Sistema",
    counted: "Contado",
    countHint: "Captura solo lo que contaste; lo que dejes vacío no cambia.",
    filter: "Filtrar insumos…",
    save: "Guardar",
    cancel: "Cancelar",
    done: (n: number) => `Listo: ${n} movimiento(s) registrado(s)`,
    nothing: "No hubo cambios.",
  },
  en: {
    title: "What inventory adjustment do you want to make?",
    kinds: {
      in: ["Stock in", "Add stock that arrived"],
      production: ["Prepared items", "Turn supplies into a prepared item"],
      waste: ["Waste", "Remove spoiled stock, with a reason"],
      count: ["Stock count", "Enter what is physically there"],
    },
    item: "Supply item",
    search: "Type to search…",
    qty: "Quantity",
    addRow: "Another item",
    unknown: "No such supply item",
    output: "Prepared item obtained",
    outputQty: "Quantity produced",
    inputs: "Supplies used",
    template: "Supplies from the last production were filled in; adjust them if it changed.",
    reason: "Reason",
    reasons: ["Expired", "Spoiled", "Dropped / broken", "Badly prepared", "Courtesy"],
    note: "Note (optional)",
    system: "System",
    counted: "Counted",
    countHint: "Enter only what you counted; empty rows don't change.",
    filter: "Filter supplies…",
    save: "Save",
    cancel: "Cancel",
    done: (n: number) => `Done: ${n} movement(s) recorded`,
    nothing: "Nothing changed.",
  },
} as const;

const ICONS: Record<Kind, React.ElementType> = { in: PackagePlus, production: Soup, waste: Trash2, count: ClipboardList };
const KIND_CLS: Record<Kind, string> = {
  in: "text-emerald-600 bg-emerald-50",
  production: "text-orange-500 bg-orange-50",
  waste: "text-red-600 bg-red-50",
  count: "text-brand-600 bg-brand-50",
};

interface Row {
  key: number;
  name: string;
  qty: string;
}

const fmt = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 3 });

export function FoodInventoryQuickAdjust({ items, templates, branchId }: { items: QuickAdjustItem[]; templates: ProductionTemplates; branchId?: string | null }) {
  const { lang } = usePreferences();
  const t = TEXT[lang === "en" ? "en" : "es"];
  const [kind, setKind] = useState<Kind | null>(null);
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-700">{t.title}</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {(Object.keys(t.kinds) as Kind[]).map((k) => {
          const Icon = ICONS[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-300 hover:bg-slate-50"
            >
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", KIND_CLS[k])}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{t.kinds[k][0]}</span>
                <span className="block text-xs text-slate-500">{t.kinds[k][1]}</span>
              </span>
            </button>
          );
        })}
      </div>
      {kind && <AdjustDialog key={kind} kind={kind} items={items} templates={templates} branchId={branchId ?? null} onClose={() => setKind(null)} />}
    </div>
  );
}

function AdjustDialog({ kind, items, templates, branchId, onClose }: { kind: Kind; items: QuickAdjustItem[]; templates: ProductionTemplates; branchId: string | null; onClose: () => void }) {
  const { lang } = usePreferences();
  const t = TEXT[lang === "en" ? "en" : "es"];
  const listId = useId();
  const nextKey = useRef(1);
  const [rows, setRows] = useState<Row[]>([{ key: 0, name: "", qty: "" }]);
  const [output, setOutput] = useState({ name: "", qty: "" });
  const [usedTemplate, setUsedTemplate] = useState(false);
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRefs = useRef(new Map<number, HTMLInputElement>());

  const byName = useMemo(() => new Map(items.map((i) => [i.name.trim().toLowerCase(), i])), [items]);
  const find = (name: string) => byName.get(name.trim().toLowerCase()) ?? null;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function addRow(focus = true) {
    const key = nextKey.current++;
    setRows((r) => [...r, { key, name: "", qty: "" }]);
    if (focus) setTimeout(() => inputRefs.current.get(key)?.focus(), 0);
  }

  function chooseOutput(name: string) {
    setOutput((o) => ({ ...o, name }));
    const item = find(name);
    const tpl = item ? templates[item.id] : undefined;
    if (!tpl || rows.some((r) => r.name || r.qty)) return;
    const produced = Number(output.qty) > 0 ? Number(output.qty) : tpl.quantity;
    const factor = produced / tpl.quantity;
    setOutput({ name, qty: String(produced) });
    setRows(
      tpl.inputs
        .filter((i) => byId.has(i.itemId))
        .map((i) => ({ key: nextKey.current++, name: byId.get(i.itemId)!.name, qty: String(Math.round(i.quantity * factor * 1000) / 1000) })),
    );
    setUsedTemplate(true);
  }

  async function save() {
    setBusy(true);
    try {
      let lines: { itemId: string; quantity: number }[];
      if (kind === "count") {
        lines = Object.entries(counts)
          .filter(([, v]) => v.trim() !== "")
          .map(([itemId, v]) => ({ itemId, quantity: Number(v) }));
      } else {
        const filled = rows.filter((r) => r.name.trim() || r.qty.trim());
        const unknown = filled.find((r) => !find(r.name));
        if (unknown) throw new Error(`${t.unknown}: "${unknown.name}"`);
        lines = filled.map((r) => ({ itemId: find(r.name)!.id, quantity: Number(r.qty) || 0 }));
      }
      const out = kind === "production" ? find(output.name) : null;
      if (kind === "production" && output.name && !out) throw new Error(`${t.unknown}: "${output.name}"`);
      const result = await recordInventoryAdjustment({
        kind,
        lines,
        output: out ? { itemId: out.id, quantity: Number(output.qty) || 0 } : undefined,
        note: note || undefined,
        branchId,
      });
      toast.success(result.movements > 0 ? t.done(result.movements) : t.nothing);
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, lang === "en" ? "Couldn't save" : "No se pudo guardar"));
    } finally {
      setBusy(false);
    }
  }

  const Icon = ICONS[kind];
  const visible = kind === "count" ? items.filter((i) => i.name.toLowerCase().includes(filter.trim().toLowerCase())) : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", KIND_CLS[kind])}>
              <Icon className="h-4 w-4" />
            </span>
            {t.kinds[kind][0]}
          </DialogTitle>
        </DialogHeader>
        <datalist id={listId}>
          {items.map((i) => (
            <option key={i.id} value={i.name}>
              {i.unit}
            </option>
          ))}
        </datalist>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {kind === "count" ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">{t.countHint}</p>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t.filter}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                autoFocus
              />
              <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                {visible.map((i) => {
                  const v = counts[i.id] ?? "";
                  const diff = v.trim() === "" ? null : Number(v) - i.currentStock;
                  return (
                    <div key={i.id} className="grid grid-cols-[1fr_auto_6.5rem] items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{i.name}</span>
                        <span className="text-xs text-slate-500">
                          {t.system}: {fmt(i.currentStock)} {i.unit}
                        </span>
                      </span>
                      <span className={cn("text-xs tabular-nums", diff === null ? "text-transparent" : diff < 0 ? "text-red-600" : diff > 0 ? "text-emerald-600" : "text-slate-400")}>
                        {diff === null ? "0" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.001"
                        min="0"
                        value={v}
                        placeholder={t.counted}
                        aria-label={`${t.counted} ${i.name}`}
                        onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value }))}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm outline-none focus:border-brand-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {kind === "production" && (
                <div className="grid grid-cols-[1fr_8rem] gap-2 rounded-lg bg-orange-50/60 p-3">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">{t.output}</span>
                    <input
                      list={listId}
                      value={output.name}
                      onChange={(e) => chooseOutput(e.target.value)}
                      placeholder={t.search}
                      autoFocus
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">
                      {t.outputQty}
                      {find(output.name) ? ` (${find(output.name)!.unit})` : ""}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min="0"
                      value={output.qty}
                      onChange={(e) => setOutput((o) => ({ ...o, qty: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-right text-sm outline-none focus:border-brand-500"
                    />
                  </label>
                </div>
              )}
              <div className="space-y-2">
                {kind === "production" && <p className="text-xs font-medium text-slate-600">{t.inputs}</p>}
                {usedTemplate && <p className="text-xs text-orange-700">{t.template}</p>}
                {rows.map((r, idx) => {
                  const item = r.name ? find(r.name) : null;
                  return (
                    <div key={r.key} className="grid grid-cols-[1fr_7.5rem_auto] items-start gap-2">
                      <div>
                        <input
                          ref={(el) => {
                            if (el) inputRefs.current.set(r.key, el);
                            else inputRefs.current.delete(r.key);
                          }}
                          list={listId}
                          value={r.name}
                          onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))}
                          placeholder={t.search}
                          aria-label={t.item}
                          autoFocus={idx === 0 && kind !== "production"}
                          className={cn(
                            "w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-brand-500",
                            r.name && !item ? "border-red-300" : "border-slate-300",
                          )}
                        />
                        {item && (
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {t.system}: {fmt(item.currentStock)} {item.unit}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          min="0"
                          value={r.qty}
                          placeholder={t.qty}
                          aria-label={t.qty}
                          onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)))}
                          onKeyDown={(e) => {
                            // Enter on the last row adds another one instead of saving.
                            if (e.key === "Enter" && idx === rows.length - 1 && r.name && r.qty) {
                              e.preventDefault();
                              addRow();
                            }
                          }}
                          className="w-full rounded-md border border-slate-300 py-2 pl-3 pr-10 text-right text-sm outline-none focus:border-brand-500"
                        />
                        <span className="pointer-events-none absolute right-2 top-2 text-xs text-slate-400">{item?.unit ?? ""}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [{ key: nextKey.current++, name: "", qty: "" }]))}
                        className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Quitar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" onClick={() => addRow()}>
                  <Plus className="h-3.5 w-3.5" />
                  {t.addRow}
                </Button>
              </div>
            </>
          )}

          {kind === "waste" ? (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">{t.reason} *</span>
              <div className="flex flex-wrap gap-1.5">
                {t.reasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setNote(r)}
                    className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", note === r ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600")}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
          ) : (
            <input
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.note}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
