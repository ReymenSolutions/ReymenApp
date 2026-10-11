import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: "es" }) }));

import { IngredientCombobox } from "./IngredientCombobox";

const items = [
  { id: "a", name: "Aguacate", unit: "kg" },
  { id: "m", name: "Mango", unit: "kg" },
  { id: "n", name: "Naranja", unit: "pza" },
];

function Harness({ onChange }: { onChange: (id: string) => void }) {
  const [value, setValue] = useState("");
  return <IngredientCombobox items={items} value={value} onChange={(id) => { setValue(id); onChange(id); }} />;
}

describe("IngredientCombobox", () => {
  it("muestra la lista completa al enfocar y se elige con un toque", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Aguacatekg", "Mangokg", "Naranjapza"]);
    await userEvent.click(screen.getByRole("option", { name: /Mango/ }));
    expect(onChange).toHaveBeenLastCalledWith("m");
    expect(screen.getByRole("combobox")).toHaveValue("Mango");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("conserva la búsqueda: filtra al escribir (sin acentos ni mayúsculas) y se elige con el teclado", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByRole("combobox"), "NAR");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("n");
  });

  it("avisa cuando nada coincide y no elige ningún insumo", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(screen.getByRole("combobox"), "zzz");
    expect(screen.getByText(/Ningún insumo coincide|No supply item matches/)).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
