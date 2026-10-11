import { describe, expect, it } from "vitest";
import { branchWhere, cleanBranchName, parseBranchParam } from "./branches";

describe("branches helpers", () => {
  it("parsea el filtro de la URL sin dar acceso a sucursales ajenas", () => {
    const mine = [{ id: "b1" }];
    expect(parseBranchParam(undefined, mine)).toBeUndefined();
    expect(parseBranchParam("", mine)).toBeUndefined();
    expect(parseBranchParam("main", mine)).toBeNull();
    expect(parseBranchParam("b1", mine)).toBe("b1");
    expect(parseBranchParam("ajena", mine)).toBeUndefined();
  });
  it("arma la condición de ventas", () => {
    expect(branchWhere(undefined)).toEqual({});
    expect(branchWhere(null)).toEqual({ branchId: null });
    expect(branchWhere("b1")).toEqual({ branchId: "b1" });
  });
  it("limpia el nombre", () => {
    expect(cleanBranchName("  Centro   Histórico ")).toBe("Centro Histórico");
  });
});
