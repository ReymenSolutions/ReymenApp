import { describe, it, expect } from "vitest";
import { getCrmTabs, CRM_PATHS } from "./crm-tabs";

const keys = (modules: Parameters<typeof getCrmTabs>[0]) => getCrmTabs(modules).map((t) => t.key);

describe("pestañas del CRM", () => {
  it("con CRM: Hoy, Contactos, Pipeline, Inbox y Citas, en ese orden", () => {
    expect(keys(["CRM"])).toEqual(["today", "contacts", "pipeline", "inbox", "appointments"]);
  });
  it("Clientes del negocio solo con Reymen Foods", () => {
    expect(keys(["CRM", "FOOD_OPS"])).toEqual(["today", "contacts", "pipeline", "inbox", "appointments", "customers"]);
  });
  it("sin CRM, Hoy/Contactos/Pipeline no aparecen; el Inbox sigue con el Asistente IA; Citas siempre", () => {
    expect(keys([])).toEqual(["appointments"]);
    expect(keys(["AI_WHATSAPP"])).toEqual(["inbox", "appointments"]);
  });
  it("las direcciones son las de siempre y todas están marcadas como parte del CRM", () => {
    for (const tab of getCrmTabs(["CRM", "FOOD_OPS"])) expect(CRM_PATHS).toContain(tab.href);
    expect(getCrmTabs(["CRM"]).find((t) => t.key === "contacts")?.href).toBe("/portal/leads");
  });
});
