import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeadTabs } from "./LeadTabs";

afterEach(cleanup);
const props = {
  label: "Secciones",
  labels: { summary: "Resumen", activity: "Actividad", data: "Datos" },
  counts: { activity: 3 },
  panels: { summary: <p>panel-resumen</p>, activity: <textarea aria-label="nota" />, data: <p>panel-datos</p> },
};

describe("LeadTabs", () => {
  it("abre la pestaña indicada y muestra el conteo", () => {
    render(<LeadTabs {...props} initial="activity" />);
    expect(screen.getByRole("tab", { name: /Actividad/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.getByText("panel-resumen")).not.toBeVisible();
  });

  it("al cambiar de pestaña conserva lo escrito en las demás", async () => {
    render(<LeadTabs {...props} initial="activity" />);
    await userEvent.type(screen.getByLabelText("nota"), "hola");
    await userEvent.click(screen.getByRole("tab", { name: "Datos" }));
    expect(screen.getByText("panel-datos")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: /Actividad/ }));
    expect(screen.getByLabelText("nota")).toHaveValue("hola");
  });
});
