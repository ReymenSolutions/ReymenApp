import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { strings } from "@/lib/i18n";

let pathname = "/portal/leads";
let language: "es" | "en" = "es";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: language, t: strings[language] }) }));

import { EnabledModulesProvider } from "@/context/modules";
import { CrmTabs } from "./CrmTabs";

const renderTabs = (modules: ("CRM" | "FOOD_OPS" | "AI_WHATSAPP")[]) =>
  render(
    <EnabledModulesProvider modules={modules}>
      <CrmTabs />
    </EnabledModulesProvider>,
  );

describe("CrmTabs", () => {
  it("muestra las pestañas con sus enlaces de siempre y marca la actual", () => {
    pathname = "/portal/leads";
    renderTabs(["CRM"]);
    expect(screen.getByRole("link", { name: "Contactos" })).toHaveAttribute("href", "/portal/leads");
    expect(screen.getByRole("link", { name: "Contactos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Seguimiento" })).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("link", { name: "Clientes" })).not.toBeInTheDocument();
  });
  it("una subpantalla (la ficha de un contacto) deja activa su pestaña", () => {
    pathname = "/portal/leads/abc123";
    renderTabs(["CRM"]);
    expect(screen.getByRole("link", { name: "Contactos" })).toHaveAttribute("aria-current", "page");
  });
  it("Clientes del negocio aparece con Foods y todo se traduce al inglés", () => {
    language = "en";
    pathname = "/portal/pipeline";
    renderTabs(["CRM", "FOOD_OPS"]);
    expect(screen.getByRole("link", { name: "Customers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Follow-up" })).toHaveAttribute("aria-current", "page");
    language = "es";
  });
  it("sin el módulo CRM no dibuja nada (el menú conserva las entradas sueltas)", () => {
    pathname = "/portal/appointments";
    const { container } = renderTabs(["AI_WHATSAPP"]);
    expect(container).toBeEmptyDOMElement();
  });
});
