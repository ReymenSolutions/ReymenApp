// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { loadMenu, validateMenuSpec, norm } from "./menu-loader";
import { villaGardeniaMenu } from "../../prisma/menus/villa-gardenia";

describe("carga de menú (aditiva)", () => {
  let orgId: string;
  let chilVariantId: string;

  beforeAll(async () => {
    orgId = (await createTestOrg("Villa Gardenia Prueba")).id;
    // Lo que el negocio ya capturó a mano: platillos con otro precio, sin tamaños, un grupo con otras opciones.
    const desayunos = await prisma.foodDishCategory.create({ data: { organizationId: orgId, name: "Desayunos" } });
    const chil = await prisma.foodDish.create({ data: { organizationId: orgId, name: "chilaquiles gardenia", categoryId: desayunos.id, variants: { create: [{ organizationId: orgId, label: "Único", price: 115 }] } }, include: { variants: true } });
    chilVariantId = chil.variants[0].id;
    await prisma.foodDish.create({ data: { organizationId: orgId, name: "Sandwich Clasico", variants: { create: [{ organizationId: orgId, label: "Único", price: 95 }] } } });
    await prisma.foodModifierGroup.create({ data: { organizationId: orgId, name: "Extras", minSelect: 0, maxSelect: 3, options: { create: [{ name: "Aguacate", priceDelta: 25 }, { name: "Tocino", priceDelta: 30 }] } } });
  });
  afterAll(async () => cleanupOrg(orgId));

  it("el menú de Villa Gardenia es válido", () => {
    expect(validateMenuSpec(villaGardeniaMenu)).toEqual([]);
    expect(norm("Sándwich  Clásico")).toBe(norm("sandwich clasico"));
  });

  it("la vista previa no escribe nada", async () => {
    const before = await prisma.foodDish.count({ where: { organizationId: orgId } });
    const report = await loadMenu(prisma, orgId, villaGardeniaMenu, { apply: false });
    expect(report.created.length).toBeGreaterThan(40);
    expect(await prisma.foodDish.count({ where: { organizationId: orgId } })).toBe(before);
    expect(await prisma.foodModifierGroup.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it("aplica: crea lo que falta, completa lo existente sin cambiar precios ni borrar, y reporta diferencias", async () => {
    const report = await loadMenu(prisma, orgId, villaGardeniaMenu, { apply: true });

    // Chilaquiles: su variante «Único» pasa a «Chicos» (misma fila: conserva receta y ventas) y se agrega «Grandes».
    const chil = await prisma.foodDish.findFirstOrThrow({ where: { organizationId: orgId, name: "chilaquiles gardenia" }, include: { variants: true, modifierGroups: { include: { group: true } } } });
    expect(chil.variants.map((v) => [v.label, Number(v.price)]).sort()).toEqual([["Chicos", 115], ["Grandes", 160]]);
    expect(chil.variants.find((v) => v.label === "Chicos")!.id).toBe(chilVariantId);
    expect(chil.modifierGroups.map((l) => l.group.name).sort()).toEqual(["Chilaquiles · Base", "Chilaquiles · Proteína", "Chilaquiles · Salsa", "Extras"]);
    expect(report.review.some((r) => r.includes("Chicos") && r.includes("$115"))).toBe(true);

    // Sándwich: empata sin acentos, no cambia su precio, se le pone categoría y acompañamiento.
    const sand = await prisma.foodDish.findFirstOrThrow({ where: { organizationId: orgId, name: "Sandwich Clasico" }, include: { variants: true, category: true, modifierGroups: { include: { group: true } } } });
    expect(Number(sand.variants[0].price)).toBe(95);
    expect(sand.category?.name).toBe("Sandwiches");
    expect(sand.modifierGroups.map((l) => l.group.name)).toEqual(["Acompañamiento"]);
    expect(await prisma.foodDish.count({ where: { organizationId: orgId, name: "Sándwich Clásico" } })).toBe(0);

    // Grupo existente: conserva sus opciones y precios, agrega las que faltan.
    const extras = await prisma.foodModifierGroup.findFirstOrThrow({ where: { organizationId: orgId, name: "Extras" }, include: { options: true } });
    expect(extras.options.find((o) => o.name === "Tocino")).toBeTruthy();
    expect(Number(extras.options.find((o) => o.name === "Aguacate")!.priceDelta)).toBe(25);
    expect(extras.options.find((o) => o.name === "Pechuga de pollo")?.priceDelta.toString()).toBe("40");
    expect(extras.maxSelect).toBe(3);
    expect(report.review.some((r) => r.includes("Extras") && r.includes("10"))).toBe(true);

    // Nuevo: licuado con tamaños Vaso/Litro y sus grupos; desayuno completo separado en dos.
    const berry = await prisma.foodDish.findFirstOrThrow({ where: { organizationId: orgId, name: "Berry Bloom" }, include: { variants: true, modifierGroups: true } });
    expect(berry.variants.map((v) => `${v.label} ${Number(v.price)}`).sort()).toEqual(["Litro 160", "Vaso 100"]);
    expect(berry.modifierGroups).toHaveLength(3);
    expect(await prisma.foodDish.count({ where: { organizationId: orgId, name: { startsWith: "Desayuno Completo" } } })).toBe(2);
    const total = villaGardeniaMenu.categories.reduce((n, c) => n + c.dishes.length, 0);
    expect(await prisma.foodDish.count({ where: { organizationId: orgId } })).toBe(total);
    expect(await prisma.foodModifierGroup.count({ where: { organizationId: orgId } })).toBe(villaGardeniaMenu.groups.length);
  });

  it("correrlo otra vez no crea ni cambia nada", async () => {
    const counts = async () => [await prisma.foodDish.count({ where: { organizationId: orgId } }), await prisma.foodDishVariant.count({ where: { organizationId: orgId } }), await prisma.foodModifierOption.count({ where: { group: { organizationId: orgId } } }), await prisma.foodDishModifierGroup.count({ where: { dish: { organizationId: orgId } } })];
    const before = await counts();
    const report = await loadMenu(prisma, orgId, villaGardeniaMenu, { apply: true });
    expect(report.created).toEqual([]);
    expect(report.updated).toEqual([]);
    expect(await counts()).toEqual(before);
  });
});
