import { describe, it, expect } from "vitest";
import { matchesSearch, normalizeSearch } from "./search-text";

describe("búsqueda por texto", () => {
  it("ignora acentos y mayúsculas", () => {
    expect(normalizeSearch("  Recuperación ")).toBe("recuperacion");
    expect(matchesSearch("recuperacion", "Recuperación de clientes")).toBe(true);
    expect(matchesSearch("RECUPERACIÓN", "recuperacion")).toBe(true);
  });
  it("exige todas las palabras, en cualquier orden y en cualquiera de los textos", () => {
    expect(matchesSearch("clientes recup", "Recuperación de clientes")).toBe(true);
    expect(matchesSearch("clientes cumple", "Recuperación de clientes", "customer.at_risk")).toBe(false);
    expect(matchesSearch("at_risk recup", "Recuperación", "customer.at_risk")).toBe(true);
  });
  it("sin búsqueda todo coincide; los textos vacíos no rompen", () => {
    expect(matchesSearch("", "x")).toBe(true);
    expect(matchesSearch("   ", null, undefined)).toBe(true);
    expect(matchesSearch("a", null, undefined)).toBe(false);
  });
});
