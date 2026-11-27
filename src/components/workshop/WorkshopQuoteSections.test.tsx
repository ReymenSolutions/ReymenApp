import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkshopQuoteSections } from "./WorkshopQuoteSections";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("Workshop quote navigation", () => {
  it("shows only pending requests in the badge", () => {
    const { rerender } = render(<WorkshopQuoteSections lang="es" view="pending" pending={2} />);
    expect(screen.getByRole("link", { name: /Por atender/ })).toHaveTextContent("2");
    rerender(<WorkshopQuoteSections lang="es" view="mine" pending={0} />);
    expect(screen.getByRole("link", { name: "Por atender" })).not.toHaveTextContent("2");
    expect(screen.getByRole("link", { name: "Mis cotizaciones" })).toBeTruthy();
  });
});
