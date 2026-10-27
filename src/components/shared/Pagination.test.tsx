import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es" }) }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/portal/customers", useSearchParams: () => new URLSearchParams("q=ana&page=3") }));

import { Pagination, UrlPagination } from "./Pagination";

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("Pagination", () => {
  it("muestra el rango, los números con huecos y marca la página actual", () => {
    render(<Pagination page={6} pageSize={10} total={120} onPageChange={() => {}} />);
    expect(screen.getByText("Mostrando 51–60 de 120")).toBeVisible();
    expect(screen.getByRole("button", { name: "Página 6" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Página 12" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Página 9" })).not.toBeInTheDocument();
  });

  it("navega con números, anterior/siguiente y primera/última, y deshabilita los extremos", async () => {
    const onPage = vi.fn();
    const { rerender } = render(<Pagination page={1} pageSize={10} total={35} onPageChange={onPage} />);
    expect(screen.getByRole("button", { name: "Primera página" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await userEvent.click(screen.getByRole("button", { name: "Última página" }));
    expect(onPage.mock.calls).toEqual([[2], [4]]);
    rerender(<Pagination page={4} pageSize={10} total={35} onPageChange={onPage} />);
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("ofrece «Por página» solo si se da el manejador y no se muestra si todo cabe", async () => {
    const onSize = vi.fn();
    const { rerender } = render(<Pagination page={1} pageSize={25} total={80} onPageChange={() => {}} onPageSizeChange={onSize} />);
    await userEvent.selectOptions(screen.getByLabelText("Por página"), "50");
    expect(onSize).toHaveBeenCalledWith(50);
    rerender(<Pagination page={1} pageSize={25} total={8} onPageChange={() => {}} onPageSizeChange={onSize} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("UrlPagination", () => {
  it("cambia page en la URL conservando los demás filtros, y reinicia la página al cambiar el tamaño", async () => {
    render(<UrlPagination page={3} pageSize={25} total={200} />);
    await userEvent.click(screen.getByRole("button", { name: "Página 4" }));
    expect(push).toHaveBeenLastCalledWith("/portal/customers?q=ana&page=4");
    await userEvent.click(screen.getByRole("button", { name: "Primera página" }));
    expect(push).toHaveBeenLastCalledWith("/portal/customers?q=ana");
    await userEvent.selectOptions(screen.getByLabelText("Por página"), "100");
    expect(push).toHaveBeenLastCalledWith("/portal/customers?q=ana&ps=100");
    await userEvent.selectOptions(screen.getByLabelText("Por página"), "25");
    expect(push).toHaveBeenLastCalledWith("/portal/customers?q=ana");
  });
});
