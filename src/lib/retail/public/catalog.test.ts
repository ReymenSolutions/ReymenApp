import { describe, expect, it } from "vitest";
import { applyFilters, facets, holdMessage, isPublishable, parseFilters, splitStores, waNumber, whatsappUrl } from "./catalog";
import type { PublicItem, PublicStore } from "./types";

// Datos SOLO de prueba (no se publican): sirven para verificar las reglas, no son prendas reales del cliente.
const item = (over: Partial<PublicItem>): PublicItem => ({
  id: "i1", code: "T-001", brand: "MarcaA", category: "Vestidos", garmentType: "Vestido", size: "M", color: "Azul", style: null,
  salePrice: 500, finalPrice: 500, discountLabel: null, storeId: "s1", storeName: "Tienda Uno", photoUrl: "/f/1.jpg", ...over,
});
const items = [
  item({ id: "a", code: "A" }),
  item({ id: "b", code: "B", brand: "MarcaB", category: "Camisas", size: "L", color: "Rojo", finalPrice: 200, salePrice: 400, storeId: "s2", storeName: "Tienda Dos" }),
  item({ id: "c", code: "C", brand: "márcaa", category: "Vestidos", size: "S", color: "azul", finalPrice: 900, salePrice: 900 }),
];

describe("web pública Retail · qué se publica (W-01, opción A)", () => {
  const base = { status: "DISPONIBLE", channel: "TIENDA", storeIsActive: true, storeType: "TIENDA", hasPhoto: true };
  it("publica lo disponible de tienda o en línea, en tienda activa y con foto", () => {
    expect(isPublishable(base)).toBe(true);
    expect(isPublishable({ ...base, channel: "EN_LINEA" })).toBe(true);
  });
  it("nunca publica lo vendido, apartado, de mayoreo, en bodega, de tienda inactiva o sin foto", () => {
    for (const status of ["VENDIDA", "APARTADA", "EN_TRASLADO", "MERMA"]) expect(isPublishable({ ...base, status })).toBe(false);
    expect(isPublishable({ ...base, channel: "MAYOREO" })).toBe(false);
    expect(isPublishable({ ...base, storeType: "BODEGA" })).toBe(false);
    expect(isPublishable({ ...base, storeIsActive: false })).toBe(false);
    expect(isPublishable({ ...base, hasPhoto: false })).toBe(false);
  });
});

describe("web pública Retail · filtros", () => {
  it("lee los filtros de la URL y descarta lo inválido", () => {
    expect(parseFilters({ tienda: "s1", min: "100", max: "abc", orden: "precio_desc", q: ["vestido", "x"] })).toEqual({
      store: "s1", category: undefined, size: undefined, color: undefined, brand: undefined, min: 100, max: undefined, q: "vestido", sort: "price_desc",
    });
  });
  it("filtra sin importar mayúsculas ni acentos, por tienda, precio y búsqueda", () => {
    const f = (sp: Record<string, string>) => applyFilters(items, parseFilters(sp)).map((i) => i.code);
    expect(f({ marca: "MARCAA" })).toEqual(["A", "C"]);
    expect(f({ tienda: "s2" })).toEqual(["B"]);
    expect(f({ max: "500" })).toEqual(["A", "B"]);
    expect(f({ q: "camis" })).toEqual(["B"]);
    expect(f({ orden: "precio_asc" })).toEqual(["B", "A", "C"]);
  });
  it("los valores de los filtros salen de lo publicado, sin repetir", () => {
    expect(facets(items)).toEqual({ categories: ["Camisas", "Vestidos"], sizes: ["L", "M", "S"], colors: ["Azul", "Rojo"], brands: ["MarcaA", "MarcaB"] });
  });
});

describe("web pública Retail · tiendas y WhatsApp", () => {
  const stores: PublicStore[] = [
    { id: "s1", name: "Uno", format: "PREMIUM", isActive: true, whatsappPhone: "81 1234 5678" },
    { id: "s3", name: "Tres", format: "HOGAR", isActive: false, whatsappPhone: null },
  ];
  it("las tiendas inactivas salen como «Próximamente», no como operativas", () => {
    const { active, comingSoon } = splitStores(stores);
    expect(active.map((s) => s.id)).toEqual(["s1"]);
    expect(comingSoon.map((s) => s.id)).toEqual(["s3"]);
  });
  it("arma el número de wa.me de México y rechaza números incompletos", () => {
    expect(waNumber("81 1234 5678")).toBe("528112345678");
    expect(waNumber("+52 1 81 1234 5678")).toBe("528112345678");
    expect(waNumber("12345")).toBeNull();
    expect(whatsappUrl(null, "hola")).toBeNull();
  });
  it("el mensaje de apartado lleva el código y el precio final, nunca el costo", () => {
    const msg = holdMessage({ item: items[1], customerName: "Ana", expiresAt: "2026-11-24T18:00:00Z", timeZone: "America/Monterrey" });
    expect(msg).toContain("Código: B");
    expect(msg).toContain("$200.00");
    expect(msg).toContain("Mi nombre: Ana");
    expect(msg).toContain("Apartado hasta:");
    expect(msg.toLowerCase()).not.toContain("costo");
  });
});
