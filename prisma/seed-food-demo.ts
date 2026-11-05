// Datos de DEMOSTRACIÓN de Reymen Foods para "Café Norte" (complementa seed-loyalty-demo.ts).
//
//   ALLOW_LOYALTY_DEMO_SEED=cafe-norte-demo npx tsx prisma/seed-loyalty-demo.ts   # primero: organización, sucursales y ventas del día
//   ALLOW_LOYALTY_DEMO_SEED=cafe-norte-demo npx tsx prisma/seed-food-demo.ts
//
// Solo en una base de desarrollo o de demostración. Se bloquea en NODE_ENV=production.
//
// Crea el menú de una cafetería (categorías, platillos con tamaños, recetas
// con los insumos del inventario, modificadores con su costo), proveedores,
// compras recientes, gastos fijos y las unidades vendidas por platillo de los
// últimos 30 días. Las ventas por platillo se reparten para que su importe
// diario se acerque a la venta total del día que ya sembró la demo de lealtad;
// así Rentabilidad, «Platillos más vendidos» y el menú del POS cuentan la misma
// historia. El inventario queda sano salvo dos insumos (aguacate y jamón), para
// que el aviso de «por agotarse» se vea en pocos platillos y no en todo el menú.
// Todo es ficticio.
//
// Es idempotente: borra y regenera solo el menú, proveedores, compras, gastos
// y ventas por platillo de "cafe-norte-demo"; los insumos se actualizan por nombre.

import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { assertLoyaltyDemoSeedAllowed } from "../src/lib/loyalty/demo-safety";

const ORG_SLUG = "cafe-norte-demo";
const DAYS = 30;
const DAY = 86_400_000;
const TZ_OFFSET_H = 6; // America/Mexico_City (UTC-6, sin horario de verano)

let seedState = 20261028;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);

/** Medianoche local (fecha de negocio) del instante t, en UTC. */
function localDayStart(t: number): number {
  const shifted = t - TZ_OFFSET_H * 3_600_000;
  return shifted - (((shifted % DAY) + DAY) % DAY) + TZ_OFFSET_H * 3_600_000;
}

type Unit = "kg" | "lt" | "pza";
const INVENTORY: { name: string; unit: Unit; stock: number; min: number; cost: number; nonEdible?: boolean }[] = [
  { name: "Café en grano", unit: "kg", stock: 14, min: 8, cost: 280 },
  { name: "Leche entera", unit: "lt", stock: 48, min: 20, cost: 24 },
  { name: "Leche de almendra", unit: "lt", stock: 12, min: 6, cost: 65 },
  { name: "Jarabe de vainilla", unit: "lt", stock: 5, min: 3, cost: 110 },
  { name: "Azúcar", unit: "kg", stock: 14, min: 8, cost: 28 },
  { name: "Pan brioche", unit: "pza", stock: 90, min: 40, cost: 9 },
  { name: "Huevo", unit: "pza", stock: 240, min: 120, cost: 3.2 },
  { name: "Aguacate", unit: "kg", stock: 3, min: 6, cost: 62 },
  { name: "Jamón serrano", unit: "kg", stock: 1.4, min: 2, cost: 340 },
  { name: "Queso panela", unit: "kg", stock: 4, min: 3, cost: 130 },
  { name: "Vasos 12 oz", unit: "pza", stock: 420, min: 300, cost: 2.1, nonEdible: true },
];

type Recipe = Record<string, number>;
const MENU: {
  category: string;
  dishes: { name: string; weight: number; groups?: string[]; variants: { label: string; price: number; recipe: Recipe }[] }[];
}[] = [
  {
    category: "Bebidas calientes",
    dishes: [
      { name: "Americano", weight: 14, groups: ["Extras"], variants: [
        { label: "Chico", price: 45, recipe: { "Café en grano": 0.018, "Vasos 12 oz": 1 } },
        { label: "Grande", price: 55, recipe: { "Café en grano": 0.024, "Vasos 12 oz": 1 } },
      ] },
      { name: "Latte", weight: 16, groups: ["Tipo de leche", "Extras"], variants: [
        { label: "Chico", price: 58, recipe: { "Café en grano": 0.018, "Leche entera": 0.22, "Vasos 12 oz": 1 } },
        { label: "Grande", price: 68, recipe: { "Café en grano": 0.018, "Leche entera": 0.3, "Vasos 12 oz": 1 } },
      ] },
      { name: "Capuchino", weight: 10, groups: ["Tipo de leche", "Extras"], variants: [
        { label: "Único", price: 62, recipe: { "Café en grano": 0.018, "Leche entera": 0.18, "Vasos 12 oz": 1 } },
      ] },
      { name: "Latte de vainilla", weight: 8, groups: ["Tipo de leche"], variants: [
        { label: "Único", price: 72, recipe: { "Café en grano": 0.018, "Leche entera": 0.25, "Jarabe de vainilla": 0.02, "Vasos 12 oz": 1 } },
      ] },
    ],
  },
  {
    category: "Bebidas frías",
    dishes: [
      { name: "Frappé de café", weight: 9, groups: ["Tipo de leche"], variants: [
        { label: "Único", price: 75, recipe: { "Café en grano": 0.02, "Leche entera": 0.2, "Azúcar": 0.02, "Vasos 12 oz": 1 } },
      ] },
      { name: "Cold brew", weight: 6, variants: [
        { label: "Único", price: 60, recipe: { "Café en grano": 0.03, "Vasos 12 oz": 1 } },
      ] },
    ],
  },
  {
    category: "Desayunos",
    dishes: [
      { name: "Toast de aguacate", weight: 7, variants: [
        { label: "Único", price: 95, recipe: { "Pan brioche": 2, "Aguacate": 0.12, "Huevo": 1 } },
      ] },
      { name: "Huevos al gusto", weight: 5, variants: [
        { label: "Único", price: 89, recipe: { "Huevo": 3, "Pan brioche": 1 } },
      ] },
      { name: "Sándwich de jamón serrano", weight: 4, variants: [
        { label: "Único", price: 125, recipe: { "Pan brioche": 2, "Jamón serrano": 0.06, "Queso panela": 0.05 } },
      ] },
    ],
  },
  {
    category: "Panadería",
    dishes: [
      { name: "Brioche de mantequilla", weight: 6, variants: [
        { label: "Único", price: 35, recipe: { "Pan brioche": 1 } },
      ] },
    ],
  },
];

const MODIFIER_GROUPS: { name: string; min: number; max: number; options: { name: string; delta: number; recipe?: Recipe; share: number }[] }[] = [
  { name: "Tipo de leche", min: 0, max: 1, options: [
    { name: "Leche de almendra", delta: 12, recipe: { "Leche de almendra": 0.2 }, share: 0.18 },
    { name: "Deslactosada", delta: 0, share: 0.12 },
  ] },
  { name: "Extras", min: 0, max: 2, options: [
    { name: "Shot extra", delta: 15, recipe: { "Café en grano": 0.009 }, share: 0.1 },
    { name: "Jarabe de vainilla", delta: 10, recipe: { "Jarabe de vainilla": 0.015 }, share: 0.07 },
  ] },
];

const SUPPLIERS = [
  { name: "Tostadores del Norte", contactName: "Rubén Garza", phone: "+528100990001", items: ["Café en grano"] },
  { name: "Lácteos La Silla", contactName: "Marcela Treviño", phone: "+528100990002", items: ["Leche entera", "Leche de almendra", "Queso panela"] },
  { name: "Panadería San Pedro", contactName: "Jorge Leal", phone: "+528100990003", items: ["Pan brioche"] },
  { name: "Verduras Monterrey", contactName: "Ana Salinas", phone: "+528100990004", items: ["Aguacate", "Huevo"] },
];

const OPERATING_COSTS = [
  { name: "Renta del local", amountMonthly: 28000 },
  { name: "Nómina", amountMonthly: 65000 },
  { name: "Luz, agua y gas", amountMonthly: 9500 },
  { name: "Internet y software", amountMonthly: 2200 },
  { name: "Mantenimiento", amountMonthly: 3000 },
];

async function main() {
  assertLoyaltyDemoSeedAllowed(process.env);
  const org = await prisma.organization.findUnique({ where: { slug: ORG_SLUG }, select: { id: true } });
  if (!org) throw new Error(`No existe "${ORG_SLUG}". Corre primero prisma/seed-loyalty-demo.ts.`);
  const orgId = org.id;
  const now = Date.now();

  // ─── Limpieza de una corrida anterior (solo datos de esta demo) ─────
  await prisma.foodRecipeUsage.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodDishSale.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodModifierOptionSale.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodDish.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodDishCategory.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodModifierGroup.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodInventoryMovement.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodPurchase.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodSupplier.deleteMany({ where: { organizationId: orgId } });
  await prisma.foodOperatingCost.deleteMany({ where: { organizationId: orgId } });

  // ─── Insumos ────────────────────────────────────────────────────────
  const items = new Map<string, string>();
  for (const it of INVENTORY) {
    const data = {
      unit: it.unit,
      category: it.nonEdible ? ("NON_EDIBLE" as const) : ("EDIBLE" as const),
      currentStock: it.stock,
      minStock: it.min,
      unitCost: it.cost,
      isActive: true,
    };
    const row = await prisma.foodInventoryItem.upsert({
      where: { organizationId_name: { organizationId: orgId, name: it.name } },
      update: data,
      create: { organizationId: orgId, name: it.name, ...data },
    });
    items.set(it.name, row.id);
  }
  const itemId = (name: string) => {
    const id = items.get(name);
    if (!id) throw new Error(`Insumo sin sembrar: ${name}`);
    return id;
  };
  const ingredientRows = (recipe: Recipe) => Object.entries(recipe).map(([name, quantity]) => ({ inventoryItemId: itemId(name), quantity }));

  // ─── Modificadores ──────────────────────────────────────────────────
  const groups = new Map<string, string>();
  const options: { id: string; name: string; share: number; group: string }[] = [];
  for (const [i, g] of MODIFIER_GROUPS.entries()) {
    const row = await prisma.foodModifierGroup.create({
      data: {
        organizationId: orgId,
        name: g.name,
        minSelect: g.min,
        maxSelect: g.max,
        sortOrder: i,
        options: {
          create: g.options.map((o, j) => ({
            name: o.name,
            priceDelta: o.delta,
            sortOrder: j,
            ingredients: o.recipe ? { create: ingredientRows(o.recipe) } : undefined,
          })),
        },
      },
      include: { options: true },
    });
    groups.set(g.name, row.id);
    for (const o of row.options) options.push({ id: o.id, name: o.name, share: g.options.find((x) => x.name === o.name)!.share, group: g.name });
  }

  // ─── Menú ───────────────────────────────────────────────────────────
  const variants: { id: string; price: number; weight: number; groups: string[] }[] = [];
  for (const [ci, cat] of MENU.entries()) {
    const category = await prisma.foodDishCategory.create({ data: { organizationId: orgId, name: cat.category, sortOrder: ci } });
    for (const d of cat.dishes) {
      const dish = await prisma.foodDish.create({
        data: {
          organizationId: orgId,
          categoryId: category.id,
          name: d.name,
          variants: {
            create: d.variants.map((v) => ({
              organizationId: orgId,
              label: v.label,
              price: v.price,
              ingredients: { create: ingredientRows(v.recipe) },
            })),
          },
          modifierGroups: d.groups ? { create: d.groups.map((g) => ({ groupId: groups.get(g)! })) } : undefined,
        },
        include: { variants: true },
      });
      for (const v of dish.variants) {
        // El tamaño grande se vende un poco menos que el chico.
        const w = (d.weight / d.variants.length) * (v.label === "Grande" ? 0.8 : 1);
        variants.push({ id: v.id, price: Number(v.price), weight: w, groups: d.groups ?? [] });
      }
    }
  }

  // ─── Ventas por platillo (últimos 30 días) ──────────────────────────
  // Se reparte el importe de la venta total de cada día (la que sembró la demo
  // de lealtad) entre los platillos según su peso; si no hay venta ese día, se
  // usa un día típico.
  const since = localDayStart(now - (DAYS - 1) * DAY);
  const daySales = await prisma.foodSale.groupBy({
    by: ["occurredAt"],
    where: { organizationId: orgId, occurredAt: { gte: new Date(since) }, isCancellation: false },
    _sum: { grossAmount: true },
  });
  const grossByDay = new Map<number, number>();
  for (const s of daySales) {
    const d = localDayStart(s.occurredAt.getTime());
    grossByDay.set(d, (grossByDay.get(d) ?? 0) + Number(s._sum.grossAmount ?? 0));
  }
  const totalWeight = variants.reduce((a, v) => a + v.weight, 0);
  const avgPrice = variants.reduce((a, v) => a + v.price * v.weight, 0) / totalWeight;
  const dishSaleRows: Prisma.FoodDishSaleCreateManyInput[] = [];
  const optionSaleRows: Prisma.FoodModifierOptionSaleCreateManyInput[] = [];
  for (let d = since; d <= localDayStart(now); d += DAY) {
    const gross = grossByDay.get(d) ?? 8000 * between(0.85, 1.15);
    const units = Math.max(20, Math.round(gross / avgPrice));
    const unitsWithGroup = new Map<string, number>();
    for (const v of variants) {
      const q = Math.round(((units * v.weight) / totalWeight) * between(0.75, 1.25));
      if (q <= 0) continue;
      dishSaleRows.push({ organizationId: orgId, variantId: v.id, occurredAt: new Date(d), quantity: q });
      for (const g of v.groups) unitsWithGroup.set(g, (unitsWithGroup.get(g) ?? 0) + q);
    }
    for (const o of options) {
      const q = Math.round((unitsWithGroup.get(o.group) ?? 0) * o.share * between(0.7, 1.3));
      if (q > 0) optionSaleRows.push({ organizationId: orgId, optionId: o.id, optionName: o.name, occurredAt: new Date(d), quantity: q });
    }
  }
  await prisma.foodDishSale.createMany({ data: dishSaleRows });
  await prisma.foodModifierOptionSale.createMany({ data: optionSaleRows });

  // ─── Proveedores y compras recientes ────────────────────────────────
  let purchases = 0;
  for (const [i, s] of SUPPLIERS.entries()) {
    const supplier = await prisma.foodSupplier.create({
      data: { organizationId: orgId, name: s.name, contactName: s.contactName, phone: s.phone, notes: "Proveedor de demostración" },
    });
    for (const daysAgo of [12 - i, 5 - (i % 3)]) {
      const lines = s.items.map((name) => {
        const inv = INVENTORY.find((x) => x.name === name)!;
        const quantity = Math.round(Math.max(inv.min, 1) * between(0.8, 1.4) * 10) / 10;
        return { name, inventoryItemId: itemId(name), quantity, unitCost: inv.cost, previousUnitCost: inv.cost };
      });
      const total = lines.reduce((a, l) => a + l.quantity * l.unitCost, 0);
      const purchasedAt = new Date(localDayStart(now - daysAgo * DAY) + 9 * 3_600_000);
      const purchase = await prisma.foodPurchase.create({
        data: {
          organizationId: orgId,
          supplierId: supplier.id,
          purchasedAt,
          total: Math.round(total * 100) / 100,
          createdAt: purchasedAt,
          items: { create: lines.map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: l.quantity, unitCost: l.unitCost, previousUnitCost: l.previousUnitCost })) },
        },
      });
      purchases++;
      await prisma.foodInventoryMovement.createMany({
        data: lines.map((l) => ({
          organizationId: orgId,
          inventoryItemId: l.inventoryItemId,
          type: "PURCHASE" as const,
          quantity: l.quantity,
          stockAfter: INVENTORY.find((x) => x.name === l.name)!.stock,
          purchaseId: purchase.id,
          note: `Compra a ${s.name}`,
          createdAt: purchasedAt,
        })),
      });
    }
  }
  // Una merma reciente, para que el historial muestre más de un tipo de movimiento.
  await prisma.foodInventoryMovement.create({
    data: {
      organizationId: orgId,
      inventoryItemId: itemId("Leche entera"),
      type: "WASTE",
      quantity: -2,
      stockAfter: INVENTORY.find((x) => x.name === "Leche entera")!.stock,
      note: "Caducada",
      createdAt: new Date(now - 2 * DAY),
    },
  });

  // ─── Gastos fijos ───────────────────────────────────────────────────
  await prisma.foodOperatingCost.createMany({ data: OPERATING_COSTS.map((c) => ({ organizationId: orgId, ...c })) });

  const dishes = MENU.reduce((a, c) => a + c.dishes.length, 0);
  console.log(`✅ Menú: ${MENU.length} categorías, ${dishes} platillos, ${variants.length} variantes, ${options.length} modificadores`);
  console.log(`✅ ${dishSaleRows.length} registros de venta por platillo (${DAYS} días), ${SUPPLIERS.length} proveedores, ${purchases} compras, ${OPERATING_COSTS.length} gastos fijos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
