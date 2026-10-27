import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  createCustomField: vi.fn(),
  deleteCustomField: vi.fn().mockResolvedValue({ success: true, contactsCleared: 3 }),
  getCustomFieldUsage: vi.fn().mockResolvedValue({ contacts: 3 }),
  setCustomFieldActive: vi.fn(),
  updateCustomField: vi.fn(),
}));
vi.mock("@/actions/custom-fields", () => actions);
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es" }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CustomFieldsPanel } from "./CustomFieldsPanel";

const fields = [{ id: "f1", label: "Aseguradora", type: "TEXT" as const, options: [], isActive: true }];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CustomFieldsPanel · eliminar campo", () => {
  it("pide confirmación, avisa cuántos contactos pierden el dato y recién entonces elimina", async () => {
    render(<CustomFieldsPanel fields={fields} canManage max={20} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar campo Aseguradora" }));
    expect(await screen.findByText(/¿Eliminar el campo «Aseguradora»\?/)).toBeVisible();
    expect(await screen.findByText(/3 contactos tienen/)).toBeVisible();
    expect(actions.deleteCustomField).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar campo" }));
    await waitFor(() => expect(actions.deleteCustomField).toHaveBeenCalledWith("f1"));
  });

  it("cancelar no elimina nada", async () => {
    render(<CustomFieldsPanel fields={fields} canManage max={20} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar campo Aseguradora" }));
    await screen.findByText(/3 contactos tienen/);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText(/¿Eliminar el campo/)).not.toBeInTheDocument());
    expect(actions.deleteCustomField).not.toHaveBeenCalled();
  });

  it("sin permiso de administrar no aparece el botón", () => {
    render(<CustomFieldsPanel fields={fields} canManage={false} max={20} />);
    expect(screen.queryByRole("button", { name: /Eliminar campo/ })).not.toBeInTheDocument();
  });
});
