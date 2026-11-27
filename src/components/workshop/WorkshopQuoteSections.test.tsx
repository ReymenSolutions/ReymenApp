import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkshopQuoteSections } from "./WorkshopQuoteSections";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("Workshop quote navigation", () => {
  it("shows the unread request count and hides it after review", () => {
    const { rerender } = render(<WorkshopQuoteSections lang="es" view="received" unread={3} canCreate />);
    expect(screen.getByRole("link", { name: /Solicitudes recibidas/ })).toHaveTextContent("3");
    rerender(<WorkshopQuoteSections lang="es" view="received" unread={0} canCreate />);
    expect(screen.getByRole("link", { name: "Solicitudes recibidas" })).not.toHaveTextContent("3");
    expect(screen.getByRole("link", { name: "Nueva cotización" })).toBeTruthy();
  });

  it("keeps price entry hidden from operational roles", () => {
    render(<WorkshopQuoteSections lang="en" view="received" unread={1} canCreate={false} />);
    expect(screen.queryByRole("link", { name: "New quote" })).toBeNull();
    expect(screen.getByRole("link", { name: /Received requests/ })).toBeTruthy();
  });
});
