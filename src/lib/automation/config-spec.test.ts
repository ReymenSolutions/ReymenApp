import { describe, it, expect } from "vitest";
import { validateConfigSpec, compileConfigSpec, ownerEditableKeys } from "./config-spec";
import { describeConfig } from "./config-ui";
import { validateConfigUpdate, type ConfigSource } from "./config-form";

const bi = (t: string) => ({ es: t, en: t });
const spec = {
  hour: { kind: "hour", group: "when", label: bi("Hora"), help: bi("h"), default: 9 },
  max: { kind: "number", group: "limits", integer: true, min: 1, max: 10, default: 3, label: bi("Máx"), help: bi("m"), unit: bi("veces") },
  mode: { kind: "select", group: "channel", options: { a: bi("A"), b: bi("B") }, default: "a", label: bi("Modo"), help: bi("m"), ownerEditable: true },
  link: { kind: "url", group: "extras", label: bi("Enlace"), help: bi("l"), ownerEditable: true },
  boss: { kind: "phone", group: "who", required: true, label: bi("Jefe"), help: bi("j") },
};

describe("declaración de parámetros (config-spec)", () => {
  it("compila al mismo formato que los blueprints: describeConfig trae límites, opciones y valores de fábrica", () => {
    const checked = validateConfigSpec(spec);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const fields = describeConfig(compileConfigSpec(checked.spec));
    expect(fields.map((f) => f.group)).toEqual(["when", "who", "channel", "limits", "extras"]);
    expect(fields.find((f) => f.key === "max")).toMatchObject({ min: 1, max: 10, step: 1, defaultValue: 3, unit: bi("veces") });
    expect(fields.find((f) => f.key === "mode")?.options?.map((o) => o.value)).toEqual(["a", "b"]);
    expect(fields.find((f) => f.key === "hour")).toMatchObject({ min: 0, max: 23 });
    expect(ownerEditableKeys(checked.spec).sort()).toEqual(["link", "mode"]);
  });

  it("rechaza declaraciones incoherentes con mensajes legibles", () => {
    const bad = (s: unknown) => { const r = validateConfigSpec(s); return r.ok ? [] : r.errors.join(" | "); };
    expect(bad({})).toMatch(/parámetros/);
    expect(bad({ x: { ...spec.max, min: 5, max: 1 } })).toMatch(/mínimo no puede ser mayor/);
    expect(bad({ x: { ...spec.max, default: 99 } })).toMatch(/valor de fábrica/);
    expect(bad({ x: { ...spec.mode, options: undefined } })).toMatch(/necesita opciones/);
    expect(bad({ x: { ...spec.link, options: { a: bi("A") } } })).toMatch(/solo un select/);
    expect(bad({ x: { ...spec.link, extra: 1 } })).not.toBe("");
    expect(bad({ "1mala": spec.hour })).not.toBe("");
  });

  it("valida cambios: ignora llaves desconocidas y las no permitidas, exige obligatorios y dice qué cambió", () => {
    const checked = validateConfigSpec(spec);
    if (!checked.ok) throw new Error("spec");
    const source: ConfigSource = { kind: "template", name: "T", version: "1.0.0", compiled: compileConfigSpec(checked.spec), spec: checked.spec };
    expect(validateConfigUpdate(source, {}, { max: 4 })).toEqual({ ok: false, errors: { boss: { code: "required" } } });
    const ok = validateConfigUpdate(source, {}, { boss: "+5215512345678", max: 4, inventado: 1 });
    expect(ok).toMatchObject({ ok: true, changed: ["max", "boss"] });
    // El dueño solo puede tocar sus campos: lo demás se ignora aunque lo mande.
    const owner = validateConfigUpdate(source, { boss: "+5215512345678" }, { max: 9, mode: "b" }, new Set(["mode", "link"]));
    expect(owner).toMatchObject({ ok: true, changed: ["mode"] });
  });
});
