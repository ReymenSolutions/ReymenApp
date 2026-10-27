import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const prefs = vi.hoisted(() => ({ theme: "light" as "light" | "dark", lang: "es" as "es" | "en", setTheme: vi.fn(), setLang: vi.fn(), refresh: vi.fn() }));
vi.mock("@/context/preferences", () => ({ usePreferences: () => prefs }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: prefs.refresh }) }));

import { Gallery, LandingPrefs } from "./PublicLanding";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  prefs.theme = "light";
  prefs.lang = "es";
  document.cookie = "reymen-lang=; max-age=0; path=/";
});

const labels = { lang: "Idioma", toDark: "Cambiar a modo oscuro", toLight: "Cambiar a modo claro" };

describe("LandingPrefs · idioma y tema", () => {
  it("cambiar de idioma lo guarda (cookie + preferencia) y vuelve a pedir la página para traducirla", () => {
    render(<LandingPrefs labels={labels} />);
    expect(screen.getByRole("button", { name: "es" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "en" }));
    expect(document.cookie).toContain("reymen-lang=en");
    expect(prefs.setLang).toHaveBeenCalledWith("en");
    expect(prefs.refresh).toHaveBeenCalled();
  });

  it("elegir el idioma que ya está activo no hace nada", () => {
    render(<LandingPrefs labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "es" }));
    expect(prefs.setLang).not.toHaveBeenCalled();
    expect(prefs.refresh).not.toHaveBeenCalled();
  });

  it("el botón de tema alterna claro/oscuro con una etiqueta que dice a qué cambia", () => {
    const { rerender } = render(<LandingPrefs labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar a modo oscuro" }));
    expect(prefs.setTheme).toHaveBeenCalledWith("dark");
    prefs.theme = "dark";
    rerender(<LandingPrefs labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar a modo claro" }));
    expect(prefs.setTheme).toHaveBeenCalledWith("light");
  });
});

describe("Gallery", () => {
  const images = [1, 2, 3].map((i) => ({ id: `m${i}`, width: 1200, height: 800, alt: `Foto ${i}` }));
  const g = { photoOf: "Foto {i} de {n}", prev: "Foto anterior", next: "Foto siguiente" };

  it("muestra las fotos y un contador", () => {
    render(<Gallery images={images} labels={g} />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText("Foto 1 de 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Foto siguiente" })).toBeInTheDocument();
  });

  it("con una sola foto no muestra contador ni flechas", () => {
    render(<Gallery images={images.slice(0, 1)} labels={g} />);
    expect(screen.queryByText(/Foto 1 de/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Foto siguiente" })).not.toBeInTheDocument();
  });
});
