import type { Prisma, PrismaClient } from "@prisma/client";

// Carga de un menú completo (categorías, platillos con variantes y grupos de modificadores) desde un archivo de datos.
// Es aditiva y segura para un negocio que ya opera:
//   - nunca borra ni desactiva nada;
//   - nunca cambia el precio de algo que ya existe (lo reporta para revisarlo a mano);
//   - empata por nombre sin importar mayúsculas ni acentos ("Sándwich" = "Sandwich");
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
        if (labels.has(norm(v.label))) errors.push(`Variante repetida en ${d.name}: ${v.label}`);
        labels.add(norm(v.label));
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
    if (found.minSelect !== g.min || found.maxSelect !== g.max) report.review.push(`Grupo «${found.name}»: tiene mín. ${found.minSelect} / máx. ${found.maxSelect}; el menú propone ${g.min} / ${g.max}. No se cambió.`);
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
  const existingDishes = await db.foodDish.findMany({ where: { organizationId }, include: { variants: true, modifierGroups: true } });
  let catSort = Math.max(-1, ...existingCats.map((c) => c.sortOrder)) + 1;

  for (const cat of spec.categories) {
    let catId = existingCats.find((c) => norm(c.name) === norm(cat.name))?.id;
    if (!catId) {
      report.created.push(`Categoría «${cat.name}»`);
      catId = write ? (await db.foodDishCategory.create({ data: { organizationId, name: cat.name, sortOrder: catSort++ } })).id : pending();
    }

    for (const d of cat.dishes) {
      const groupIds = (d.groups ?? []).map((k) => groupIdByKey.get(k)!);
      const found = existingDishes.find((e) => norm(e.name) === norm(d.name));
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
      let variants = found.variants;
      const single = variants.length === 1 && norm(variants[0].label) === norm(SINGLE_VARIANT);
      if (single && d.variants.length > 1 && !d.variants.some((v) => norm(v.label) === norm(SINGLE_VARIANT))) {
        const first = d.variants[0];
        report.updated.push(`«${found.name}»: la variante «${variants[0].label}» pasa a llamarse «${first.label}» (conserva su receta y ventas)`);
        if (Number(variants[0].price) !== first.price) report.review.push(`«${found.name} › ${first.label}» cuesta ${money(Number(variants[0].price))}; el menú dice ${money(first.price)}. No se cambió.`);
        if (write) await db.foodDishVariant.update({ where: { id: variants[0].id }, data: { label: first.label } });
        variants = [{ ...variants[0], label: first.label }];
      }
      for (const v of d.variants) {
        const match = variants.find((e) => norm(e.label) === norm(v.label)) ?? (d.variants.length === 1 && variants.length === 1 ? variants[0] : undefined);
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
  return report;
}
