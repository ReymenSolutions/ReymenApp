import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RouteError } from "./RouteError";
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es" }) }));
describe("recoverable route error", () => {
  it("explains the failure and provides a working retry instead of empty content", () => {
    const retry = vi.fn();
    render(<RouteError retry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("No se pudo cargar");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
