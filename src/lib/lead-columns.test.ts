import { describe, expect, it } from "vitest";
import { sanitizeLeadColumns } from "./lead-columns";

describe("sanitizeLeadColumns", () => {
  it("devuelve valores por defecto con basura", () => {
    for (const raw of [null, undefined, "x", 5, []]) expect(sanitizeLeadColumns(raw, ["a"])).toEqual({ hidden: [], custom: [] });
  });

  it("descarta columnas desconocidas y duplicadas", () => {
    expect(sanitizeLeadColumns({ hidden: ["score", "score", "name", 3, "nope"], custom: [] }, []).hidden).toEqual(["score"]);
  });

  it("solo conserva campos personalizados activos, en su orden", () => {
    expect(sanitizeLeadColumns({ hidden: [], custom: ["b", "gone", "a", "b"] }, ["a", "b"]).custom).toEqual(["b", "a"]);
  });

  it("tolera que hidden/custom no sean listas", () => {
    expect(sanitizeLeadColumns({ hidden: "score", custom: { a: 1 } }, ["a"])).toEqual({ hidden: [], custom: [] });
  });
});
