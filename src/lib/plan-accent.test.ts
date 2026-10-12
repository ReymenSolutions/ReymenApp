import { describe, it, expect } from "vitest";
import { ACCENT_TONES, PLAN_ACCENTS, accentTone } from "./plan-accent";

describe("colores de los planes", () => {
  it("cada color tiene todas sus clases (completas, para que Tailwind las incluya) y un valor desconocido cae en gris", () => {
    for (const a of PLAN_ACCENTS) {
      const t = ACCENT_TONES[a];
      expect(t.card).toMatch(new RegExp(`border-t-${a}-300`));
      expect(t.badge).toMatch(new RegExp(`bg-${a}-100 text-${a}-700`));
      expect(t.label.es && t.label.en).toBeTruthy();
    }
    expect(accentTone("nope")).toBe(ACCENT_TONES.slate);
    expect(accentTone(null)).toBe(ACCENT_TONES.slate);
    expect(accentTone("amber")).toBe(ACCENT_TONES.amber);
  });
});
