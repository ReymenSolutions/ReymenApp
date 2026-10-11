import { describe, it, expect } from "vitest";
import type { Customer } from "@prisma/client";
import { evaluateContactPolicy, inQuietHours, localHour } from "./policy";

const customer = (extra: Partial<Customer> = {}) => ({ id: "c1", consentAccepted: true, ...extra }) as Customer;
const rules = { channel: "whatsapp" as const, cooldownDays: 30, quietHours: { start: 21, end: 9 } };
// 15:00 en Ciudad de México (UTC-6, sin horario de verano).
const noon = new Date("2026-10-06T21:00:00Z");
const base = { rules, now: noon, timezone: "America/Mexico_City", lastContactAt: null };

describe("política de contacto", () => {
  it("contacta a quien dio consentimiento", () => {
    expect(evaluateContactPolicy({ ...base, customer: customer() })).toEqual({ ok: true });
  });
  it("sin cliente o sin consentimiento no contacta", () => {
    expect(evaluateContactPolicy({ ...base, customer: null })).toEqual({ ok: false, reason: "no_customer" });
    expect(evaluateContactPolicy({ ...base, customer: customer({ consentAccepted: false }) })).toEqual({ ok: false, reason: "no_consent" });
  });
  it("respeta el enfriamiento", () => {
    const days = (n: number) => new Date(noon.getTime() - n * 86_400_000);
    expect(evaluateContactPolicy({ ...base, customer: customer(), lastContactAt: days(10) })).toEqual({ ok: false, reason: "cooldown" });
    expect(evaluateContactPolicy({ ...base, customer: customer(), lastContactAt: days(31) })).toEqual({ ok: true });
  });
  it("respeta las horas de silencio en la zona horaria del negocio", () => {
    // 04:00Z = 22:00 en CDMX → silencio; 21:00Z = 15:00 → permitido.
    expect(evaluateContactPolicy({ ...base, customer: customer(), now: new Date("2026-10-07T04:00:00Z") })).toEqual({ ok: false, reason: "quiet_hours" });
    expect(localHour(new Date("2026-10-07T04:00:00Z"), "America/Mexico_City")).toBe(22);
  });
  it("inQuietHours maneja ventanas que cruzan la medianoche y las normales", () => {
    expect([8, 9, 20, 21, 23, 0].map((h) => inQuietHours(h, { start: 21, end: 9 }))).toEqual([true, false, false, true, true, true]);
    expect([12, 13, 14].map((h) => inQuietHours(h, { start: 13, end: 14 }))).toEqual([false, true, false]);
    expect(inQuietHours(5, { start: 7, end: 7 })).toBe(false);
  });
});
