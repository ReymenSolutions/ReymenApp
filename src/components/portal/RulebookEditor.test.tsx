import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "@/lib/i18n";

vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es", t: strings.es }) }));
const saveRulebook = vi.fn();
vi.mock("@/actions/ai-drafts", () => ({ setDraftsEnabled: vi.fn() }));
vi.mock("@/actions/rulebook", () => ({ saveRulebook: (...a: unknown[]) => saveRulebook(...a) }));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toast.success(...a), error: (...a: unknown[]) => toast.error(...a) } }));

import { RulebookEditor } from "./RulebookEditor";

const empty = { voice: "", greeting: "", rules: "", pricing: "" };

describe("RulebookEditor", () => {
  beforeEach(() => {
    saveRulebook.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("muestra el avance y las cuatro secciones", () => {
    render(<RulebookEditor initial={{ ...empty, voice: "Cálido" }} canEdit />);
    expect(screen.getByText("1 de 4 secciones listas")).toBeInTheDocument();
    for (const name of ["Cómo hablas", "Saludo", "Reglas duras", "Precios"]) expect(screen.getByLabelText(name)).toBeInTheDocument();
    expect(screen.getByText(/Nada se envía solo/)).toBeInTheDocument();
  });

  it("guardar queda desactivado hasta que hay cambios, y luego guarda lo escrito", async () => {
    saveRulebook.mockResolvedValue({ success: true });
    render(<RulebookEditor initial={empty} canEdit />);
    expect(screen.getByRole("button", { name: "Guardado" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Reglas duras"), "No inventes precios");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Rulebook guardado"));
    expect(saveRulebook).toHaveBeenCalledWith({ ...empty, rules: "No inventes precios" });
    expect(screen.getByRole("button", { name: "Guardado" })).toBeDisabled();
  });

  it("si falla el guardado conserva el texto y deja reintentar", async () => {
    saveRulebook.mockRejectedValue(new Error("boom"));
    render(<RulebookEditor initial={empty} canEdit />);
    await userEvent.type(screen.getByLabelText("Saludo"), "Hola");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByLabelText("Saludo")).toHaveValue("Hola");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("'Usar ejemplo' rellena solo una sección vacía", async () => {
    render(<RulebookEditor initial={{ ...empty, pricing: "Mis precios" }} canEdit />);
    expect(screen.getAllByRole("button", { name: "Usar ejemplo" })).toHaveLength(3);
    await userEvent.click(screen.getAllByRole("button", { name: "Usar ejemplo" })[0]);
    expect((screen.getByLabelText("Cómo hablas") as HTMLTextAreaElement).value).toMatch(/Dueño de taller/);
    expect(screen.getByLabelText("Precios")).toHaveValue("Mis precios");
  });

  it("sin permiso es de solo lectura: no hay guardar ni ejemplos y no se puede escribir", () => {
    render(<RulebookEditor initial={{ ...empty, voice: "Cálido" }} canEdit={false} />);
    expect(screen.queryByRole("button", { name: /Guardar|Guardado/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usar ejemplo" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cómo hablas")).toHaveAttribute("readonly");
    expect(screen.getByText(/Solo quien administra/)).toBeInTheDocument();
  });
});
