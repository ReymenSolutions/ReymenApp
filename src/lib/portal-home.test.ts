import { describe, it, expect } from "vitest";
import { dayPartIn, firstNameOf, shortcutsFor } from "./portal-home";

describe("shortcutsFor", () => {
  it("shows only what the client has contracted, always keeping appointments, reports, help and account", () => {
    const keys = shortcutsFor([]).map((s) => s.key);
    expect(keys).toEqual(["appointments", "reports", "help", "settings"]);
  });

  it("adds each module's shortcuts, with daily tasks first and help/account last", () => {
    const keys = shortcutsFor(["FOOD_OPS", "AI_WHATSAPP", "CRM", "NFC_QR"]).map((s) => s.key);
    expect(keys.slice(0, 5)).toEqual(["sales", "operations", "inventory", "delivery", "messages"]);
    expect(keys.slice(-2)).toEqual(["help", "settings"]);
    expect(keys).toContain("clients");
    expect(keys).toContain("today");
    expect(keys).toContain("card");
    expect(keys).not.toContain("automations");
  });
});

describe("dayPartIn", () => {
  it("uses the business's hour, not the server's", () => {
    const instant = new Date("2026-10-05T15:00:00Z"); // 09:00 en CDMX, 00:00 (día siguiente) en Tokio
    expect(dayPartIn("America/Mexico_City", instant)).toBe("morning");
    expect(dayPartIn("Asia/Tokyo", instant)).toBe("morning");
    expect(dayPartIn("America/Mexico_City", new Date("2026-10-05T20:00:00Z"))).toBe("afternoon");
    expect(dayPartIn("America/Mexico_City", new Date("2026-10-06T02:00:00Z"))).toBe("evening");
  });

  it("falls back instead of failing on a bad timezone", () => {
    expect(["morning", "afternoon", "evening"]).toContain(dayPartIn("No/Existe"));
  });
});

describe("firstNameOf", () => {
  it("greets by first name only", () => {
    expect(firstNameOf("Ana María Pérez")).toBe("Ana");
    expect(firstNameOf("  Carlos ")).toBe("Carlos");
    expect(firstNameOf("Dr. Carlos Ramírez")).toBe("Carlos");
    expect(firstNameOf("Lic. Ana")).toBe("Ana");
    expect(firstNameOf("Dra.")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
  });
});
