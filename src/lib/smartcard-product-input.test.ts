import { describe, expect, it } from "vitest";
import { characteristicsToSubtitle, cleanCharacteristics, subtitleToCharacteristics } from "./smartcard-product-input";

describe("smartcard-product-input", () => {
  it("limpia, recorta y limita las características", () => {
    expect(cleanCharacteristics([" 30 ml ", "", "  Vitamina   C", "a", "b", "c", "d", "e"])).toEqual(["30 ml", "Vitamina C", "a", "b", "c", "d"]);
  });
  it("las une con « · » y respeta el límite de la columna", () => {
    expect(characteristicsToSubtitle(["30 ml", "Vitamina C"])).toBe("30 ml · Vitamina C");
    expect(characteristicsToSubtitle([])).toBeNull();
    const long = Array.from({ length: 6 }, (_, i) => `${i}`.repeat(40));
    expect(characteristicsToSubtitle(long)!.length).toBeLessThanOrEqual(140);
  });
  it("ida y vuelta", () => {
    expect(subtitleToCharacteristics("30 ml · Vitamina C")).toEqual(["30 ml", "Vitamina C"]);
    expect(subtitleToCharacteristics(null)).toEqual([]);
  });
});
