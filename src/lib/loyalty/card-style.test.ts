import { describe, it, expect } from "vitest";
import { cardStyle, contrast, DEFAULT_CARD_ACCENT, DEFAULT_CARD_ICON } from "./card-style";

describe("cardStyle", () => {
  it("sin diseño usa los colores de siempre", () => {
    const s = cardStyle({});
    expect(s.accent).toBe(DEFAULT_CARD_ACCENT);
    expect(s.icon).toBe(DEFAULT_CARD_ICON);
    expect(s.text).toBe("#FFFFFF");
  });
  it("en una tarjeta clara el texto es oscuro y legible", () => {
    const s = cardStyle({ cardColor: "#FFF7ED", cardAccent: "#C2410C", cardIcon: "coffee" });
    expect(s.dark).toBe(false);
    expect(s.text).toBe("#111827");
    expect(contrast("#FFF7ED", s.text)).toBeGreaterThan(4.5);
    expect(s.icon).toBe("coffee");
  });
  it("el texto sobre el acento contrasta", () => {
    expect(cardStyle({ cardAccent: "#FACC15" }).onAccent).toBe("#111827");
    expect(cardStyle({ cardAccent: "#1E3A8A" }).onAccent).toBe("#FFFFFF");
  });
  it("ignora valores inválidos", () => {
    const s = cardStyle({ cardColor: "red", cardAccent: "#12", cardIcon: "bomba" });
    expect(s.accent).toBe(DEFAULT_CARD_ACCENT);
    expect(s.icon).toBe(DEFAULT_CARD_ICON);
  });
});
