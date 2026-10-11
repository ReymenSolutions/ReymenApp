import { describe, it, expect } from "vitest";
import { coerceValue, displayValue, keyFromLabel, normalizeOptions, sanitizeCustomFields, uniqueKey, type CustomFieldDef } from "./custom-fields";

const f = (type: CustomFieldDef["type"], options: string[] = [], key = "k"): CustomFieldDef => ({ key, label: key, type, options });

describe("keys and options", () => {
  it("builds a stable key from a label", () => {
    expect(keyFromLabel("Fecha de nacimiento")).toBe("fecha_de_nacimiento");
    expect(keyFromLabel("  ¿Tratamiento de interés? ")).toBe("tratamiento_de_interes");
    expect(keyFromLabel("???")).toBe("campo");
    expect(keyFromLabel("A".repeat(80)).length).toBeLessThanOrEqual(40);
  });
  it("makes keys unique", () => {
    expect(uniqueKey("aseguradora", new Set())).toBe("aseguradora");
    expect(uniqueKey("aseguradora", new Set(["aseguradora"]))).toBe("aseguradora_2");
    expect(uniqueKey("aseguradora", new Set(["aseguradora", "aseguradora_2"]))).toBe("aseguradora_3");
  });
  it("cleans option lists (commas or lines, no empties or repeats)", () => {
    expect(normalizeOptions("GNP, AXA\nMetlife,  gnp ,, ")).toEqual(["GNP", "AXA", "Metlife"]);
    expect(normalizeOptions(["  a ", "A", "b"])).toEqual(["a", "b"]);
    expect(normalizeOptions(null)).toEqual([]);
    expect(normalizeOptions(Array.from({ length: 50 }, (_, i) => `o${i}`))).toHaveLength(30);
  });
});

describe("coerceValue", () => {
  it("treats empty as 'remove the value'", () => {
    for (const t of ["TEXT", "NUMBER", "DATE", "SELECT", "BOOLEAN"] as const) {
      expect(coerceValue(f(t, ["a"]), "")).toEqual({ ok: true, value: null });
      expect(coerceValue(f(t, ["a"]), null)).toEqual({ ok: true, value: null });
      expect(coerceValue(f(t, ["a"]), "   ")).toEqual({ ok: true, value: null });
    }
  });
  it("TEXT", () => {
    expect(coerceValue(f("TEXT"), "  hola  ")).toEqual({ ok: true, value: "hola" });
    expect(coerceValue(f("TEXT"), 42)).toEqual({ ok: true, value: "42" });
    expect(coerceValue(f("TEXT"), "x".repeat(501))).toEqual({ ok: false });
    expect(coerceValue(f("TEXT"), { a: 1 })).toEqual({ ok: false });
  });
  it("NUMBER", () => {
    expect(coerceValue(f("NUMBER"), "1,250.5")).toEqual({ ok: true, value: 1250.5 });
    expect(coerceValue(f("NUMBER"), 7)).toEqual({ ok: true, value: 7 });
    expect(coerceValue(f("NUMBER"), "abc")).toEqual({ ok: false });
    expect(coerceValue(f("NUMBER"), Infinity)).toEqual({ ok: false });
    expect(coerceValue(f("NUMBER"), true)).toEqual({ ok: false });
  });
  it("DATE accepts only real calendar dates", () => {
    expect(coerceValue(f("DATE"), "1990-05-01")).toEqual({ ok: true, value: "1990-05-01" });
    expect(coerceValue(f("DATE"), "1990-05-01T10:00:00Z")).toEqual({ ok: true, value: "1990-05-01" });
    expect(coerceValue(f("DATE"), "1990-02-30")).toEqual({ ok: false });
    expect(coerceValue(f("DATE"), "01/05/1990")).toEqual({ ok: false });
  });
  it("SELECT only takes a listed option (any casing) and returns the canonical one", () => {
    const sel = f("SELECT", ["GNP", "AXA"]);
    expect(coerceValue(sel, "gnp")).toEqual({ ok: true, value: "GNP" });
    expect(coerceValue(sel, "Otra")).toEqual({ ok: false });
  });
  it("BOOLEAN", () => {
    expect(coerceValue(f("BOOLEAN"), true)).toEqual({ ok: true, value: true });
    expect(coerceValue(f("BOOLEAN"), "Sí")).toEqual({ ok: true, value: true });
    expect(coerceValue(f("BOOLEAN"), "no")).toEqual({ ok: true, value: false });
    expect(coerceValue(f("BOOLEAN"), "quizá")).toEqual({ ok: false });
  });
});

describe("sanitizeCustomFields", () => {
  const fields = [f("TEXT", [], "alergias"), f("SELECT", ["GNP", "AXA"], "aseguradora"), f("NUMBER", [], "edad")];

  it("ignores unknown keys, saves valid ones and reports invalid ones without touching the old value", () => {
    const r = sanitizeCustomFields(fields, { aseguradora: "axa", edad: "veinte", otra: "x", alergias: "Penicilina" }, { edad: 30, aseguradora: "GNP" });
    expect(r.values).toEqual({ aseguradora: "AXA", edad: 30, alergias: "Penicilina" });
    expect(r.invalid).toEqual(["edad"]);
  });
  it("an empty value removes the key", () => {
    const r = sanitizeCustomFields(fields, { alergias: "" }, { alergias: "Penicilina", edad: 5 });
    expect(r.values).toEqual({ edad: 5 });
  });
  it("drops stored values whose field no longer exists or has a bad shape, and survives garbage input", () => {
    expect(sanitizeCustomFields(fields, {}, { viejo: "x", edad: 3, raro: { a: 1 } }).values).toEqual({ edad: 3 });
    expect(sanitizeCustomFields(fields, {}, "no es objeto").values).toEqual({});
    expect(sanitizeCustomFields(fields, {}, [1, 2]).values).toEqual({});
    expect(sanitizeCustomFields(fields, {}, null).values).toEqual({});
  });
});

describe("displayValue", () => {
  it("formats each type for people", () => {
    expect(displayValue({ type: "BOOLEAN" }, true)).toBe("Sí");
    expect(displayValue({ type: "BOOLEAN" }, false, "en")).toBe("No");
    expect(displayValue({ type: "DATE" }, "1990-05-01", "es")).toMatch(/1990/);
    expect(displayValue({ type: "NUMBER" }, 1250.5, "es")).toBe("1,250.5");
    expect(displayValue({ type: "TEXT" }, "hola")).toBe("hola");
    expect(displayValue({ type: "TEXT" }, null)).toBe("");
  });
});
