import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { useDrawerSwipe } from "./useDrawerSwipe";

function Harness() {
  const [open, setOpen] = useState(false);
  const drawer = useDrawerSwipe({ open, setOpen });
  return (
    <div>
      <p data-testid="state">{open ? "open" : "closed"}</p>
      <button onClick={drawer.close}>cerrar</button>
      <button onClick={drawer.open}>abrir</button>
    </div>
  );
}

function touch(type: "touchstart" | "touchmove" | "touchend", x: number, y: number) {
  const e = new Event(type, { bubbles: true });
  Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : [{ clientX: x, clientY: y }] });
  act(() => { document.dispatchEvent(e); });
}
const swipe = (from: [number, number], to: [number, number]) => {
  touch("touchstart", from[0], from[1]);
  touch("touchmove", (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  touch("touchmove", to[0], to[1]);
  touch("touchend", to[0], to[1]);
};
const state = () => screen.getByTestId("state").textContent;

describe("gesto del menú lateral", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = ((q: string) => ({ matches: q.includes("1023"), media: q, addEventListener() {}, removeEventListener() {} })) as never;
  });
  afterEach(() => vi.useRealTimers());

  it("reserva el gesto del borde para el historial nativo", () => {
    render(<Harness />);
    swipe([10, 300], [140, 310]);
    expect(state()).toBe("closed");
  });

  it("no se abre con un deslizamiento que no empieza en el borde, que es muy corto o que es vertical", () => {
    render(<Harness />);
    swipe([120, 300], [260, 300]); // empieza lejos del borde
    expect(state()).toBe("closed");
    swipe([10, 300], [40, 300]); // muy corto
    expect(state()).toBe("closed");
    swipe([10, 300], [60, 520]); // más vertical que horizontal: es desplazamiento
    expect(state()).toBe("closed");
  });

  it("el botón abre y un enlace puede cerrar inmediatamente", () => {
    render(<Harness />);
    act(() => { screen.getByText("abrir").click(); });
    expect(state()).toBe("open");
    act(() => { screen.getByText("cerrar").click(); });
    expect(state()).toBe("closed");
  });

  it("deslizar hacia la izquierda con el menú abierto lo cierra", () => {
    render(<Harness />);
    act(() => { screen.getByText("abrir").click(); });
    swipe([200, 300], [90, 305]);
    expect(state()).toBe("closed");
  });

  it("en pantallas grandes no hace nada", () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    render(<Harness />);
    swipe([10, 300], [140, 300]);
    expect(state()).toBe("closed");
  });
});
