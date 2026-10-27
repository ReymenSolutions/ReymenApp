import { describe, it, expect } from "vitest";
import { PAGE_SIZES, pageWindow, parsePaging, rangeOf, totalPagesOf } from "./paging";

describe("paginación", () => {
  it("lee página y tamaño de la URL con valores permitidos", () => {
    expect(parsePaging({ page: "3", ps: "50" })).toEqual({ page: 3, pageSize: 50 });
    expect(parsePaging({})).toEqual({ page: 1, pageSize: 25 });
    expect(parsePaging({ page: "-4", ps: "7" }, 50)).toEqual({ page: 1, pageSize: 50 });
    expect(parsePaging({ page: "abc", ps: "100" })).toEqual({ page: 1, pageSize: 100 });
    expect(PAGE_SIZES).toContain(25);
  });

  it("calcula total de páginas y rango mostrado", () => {
    expect(totalPagesOf(0, 25)).toBe(1);
    expect(totalPagesOf(230, 50)).toBe(5);
    expect(rangeOf(1, 25, 0)).toEqual({ from: 0, to: 0 });
    expect(rangeOf(5, 50, 230)).toEqual({ from: 201, to: 230 });
    expect(rangeOf(2, 10, 15)).toEqual({ from: 11, to: 15 });
  });

  it("arma la ventana de números con huecos", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(1, 12)).toEqual([1, 2, "gap", 12]);
    expect(pageWindow(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageWindow(12, 12)).toEqual([1, "gap", 11, 12]);
    expect(pageWindow(4, 12)).toEqual([1, 2, 3, 4, 5, "gap", 12]);
  });
});
