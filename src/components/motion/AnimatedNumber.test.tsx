import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AnimatedNumber } from "./AnimatedNumber";
import { formatNumber } from "@/lib/format-number";

function mockReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
}

describe("formatNumber", () => {
  it("conserva moneda, porcentaje y separadores", () => {
    expect(formatNumber(1234567, { style: "currency", currency: "MXN" })).toBe("$1,234,567");
    expect(formatNumber(0.256, { style: "percent" })).toBe("26%");
    expect(formatNumber(1234.5, { maximumFractionDigits: 1 })).toBe("1,234.5");
    expect(formatNumber(12, { suffix: " días" })).toBe("12 días");
  });
});

describe("AnimatedNumber", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("con movimiento reducido muestra el valor final de inmediato", () => {
    mockReducedMotion(true);
    const { container } = render(<AnimatedNumber value={1500} format={{ style: "currency" }} />);
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent("$1,500");
  });

  it("el lector de pantalla siempre recibe el valor final, no los intermedios", () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    render(<AnimatedNumber value={200} />);
    expect(screen.getByText("200", { selector: ".sr-only" })).toBeInTheDocument();
  });

  it("sube desde 0 al montar y al cambiar el dato interpola desde el valor anterior", () => {
    mockReducedMotion(false);
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const step = (to: number) => {
      now = to;
      const pending = frames.splice(0);
      act(() => pending.forEach((cb) => cb(now)));
    };
    const shown = (c: HTMLElement) => c.querySelector("[aria-hidden]")!.textContent;

    const { container, rerender } = render(<AnimatedNumber value={100} duration={100} />);
    step(50);
    const mid = Number(shown(container));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    step(200);
    expect(shown(container)).toBe("100");

    rerender(<AnimatedNumber value={300} duration={100} />);
    step(250);
    const mid2 = Number(shown(container));
    expect(mid2).toBeGreaterThan(100); // parte de 100, no de 0
    expect(mid2).toBeLessThan(300);
    step(400);
    expect(shown(container)).toBe("300");
  });
});
