import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  getProfileProducts: vi.fn(),
  listSmartcardCatalog: vi.fn(),
  addProfileProduct: vi.fn(),
  deleteProfileLink: vi.fn(),
}));
vi.mock("@/actions/portal/smartcard", () => actions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SmartcardProductsSection } from "./SmartcardProductsSection";

const casa = { ref: "realty:p1", title: "Casa en Cumbres", subtitle: "Casa · 3 rec · Cumbres", priceLabel: "$4,500,000", imageUrl: null };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SmartcardProductsSection", () => {
  it("agrega un producto del catálogo y lo marca como agregado", async () => {
    actions.getProfileProducts.mockResolvedValue({ success: true, products: [], ready: true });
    actions.listSmartcardCatalog.mockResolvedValue([{ key: "realty", label: "Real Estate", items: [casa] }]);
    actions.addProfileProduct.mockResolvedValue({ success: true, product: { id: "l1", ref: casa.ref, title: casa.title, subtitle: casa.subtitle, priceLabel: casa.priceLabel, imageUrl: null, url: "https://x/p/1", sortOrder: 0 } });
    render(<SmartcardProductsSection profileId="prof1" lang="es" />);
    fireEvent.click(await screen.findByRole("button", { name: "Agregar producto" }));
    expect(await screen.findByText("Real Estate")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    await waitFor(() => expect(actions.addProfileProduct).toHaveBeenCalledWith("prof1", "realty:p1"));
    expect(await screen.findByRole("button", { name: "Agregado" })).toBeDisabled();
    expect(screen.getByText("Productos en la tarjeta (1)")).toBeVisible();
  });

  it("avisa cuando falta habilitar productos en SmartCard", async () => {
    actions.getProfileProducts.mockResolvedValue({ success: true, products: [], ready: false });
    render(<SmartcardProductsSection profileId="prof1" lang="es" />);
    expect(await screen.findByText(/todavía no están habilitados/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Agregar producto" })).not.toBeInTheDocument();
  });

  it("explica cuando no hay módulos con productos", async () => {
    actions.getProfileProducts.mockResolvedValue({ success: true, products: [], ready: true });
    actions.listSmartcardCatalog.mockResolvedValue([]);
    render(<SmartcardProductsSection profileId="prof1" lang="en" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add product" }));
    expect(await screen.findByText(/no module with products/)).toBeVisible();
  });
});
