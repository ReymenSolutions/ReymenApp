import { describe, it, expect } from "vitest";
import { DECISION_CATEGORIES, INTEGRATION_CATEGORIES, blueprintsCovering, isDecisionCategory } from "./coverage";

describe("qué va en un blueprint y qué se queda en n8n", () => {
  it("toda categoría de decisión tiene al menos un blueprint equivalente", () => {
    for (const c of DECISION_CATEGORIES) expect(blueprintsCovering(c).length, c).toBeGreaterThan(0);
  });

  it("las categorías de integración no tienen blueprint y no son de decisión", () => {
    for (const c of INTEGRATION_CATEGORIES) {
      expect(blueprintsCovering(c)).toEqual([]);
      expect(isDecisionCategory(c)).toBe(false);
    }
  });

  it("retención queda cubierta por segunda visita, recuperación y cumpleaños", () => {
    expect(blueprintsCovering("retention").map((b) => b.key).sort()).toEqual(["birthday_campaign", "customer_recovery", "second_visit"]);
  });
});
