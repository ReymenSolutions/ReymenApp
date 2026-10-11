import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { createFoodInventoryItem } from "@/actions/food";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { ActionForm } from "@/components/shared/ActionForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { FoodInventoryItemEditDialog } from "@/components/portal/FoodInventoryItemEditDialog";
import { listBranches, parseBranchParam } from "@/lib/branches";
import { branchStockMap } from "@/lib/food";
import { BranchFilter } from "@/components/portal/BranchFilter";
import { FoodTransferDialog } from "@/components/portal/FoodTransferDialog";
import { FoodStockAdjustDialog } from "@/components/portal/FoodStockAdjustDialog";
import { FoodArchiveButtons } from "@/components/portal/FoodArchiveButtons";
import { FoodInventoryQuickAdjust, type ProductionTemplates } from "@/components/portal/FoodInventoryQuickAdjust";
import { can } from "@/lib/permissions";
import { FOOD_UNIT_LABELS, FOOD_UNITS } from "@/lib/food-units";
import type { FoodInventoryItem, FoodInventoryMovementType } from "@prisma/client";

export default async function FoodInventoryPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;
  const { branch: branchParam } = await searchParams;
  const [orgFlags, branches] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { inventoryPerBranch: true } }),
    listBranches(orgId, { activeOnly: true }),
  ]);
  // Con inventario por sucursal, esta pantalla muestra UNA sucursal a la vez (la Principal por defecto).
  const perBranch = orgFlags.inventoryPerBranch && branches.length > 0;
  const parsedBranch = parseBranchParam(branchParam, branches);
  const stockBranch = perBranch && typeof parsedBranch === "string" ? parsedBranch : null;
  const branchStock = perBranch ? await branchStockMap(orgId, stockBranch) : null;

  const [t, lang, items, movements, productions] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.foodInventoryItem.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    }),
    prisma.foodInventoryMovement.findMany({
      where: { organizationId: orgId, ...(perBranch ? { branchId: stockBranch } : {}) },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { inventoryItem: { select: { name: true, unit: true } } },
    }),
    // Producciones recientes: los insumos de la última de cada preparado se
    // proponen solos en "Producción de preparados".
    prisma.foodInventoryMovement.findMany({
      where: { organizationId: orgId, type: "PRODUCTION", batchId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { batchId: true, inventoryItemId: true, quantity: true },
    }),
  ]);
  const templates: ProductionTemplates = {};
  {
    const batches = new Map<string, { inventoryItemId: string; quantity: number }[]>();
    for (const m of productions) batches.set(m.batchId!, [...(batches.get(m.batchId!) ?? []), { inventoryItemId: m.inventoryItemId, quantity: Number(m.quantity) }]);
    for (const moves of batches.values()) {
      const out = moves.find((m) => m.quantity > 0);
      if (!out || templates[out.inventoryItemId]) continue; // newest batch wins (ordered desc)
      templates[out.inventoryItemId] = {
        quantity: out.quantity,
        inputs: moves.filter((m) => m.quantity < 0).map((m) => ({ itemId: m.inventoryItemId, quantity: -m.quantity })),
      };
    }
  }

  const f = pickDict(foodStrings, lang);
  const qty = (n: number) => n.toLocaleString(f.dateLocale, { maximumFractionDigits: 3 });
  const movementLabel: Record<FoodInventoryMovementType, string> = {
    SALE: f.movSale,
    SALE_CANCELLATION: f.movSaleCancellation,
    MANUAL_DISH_SALES: f.movManualDishSales,
    PURCHASE: f.movPurchase,
    PURCHASE_VOID: f.movPurchaseVoid,
    ADJUSTMENT: f.movAdjustment,
    RECIPE_RECALC: f.movRecipeRecalc,
    STOCK_IN: f.movStockIn,
    PRODUCTION: f.movProduction,
    WASTE: f.movWaste,
    TRANSFER: f.movTransfer,
  };
  const canManage = can(session.user.role, "food:manage");
  const activeItems = items.filter((i) => i.isActive);
  const inactiveItems = items.filter((i) => !i.isActive);
  // Existencia de la sucursal elegida (sin fila = 0); sin sucursales, la general.
  const stockOf = (i: FoodInventoryItem) => (branchStock ? (branchStock.get(i.id) ?? 0) : Number(i.currentStock));
  const hasNegative = activeItems.some((i) => stockOf(i) < 0);

  const renderItem = (item: FoodInventoryItem) => {
    const stock = stockOf(item);
    const low = item.isActive && stock <= Number(item.minStock);
    return (
      <li key={item.id} className="flex items-center justify-between gap-3 px-6 py-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-900">{item.name}</p>
            <Badge variant="secondary" className="text-[10px]">
              {item.category === "NON_EDIBLE" ? f.nonEdible : f.edible}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            {f.minimumLabel(Number(item.minStock), item.unit)}
            {item.unitCost !== null && f.unitCostLabel(`$${Number(item.unitCost).toFixed(2)}`)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className={stock < 0 ? "text-sm font-semibold text-red-600" : "text-sm font-semibold text-slate-900"}>
              {qty(stock)} {item.unit}
            </p>
            {low && <Badge variant="destructive" className="mt-1">{f.lowStockBadge}</Badge>}
          </div>
          {canManage && (
            <div className="flex items-center">
              {item.isActive && <FoodStockAdjustDialog itemId={item.id} name={item.name} unit={item.unit} currentStock={stock} branchId={stockBranch} />}
              {item.isActive && (
                <FoodInventoryItemEditDialog
                  item={{
                    id: item.id,
                    name: item.name,
                    unit: item.unit,
                    category: item.category,
                    minStock: Number(item.minStock),
                    unitCost: item.unitCost === null ? null : Number(item.unitCost),
                  }}
                />
              )}
              <FoodArchiveButtons kind="item" id={item.id} name={item.name} isActive={item.isActive} />
            </div>
          )}
        </div>
      </li>
    );
  };
  const lowStock = items.filter((i) => i.isActive && stockOf(i) <= Number(i.minStock));

  return (
    <div>
      <PageHeader
        title={t.foodInventory}
        description={
          lowStock.length > 0
            ? f.inventoryLowDesc(lowStock.length)
            : f.inventoryDesc
        }
      />

      {perBranch && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <BranchFilter branches={branches} current={stockBranch} es={lang === "es"} basePath="/portal/food/inventory" showAll={false} />
          {canManage && activeItems.length > 0 && (
            <FoodTransferDialog items={activeItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))} branches={branches.map((b) => ({ id: b.id, name: b.name }))} defaultFrom={stockBranch} />
          )}
        </div>
      )}

      {canManage && activeItems.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <FoodInventoryQuickAdjust
              items={activeItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit, currentStock: stockOf(i) }))}
              templates={templates}
              branchId={stockBranch}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{f.supplies}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {activeItems.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Package} title={f.noSuppliesYet} description={f.addFirstWithForm} />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">{activeItems.map(renderItem)}</ul>
              )}
            </CardContent>
          </Card>
          {hasNegative && <p className="mt-2 text-xs text-red-600">{f.negativeStockHint}</p>}

          {inactiveItems.length > 0 && (
            <Card className="mt-6 opacity-75">
              <CardHeader>
                <CardTitle className="text-base">{f.inactiveSupplies}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-slate-100">{inactiveItems.map(renderItem)}</ul>
              </CardContent>
            </Card>
          )}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">{f.recentMovements}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {movements.length === 0 ? (
                <p className="px-6 py-4 text-sm text-slate-500">{f.noMovementsYet}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {movements.map((m) => {
                    const q = Number(m.quantity);
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-6 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-900">
                            <span className="font-medium">{m.inventoryItem.name}</span>
                            <span className="text-slate-500"> · {movementLabel[m.type]}</span>
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {m.createdAt.toLocaleString(f.dateLocale, { dateStyle: "short", timeStyle: "short" })}
                            {m.note ? ` · ${m.note}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={q < 0 ? "text-sm font-semibold text-red-600" : "text-sm font-semibold text-emerald-600"}>
                            {q > 0 ? "+" : ""}{qty(q)} {m.inventoryItem.unit}
                          </p>
                          <p className="text-[11px] text-slate-400">{f.stockAfterLabel(qty(Number(m.stockAfter)), m.inventoryItem.unit)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {!canManage ? (
          <p className="self-start rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">{f.viewOnlyNotice}</p>
        ) : (
          <Card className="self-start">
            <CardHeader>
              <CardTitle className="text-base">{f.addSupply}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={createFoodInventoryItem} successMessage={{ es: "Insumo agregado", en: "Supply item added" }} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="name" className="text-xs font-medium text-slate-600">{f.name}</label>
                  <input id="name" name="name" type="text" required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="unit" className="text-xs font-medium text-slate-600">{f.unit}</label>
                  <select id="unit" name="unit" defaultValue="pza" required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
                    {FOOD_UNITS.map((u) => (
                      <option key={u} value={u}>{FOOD_UNIT_LABELS[lang === "en" ? "en" : "es"][u]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="category" className="text-xs font-medium text-slate-600">{f.category}</label>
                  <select id="category" name="category" defaultValue="EDIBLE" className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
                    <option value="EDIBLE">{f.edible}</option>
                    <option value="NON_EDIBLE">{f.nonEdible}</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <label htmlFor="currentStock" className="text-xs font-medium text-slate-600">{f.currentStock}</label>
                    <input id="currentStock" name="currentStock" type="number" step="0.001" min="0" defaultValue={0} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label htmlFor="minStock" className="text-xs font-medium text-slate-600">{f.minimum}</label>
                    <input id="minStock" name="minStock" type="number" step="0.001" min="0" defaultValue={0} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="unitCost" className="text-xs font-medium text-slate-600">{f.unitCostOptional}</label>
                  <input id="unitCost" name="unitCost" type="number" step="0.01" min="0" className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <p className="text-xs text-slate-400">{f.initialStockHint}</p>
                <button type="submit" className="mt-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-wait disabled:opacity-60">
                  {f.saveSupply}
                </button>
              </ActionForm>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
