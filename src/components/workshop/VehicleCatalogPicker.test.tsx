import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { VehicleCatalogPicker } from "./VehicleCatalogPicker";

function Example() {
  const [value, setValue] = useState("");
  return <VehicleCatalogPicker name="marca" label="Marca" value={value} onChange={setValue} options={["Nissan", "Toyota"]} placeholder="Busca" />;
}

describe("Workshop vehicle catalog picker", () => {
  it("shows choices on focus, filters by text, and permits a typed value", () => {
    render(<Example />);
    const input = screen.getByRole("combobox", { name: "Marca" });
    fireEvent.focus(input);
    expect(screen.getByRole("option", { name: "Nissan" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "Toy" } });
    expect(screen.queryByRole("option", { name: "Nissan" })).toBeNull();
    expect(screen.getByRole("option", { name: "Toyota" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: "Toyota" }));
    expect((input as HTMLInputElement).value).toBe("Toyota");
    fireEvent.change(input, { target: { value: "Marca especial" } });
    expect((input as HTMLInputElement).value).toBe("Marca especial");
  });
});
