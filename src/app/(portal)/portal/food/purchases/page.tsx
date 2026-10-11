import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { listBranches } from "@/lib/branches";
import { FoodPurchaseForm } from "@/components/portal/FoodPurchaseForm";
import { FoodPurchaseVoidDialog } from "@/components/portal/FoodPurchaseVoidDialog";
import { ShoppingCart } from "lucide-react";
import { can } from "@/lib/permissions";

export default async function FoodPurchasesPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;

  const [orgFlags, branches] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { inventoryPerBranch: true } }),
    listBranches(orgId, { activeOnly: true }),
  ]);
  const [t, lang, purchases, suppliers, items] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.foodPurchase.findMany({
      where: { organizationId: orgId },
      orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        supplier: { select: { name: true } },
        items: { include: { inventoryItem: { select: { name: true, unit: true } } } },
      },
    }),
    prisma.foodSupplier.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.foodInventoryItem.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, unit: true, unitCost: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const f = pickDict(foodStrings, lang);
  const canManage = can(session.user.role, "food:manage");
  const qty = (n: number) => n.toLocaleString(f.dateLocale, { maximumFractionDigits: 3 });

  return (
    <div>
      <PageHeader title={t.foodPurchases} description={f.purchasesDesc} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{f.purchaseHistory}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {purchases.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={ShoppingCart} title={f.noPurchasesYet} description={f.noPurchasesDesc} />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {purchases.map((p) => (
                    <li key={p.id} className={p.voidedAt ? "px-6 py-3 opacity-60" : "px-6 py-3"}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">{p.supplier?.name ?? f.noSupplierOption}</p>
                            {p.voidedAt && <Badge variant="destructive" className="text-[10px]">{f.voidedBadge}</Badge>}
                          </div>
                          <p className="text-xs text-slate-500">
                            {p.purchasedAt.toLocaleDateString(f.dateLocale)} · {f.purchaseLines(p.items.length)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <p className={p.voidedAt ? "text-sm font-semibold text-slate-400 line-through" : "text-sm font-semibold text-slate-900"}>
                            {formatMoney(Number(p.total))}
                          </p>
                          {canManage && !p.voidedAt && <FoodPurchaseVoidDialog purchaseId={p.id} />}
                        </div>
                      </div>
                      <ul className="mt-1.5 space-y-0.5">
                        {p.items.map((i) => (
                          <li key={i.id} className="text-xs text-slate-500">
                            {i.inventoryItem.name}: {qty(Number(i.quantity))} {i.inventoryItem.unit} × {formatMoney(Number(i.unitCost))}
                          </li>
                        ))}
                      </ul>
                      {p.notes && <p className="mt-1 whitespace-pre-line text-xs text-slate-400">{p.notes}</p>}
                      {p.voidReason && <p className="mt-1 text-xs text-red-500">{f.voidReason}: {p.voidReason}</p>}
                    </li>
                  ))}
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
              <CardTitle className="text-base">{f.newPurchase}</CardTitle>
            </CardHeader>
            <CardContent>
              <FoodPurchaseForm
                suppliers={suppliers}
                branches={orgFlags.inventoryPerBranch ? branches.map((b) => ({ id: b.id, name: b.name })) : []}
                items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, unitCost: i.unitCost === null ? null : Number(i.unitCost) }))}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
