import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchableSelect } from "./SearchableSelect";

const options = [
  { value: "a1", label: "Recuperación de clientes" },
  { value: "a2", label: "Cumpleaños" },
  { value: "a3", label: "Segunda visita", hint: "retención" },
  ...Array.from({ length: 30 }, (_, i) => ({ value: `x${i}`, label: `Automatización ${i}` })),
];
const setup = (props: Partial<React.ComponentProps<typeof SearchableSelect>> = {}) =>
  render(<SearchableSelect label="Automatización" options={options} value="" allLabel="Todas" noResults="Sin resultados" name="automation" {...props} />);
const hidden = (c: HTMLElement) => (c.querySelector('input[type="hidden"]') as HTMLInputElement).value;

describe("SearchableSelect", () => {
  it("se puede escribir para filtrar, sin acentos ni mayúsculas, y elegir con un clic", async () => {
    const onChange = vi.fn();
    const { container } = setup({ onChange });
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option").length).toBe(34); // "Todas" + 33
    await userEvent.type(screen.getByRole("combobox"), "RECUPERACION");
    const found = screen.getAllByRole("option");
    expect(found.map((o) => o.textContent)).toEqual(["Recuperación de clientes"]);
    await userEvent.click(found[0]);
    expect(onChange).toHaveBeenCalledWith("a1");
    expect(hidden(container)).toBe("a1"); // listo para mandarse en un formulario
    expect(screen.getByRole("combobox")).toHaveValue("Recuperación de clientes");
  });

  it("busca también en la pista y avisa cuando no hay resultados", async () => {
    setup();
    await userEvent.type(screen.getByRole("combobox"), "retencion");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Segunda visitaretención"]);
    await userEvent.clear(screen.getByRole("combobox"));
    await userEvent.type(screen.getByRole("combobox"), "zzz");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
  });

  it("teclado: flechas para moverse, Enter para elegir (sin mandar el formulario) y Escape para cerrar", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const { container } = render(
      <form onSubmit={onSubmit}>
        <SearchableSelect label="Automatización" options={options} value="" allLabel="Todas" noResults="Sin resultados" name="automation" />
      </form>,
    );
    const box = screen.getByRole("combobox");
    // Escribir filtra y deja resaltado el primer resultado: Enter lo elige y NO manda el formulario.
    await userEvent.type(box, "cumple");
    await userEvent.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(hidden(container)).toBe("a2");
    // Sin escribir, las flechas recorren la lista: "Todas" → 1.ª opción → 2.ª.
    await userEvent.click(box);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(hidden(container)).toBe("a2");
    await userEvent.click(box);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(hidden(container)).toBe("a1");
    await userEvent.click(box);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(hidden(container)).toBe("a1");
  });

  it("muestra la opción actual y permite quitar el filtro", async () => {
    const onChange = vi.fn();
    const { container } = setup({ value: "a2", onChange });
    expect(screen.getByRole("combobox")).toHaveValue("Cumpleaños");
    expect(hidden(container)).toBe("a2");
    await userEvent.click(screen.getByRole("button", { name: "Todas" }));
    expect(onChange).toHaveBeenCalledWith("");
    expect(hidden(container)).toBe("");
  });
});
