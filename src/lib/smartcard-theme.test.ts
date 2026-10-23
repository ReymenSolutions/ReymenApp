import { describe, expect, it } from "vitest";
import { resolveCardTokens } from "./smartcard-theme";

describe("resolveCardTokens", () => {
  const realEstate = { layout: "real_estate", primary_color: "#1B4332", accent_color: "#D4A373", background: "light" };
  it("sin ajustes del perfil usa los colores del tema", () => {
    expect(resolveCardTokens(realEstate)).toEqual({ primary: "#1B4332", accent: "#D4A373", dark: false });
  });
  it("los colores válidos del perfil ganan campo por campo; los inválidos se ignoran", () => {
    expect(resolveCardTokens(realEstate, "#112233", null)).toEqual({ primary: "#112233", accent: "#D4A373", dark: false });
    expect(resolveCardTokens(realEstate, "rojo", "#FFCC00").primary).toBe("#1B4332");
  });
  it("tema oscuro y sin tema", () => {
    expect(resolveCardTokens({ background: "dark" }).dark).toBe(true);
    expect(resolveCardTokens(null).primary).toBe("#111111");
  });
});
