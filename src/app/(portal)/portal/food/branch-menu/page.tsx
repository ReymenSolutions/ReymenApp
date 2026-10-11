import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getServerLang } from "@/lib/i18n-server";
import { listBranches } from "@/lib/branches";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { BranchMenuEditor } from "@/components/portal/BranchMenuEditor";

export default async function BranchMenuPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  const orgId = session.user.organizationId;
  await requireModule(orgId, "FOOD_OPS");

  const { branch: branchParam } = await searchParams;
  const [lang, org, branches] = await Promise.all([
    getServerLang(),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { menuPerBranch: true } }),
    listBranches(orgId, { activeOnly: true }),
  ]);
  const es = lang === "es";
  const canManage = can(session.user.role, "settings:manage");
  const branch = branches.find((b) => b.id === branchParam) ?? branches[0];

  const title = es ? "Menú por sucursal" : "Menu per branch";
  const description = es
    ? "Oculta platillos o fija precios distintos en cada sucursal. La sucursal Principal usa siempre el menú base de Recetas."
    : "Hide dishes or set different prices in each branch. The Main branch always uses the base menu from Recipes.";

  if (!org.menuPerBranch || !branch) {
    return (
      <div>
        <PageHeader title={title} description={description} />
        <Card>
          <CardContent className="space-y-2 py-6 text-sm text-slate-600">
            {!branch ? (
              <p>{es ? "Primero crea una sucursal en Configuración → Sucursales." : "First create a branch in Settings → Branches."}</p>
            ) : (
              <p>{es ? "El menú por sucursal está apagado: todas las sucursales venden el mismo menú y precios." : "Menu per branch is off: every branch sells the same menu and prices."}</p>
            )}
            <Link href="/portal/settings" className="font-medium text-brand-700 hover:underline">
              {es ? "Ir a Configuración →" : "Go to Settings →"}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [dishes, hidden, prices] = await Promise.all([
    prisma.foodDish.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, category: { select: { name: true } }, variants: { where: { isActive: true }, select: { id: true, label: true, price: true }, orderBy: { label: "asc" } } },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.branchDish.findMany({ where: { branchId: branch.id, isActive: false }, select: { dishId: true } }),
    prisma.branchVariantPrice.findMany({ where: { branchId: branch.id }, select: { variantId: true, price: true } }),
  ]);
  const hiddenIds = new Set(hidden.map((h) => h.dishId));
  const priceByVariant = new Map(prices.map((p) => [p.variantId, Number(p.price)]));

  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={es ? "Sucursal" : "Branch"}>
        {branches.map((b) => (
          <Link
            key={b.id}
            href={`/portal/food/branch-menu?branch=${b.id}`}
            aria-current={b.id === branch.id ? "true" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${b.id === branch.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {b.name}
          </Link>
        ))}
      </div>
      <BranchMenuEditor
        key={branch.id}
        branchId={branch.id}
        canManage={canManage}
        dishes={dishes.map((d) => ({
          id: d.id,
          name: d.name,
          categoryName: d.category?.name ?? null,
          available: !hiddenIds.has(d.id),
          variants: d.variants.map((v) => ({ id: v.id, label: v.label, basePrice: Number(v.price), branchPrice: priceByVariant.get(v.id) ?? null })),
        }))}
      />
    </div>
  );
}
