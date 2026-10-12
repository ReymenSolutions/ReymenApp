import { describe, it, expect } from "vitest";
import { listBlueprints } from "./blueprints";
import { describeConfig, missingConfigUi, CONFIG_GROUPS } from "./config-ui";

describe("configuración de blueprints en el Admin", () => {
  it("NINGÚN parámetro de ningún blueprint queda sin presentación en la pantalla", () => {
    for (const b of listBlueprints()) expect(missingConfigUi(b), b.key).toEqual([]);
  });

  it("cada campo trae título, ayuda, sección conocida y valor de fábrica; los límites salen del esquema", () => {
    for (const b of listBlueprints()) {
      const fields = describeConfig(b);
      expect(fields.length, b.key).toBe(Object.keys((b.configSchema as unknown as { shape: object }).shape).length);
      for (const f of fields) {
        expect(f.label.es && f.label.en && f.help.es && f.help.en, `${b.key}.${f.key}`).toBeTruthy();
        expect(CONFIG_GROUPS).toContain(f.group);
      }
    }
    const recovery = describeConfig(listBlueprints().find((b) => b.key === "customer_recovery")!);
    expect(recovery.find((f) => f.key === "minVisits")).toMatchObject({ kind: "number", min: 2, max: 50, defaultValue: 3, group: "who" });
    expect(recovery.find((f) => f.key === "factor")).toMatchObject({ min: 1.5, max: 10, step: 0.1, defaultValue: 2.5 });
    expect(recovery.find((f) => f.key === "channel")?.options?.map((o) => o.value)).toEqual(["whatsapp", "sms"]);
    expect(recovery.find((f) => f.key === "quietStart")).toMatchObject({ kind: "hour", min: 0, max: 23 });
  });

  it("las secciones salen ordenadas: cuándo, a quién, canal y horario, límites y opcionales", () => {
    const fields = describeConfig(listBlueprints().find((b) => b.key === "customer_recovery")!);
    const order = fields.map((f) => CONFIG_GROUPS.indexOf(f.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
