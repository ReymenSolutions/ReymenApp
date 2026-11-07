import type { Prisma, PrismaClient } from "@prisma/client";

// Carga de un menú completo (categorías, platillos con variantes y grupos de modificadores) desde un archivo de datos.
// Es segura para un negocio que ya opera:
//   - nunca cambia el precio de algo que ya existe (lo reporta para revisarlo a mano);
//   - empata por nombre sin importar mayúsculas, acentos ni plural ("Sándwich" = "Sandwich", "Chico" = "Chicos");
//   - ajusta el mínimo/máximo de los grupos a lo que dice el menú (p. ej. poder elegir dos salsas);
//   - limpia duplicados: dos tamaños que son el mismo («Chico» y «Chicos») quedan en uno, y un platillo que ya existía
//     con otro nombre («Chilaquiles» frente a «Chilaquiles Gardenia») se desactiva. Lo que tiene ventas nunca se
//     borra: se desactiva, para conservar su historial;
//   - un platillo que ya existe con una sola variante «Único» y que en el menú tiene tamaños: esa variante pasa a ser
//     el primer tamaño (conserva su receta y su historial de ventas) y se agregan los demás;
//   - se puede correr varias veces: la segunda vez no hace nada.

export interface MenuOptionSpec { name: string; price?: number }
export interface MenuGroupSpec { key: string; name: string; min: number; max: number; options: MenuOptionSpec[] }
export interface MenuVariantSpec { label: string; price: number }
export interface MenuDishSpec { name: string; variants: MenuVariantSpec[]; groups?: string[] }
export interface MenuCategorySpec { name: string; dishes: MenuDishSpec[] }
export interface MenuSpec { groups: MenuGroupSpec[]; categories: MenuCategorySpec[] }

export interface MenuLoadReport {
  created: string[];
  updated: string[];
  /** Diferencias que no se tocaron (precios distintos, etc.): para revisarlas a mano. */
  review: string[];
}

export const SINGLE_VARIANT = "Único";

export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Como `norm`, pero además sin plural ni signos: "Chicos" = "Chico", "Grandes" = "Grande", "Tradicionales" = "Tradicional". */
export function loose(s: string): string {
  return norm(s)
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length > 3 ? w.replace(/s$/, "").replace(/e$/, "") : w))
    .join(" ");
}

/** Errores del archivo de datos (grupos repetidos, referencias inexistentes, mínimos imposibles…). */
export function validateMenuSpec(spec: MenuSpec): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  const groupNames = new Set<string>();
  for (const g of spec.groups) {
    if (keys.has(g.key)) errors.push(`Grupo repetido: ${g.key}`);
    keys.add(g.key);
    if (groupNames.has(norm(g.name))) errors.push(`Nombre de grupo repetido: ${g.name}`);
    groupNames.add(norm(g.name));
    if (g.min < 0 || g.max < 1 || g.min > g.max) errors.push(`Mínimo/máximo inválido en ${g.name}`);
    if (g.max > g.options.length && g.min > 0) errors.push(`${g.name}: el máximo es mayor que las opciones`);
    if (g.options.length === 0) errors.push(`${g.name} no tiene opciones`);
    const opts = new Set<string>();
    for (const o of g.options) {
      if ((o.price ?? 0) < 0) errors.push(`Precio negativo en ${g.name} › ${o.name}`);
      if (opts.has(norm(o.name))) errors.push(`Opción repetida en ${g.name}: ${o.name}`);
      opts.add(norm(o.name));
    }
  }
  const dishNames = new Set<string>();
  for (const c of spec.categories) {
    for (const d of c.dishes) {
      if (dishNames.has(norm(d.name))) errors.push(`Platillo repetido: ${d.name}`);
      dishNames.add(norm(d.name));
      if (d.variants.length === 0) errors.push(`${d.name} no tiene precio`);
      const labels = new Set<string>();
      for (const v of d.variants) {
        if (!(v.price > 0)) errors.push(`Precio inválido en ${d.name} › ${v.label}`);
        if (labels.has(loose(v.label))) errors.push(`Variante repetida en ${d.name}: ${v.label}`);
        labels.add(loose(v.label));
      }
      for (const k of d.groups ?? []) if (!keys.has(k)) errors.push(`${d.name} usa un grupo que no existe: ${k}`);
    }
  }
  return errors;
}

type Db = Prisma.TransactionClient | PrismaClient;
const money = (n: number) => `$${n.toLocaleString("es-MX")}`;

/**
 * Aplica el menú a la organización. Con `apply: false` solo calcula el reporte (no escribe). Pensado para correr dentro
 * de una transacción: si algo falla, no queda nada a medias.
 */
export async function loadMenu(db: Db, organizationId: string, spec: MenuSpec, opts: { apply: boolean }): Promise<MenuLoadReport> {
  const errors = validateMenuSpec(spec);
  if (errors.length) throw new Error(`El archivo del menú tiene errores:\n- ${errors.join("\n- ")}`);
  const report: MenuLoadReport = { created: [], updated: [], review: [] };
  const write = opts.apply;
  let fakeId = 0;
  const pending = () => `pendiente-${++fakeId}`;

  // ── Grupos de modificadores ──
  const existingGroups = await db.foodModifierGroup.findMany({ where: { organizationId }, include: { options: true } });
  const groupIdByKey = new Map<string, string>();
  for (const g of spec.groups) {
    const found = existingGroups.find((e) => norm(e.name) === norm(g.name));
    if (!found) {
      report.created.push(`Grupo «${g.name}» (elige ${g.min === 0 ? "opcional" : `mín. ${g.min}`}, máx. ${g.max}): ${g.options.map((o) => (o.price ? `${o.name} +${money(o.price)}` : o.name)).join(", ")}`);
      if (write) {
        const created = await db.foodModifierGroup.create({
          data: { organizationId, name: g.name, minSelect: g.min, maxSelect: g.max, options: { create: g.options.map((o, i) => ({ name: o.name, priceDelta: o.price ?? 0, sortOrder: i })) } },
        });
        groupIdByKey.set(g.key, created.id);
      } else groupIdByKey.set(g.key, pending());
      continue;
    }
    groupIdByKey.set(g.key, found.id);
    if (!found.isActive) report.review.push(`El grupo «${found.name}» existe pero está desactivado: actívalo en Foods → Recetas si lo vas a usar.`);
    if (found.minSelect !== g.min || found.maxSelect !== g.max) {
      report.updated.push(`Grupo «${found.name}»: elige mín. ${found.minSelect} / máx. ${found.maxSelect} → mín. ${g.min} / máx. ${g.max}`);
      if (write) await db.foodModifierGroup.update({ where: { id: found.id }, data: { minSelect: g.min, maxSelect: g.max } });
    }
    let nextSort = Math.max(-1, ...found.options.map((o) => o.sortOrder)) + 1;
    for (const o of g.options) {
      const opt = found.options.find((e) => norm(e.name) === norm(o.name));
      if (!opt) {
        report.created.push(`Opción «${o.name}»${o.price ? ` +${money(o.price)}` : ""} en el grupo «${found.name}»`);
        if (write) await db.foodModifierOption.create({ data: { groupId: found.id, name: o.name, priceDelta: o.price ?? 0, sortOrder: nextSort++ } });
      } else if (Number(opt.priceDelta) !== (o.price ?? 0)) {
        report.review.push(`«${found.name} › ${opt.name}» cuesta +${money(Number(opt.priceDelta))}; el menú dice +${money(o.price ?? 0)}. No se cambió.`);
      }
    }
  }

  // ── Categorías y platillos ──
  const existingCats = await db.foodDishCategory.findMany({ where: { organizationId } });
  const existingDishes = await db.foodDish.findMany({
    where: { organizationId },
    include: { variants: { include: { _count: { select: { sales: true, recipeUsages: true, ingredients: true } } }, orderBy: { createdAt: "asc" } }, modifierGroups: true },
  });
  const specDishIds = new Set<string>();
  let catSort = Math.max(-1, ...existingCats.map((c) => c.sortOrder)) + 1;

  for (const cat of spec.categories) {
    let catId = existingCats.find((c) => norm(c.name) === norm(cat.name))?.id;
    if (!catId) {
      report.created.push(`Categoría «${cat.name}»`);
      catId = write ? (await db.foodDishCategory.create({ data: { organizationId, name: cat.name, sortOrder: catSort++ } })).id : pending();
    }

    for (const d of cat.dishes) {
      const groupIds = (d.groups ?? []).map((k) => groupIdByKey.get(k)!);
      const found = existingDishes.find((e) => norm(e.name) === norm(d.name)) ?? existingDishes.find((e) => loose(e.name) === loose(d.name));
      if (found) specDishIds.add(found.id);
      const variantsText = d.variants.map((v) => (d.variants.length === 1 ? money(v.price) : `${v.label} ${money(v.price)}`)).join(" · ");
      const groupsText = (d.groups ?? []).map((k) => spec.groups.find((g) => g.key === k)!.name).join(", ");

      if (!found) {
        report.created.push(`Platillo «${d.name}» en ${cat.name}: ${variantsText}${groupsText ? ` · grupos: ${groupsText}` : ""}`);
        if (write) {
          await db.foodDish.create({
            data: {
              organizationId, name: d.name, categoryId: catId,
              variants: { create: d.variants.map((v) => ({ organizationId, label: v.label, price: v.price })) },
              modifierGroups: { create: groupIds.map((groupId) => ({ groupId })) },
            },
          });
        }
        continue;
      }

      // Ya existe: se completa sin tocar lo que el negocio ya tiene.
      if (!found.isActive) report.review.push(`El platillo «${found.name}» existe pero está desactivado. No se activó.`);
      if (!found.categoryId) {
        report.updated.push(`«${found.name}» → categoría ${cat.name}`);
        if (write) await db.foodDish.update({ where: { id: found.id }, data: { categoryId: catId } });
      }
      let variants = await dedupeVariants(db, found, d, write, report);
      const single = variants.length === 1 && norm(variants[0].label) === norm(SINGLE_VARIANT);
      if (single && d.variants.length > 1 && !d.variants.some((v) => norm(v.label) === norm(SINGLE_VARIANT))) {
        const first = d.variants[0];
        report.updated.push(`«${found.name}»: la variante «${variants[0].label}» pasa a llamarse «${first.label}» (conserva su receta y ventas)`);
        if (Number(variants[0].price) !== first.price) report.review.push(`«${found.name} › ${first.label}» cuesta ${money(Number(variants[0].price))}; el menú dice ${money(first.price)}. No se cambió.`);
        if (write) await db.foodDishVariant.update({ where: { id: variants[0].id }, data: { label: first.label } });
        variants = [{ ...variants[0], label: first.label }];
      }
      for (const v of d.variants) {
        const match = variants.find((e) => norm(e.label) === norm(v.label)) ?? variants.find((e) => loose(e.label) === loose(v.label)) ?? (d.variants.length === 1 && variants.length === 1 ? variants[0] : undefined);
        if (!match) {
          report.created.push(`Variante «${found.name} › ${v.label}» ${money(v.price)}`);
          if (write) await db.foodDishVariant.create({ data: { organizationId, dishId: found.id, label: v.label, price: v.price } });
        } else if (Number(match.price) !== v.price && !(single && v === d.variants[0] && d.variants.length > 1)) {
          report.review.push(`«${found.name}${variants.length > 1 || d.variants.length > 1 ? ` › ${match.label}` : ""}» cuesta ${money(Number(match.price))}; el menú dice ${money(v.price)}. No se cambió.`);
        }
      }
      const linked = new Set(found.modifierGroups.map((l) => l.groupId));
      const missing = groupIds.filter((id) => !linked.has(id));
      if (missing.length) {
        const names = (d.groups ?? []).filter((k) => missing.includes(groupIdByKey.get(k)!)).map((k) => spec.groups.find((g) => g.key === k)!.name);
        report.updated.push(`«${found.name}» + grupos: ${names.join(", ")}`);
        if (write) await db.foodDishModifierGroup.createMany({ data: missing.map((groupId) => ({ dishId: found.id, groupId })), skipDuplicates: true });
      }
    }
  }

  // ── Platillos que ya existían con otro nombre ──
  // «Chilaquiles» (Chico/Grande) cuando el menú trae «Chilaquiles Gardenia» (Chicos/Grandes): todas las palabras del
  // viejo están en el nuevo y comparten al menos un tamaño. Si se parece a más de un platillo del menú, solo se reporta.
  const specDishes = spec.categories.flatMap((c) => c.dishes);
  for (const e of existingDishes) {
    if (!e.isActive || specDishIds.has(e.id)) continue;
    const words = loose(e.name).split(" ");
    const single = loose(SINGLE_VARIANT);
    const labels = new Set(e.variants.filter((v) => v.isActive).map((v) => loose(v.label)));
    const named = specDishes.filter((d) => { const target = new Set(loose(d.name).split(" ")); return words.every((w) => target.has(w)); });
    // Se desactiva solo si comparte tamaños reales (Chico/Grande…); un «Único» no basta para estar seguros.
    const like = named.filter((d) => d.variants.some((v) => loose(v.label) !== single && labels.has(loose(v.label))));
    if (like.length !== 1) {
      if (named.length) report.review.push(`«${e.name}» se parece a ${named.map((d) => `«${d.name}»`).join(", ")}. Si es un duplicado, desactívalo en Foods → Recetas.`);
      continue;
    }
    report.updated.push(`«${e.name}» es un duplicado de «${like[0].name}»: se desactiva (deja de salir en el menú y en el POS; conserva su historial)`);
    if (write) await db.foodDish.update({ where: { id: e.id }, data: { isActive: false } });
  }
  return report;
}

type ExistingVariant = { id: string; label: string; price: Prisma.Decimal; isActive: boolean; createdAt: Date; _count: { sales: number; recipeUsages: number; ingredients: number } };

/**
 * Dos tamaños activos del mismo platillo que son el mismo («Chico» y «Chicos»): se queda el que tiene ventas (o
 * receta, o el más antiguo) con el nombre del menú; el otro se borra, o se desactiva si tiene ventas.
 */
async function dedupeVariants(db: Db, dish: { id: string; name: string; variants: ExistingVariant[] }, d: MenuDishSpec, write: boolean, report: MenuLoadReport): Promise<ExistingVariant[]> {
  const active = dish.variants.filter((v) => v.isActive);
  const byKey = new Map<string, ExistingVariant[]>();
  for (const v of active) byKey.set(loose(v.label), [...(byKey.get(loose(v.label)) ?? []), v]);
  const result: ExistingVariant[] = [];
  for (const [key, list] of byKey) {
    if (list.length === 1) {
      result.push(list[0]);
      continue;
    }
    const specLabel = d.variants.find((v) => loose(v.label) === key)?.label ?? list[0].label;
    const score = (v: ExistingVariant) => [v._count.sales + v._count.recipeUsages, v._count.ingredients, norm(v.label) === norm(specLabel) ? 1 : 0];
    const keep = [...list].sort((a, b) => {
      const [x, y] = [score(a), score(b)];
      return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || a.createdAt.getTime() - b.createdAt.getTime();
    })[0];
    for (const v of list) {
      if (v === keep) continue;
      const used = v._count.sales + v._count.recipeUsages > 0;
      report.updated.push(`«${dish.name}»: el tamaño «${v.label}» está repetido con «${keep.label}»: ${used ? "se desactiva (tiene ventas)" : "se quita"}`);
      if (!write) continue;
      if (used) await db.foodDishVariant.update({ where: { id: v.id }, data: { isActive: false, label: `${v.label} (duplicado ${v.id.slice(-4)})` } });
      else await db.foodDishVariant.delete({ where: { id: v.id } });
    }
    let kept = keep;
    if (keep.label !== specLabel) {
      report.updated.push(`«${dish.name}»: el tamaño «${keep.label}» pasa a llamarse «${specLabel}»`);
      if (write) await db.foodDishVariant.update({ where: { id: keep.id }, data: { label: specLabel } });
      kept = { ...keep, label: specLabel };
    }
    result.push(kept);
  }
  // Las inactivas se conservan para que una variante desactivada con el mismo nombre no se vuelva a crear.
  return [...result, ...dish.variants.filter((v) => !v.isActive)];
}
