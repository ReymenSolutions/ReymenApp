import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";

const prefs = vi.hoisted(() => ({ lang: "es" as "es" | "en" }));
vi.mock("@/context/preferences", () => ({ usePreferences: () => ({ lang: prefs.lang }) }));

import { PasswordInput } from "./password-input";

afterEach(() => {
  cleanup();
  prefs.lang = "es";
});

describe("PasswordInput", () => {
  it("oculta la contraseña y el ojo la muestra y la vuelve a ocultar", () => {
    render(<PasswordInput aria-label="Contraseña" defaultValue="secreto123" />);
    const input = screen.getByLabelText("Contraseña");
    expect(input).toHaveAttribute("type", "password");
    const eye = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(eye).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(eye);
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("secreto123");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("el botón no envía el formulario y habla el idioma activo", () => {
    prefs.lang = "en";
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput aria-label="Password" />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });

  it("reenvía la ref (react-hook-form) y respeta disabled", () => {
    const ref = createRef<HTMLInputElement>();
    render(<PasswordInput ref={ref} aria-label="Contraseña" disabled />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole("button", { name: "Mostrar contraseña" })).toBeDisabled();
  });
});
