import { describe, it, expect } from "vitest";
import { dayKey, dayKeyFromString, daysAgoKey, daysAgoStart, localDateString, localHour, startOfLocalDay } from "./business-day";

const MX = "America/Mexico_City"; // UTC-6 todo el año desde 2022
const TOKYO = "Asia/Tokyo"; // UTC+9

describe("día de negocio por zona horaria", () => {
  it("una venta a las 8 pm de México (02:00 UTC del día siguiente) cuenta para el día de México", () => {
    const sale = new Date("2026-10-14T02:00:00Z");
    expect(localDateString(sale, MX)).toBe("2026-10-13");
    expect(localHour(sale, MX)).toBe(20);
    expect(dayKey(sale, MX).toISOString()).toBe("2026-10-13T00:00:00.000Z");
    // En la zona de otra organización (Tokio) el mismo instante es del 14.
    expect(localDateString(sale, TOKYO)).toBe("2026-10-14");
  });

  it("la medianoche local es el límite de 'hoy'", () => {
    const now = new Date("2026-10-14T02:00:00Z"); // 20:00 del 13 en México
    expect(startOfLocalDay(now, MX).toISOString()).toBe("2026-10-13T06:00:00.000Z");
    expect(daysAgoStart(1, MX, now).toISOString()).toBe("2026-10-12T06:00:00.000Z");
    expect(startOfLocalDay(now, TOKYO).toISOString()).toBe("2026-10-13T15:00:00.000Z");
  });

  it("respeta los cambios de horario de una zona con DST", () => {
    const NY = "America/New_York";
    // 3 de noviembre de 2026: termina el horario de verano (UTC-4 → UTC-5).
    expect(startOfLocalDay(new Date("2026-11-03T12:00:00Z"), NY).toISOString()).toBe("2026-11-03T05:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-11-01T12:00:00Z"), NY).toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("las claves de día son la fecha local a las 00:00 UTC y coinciden con las capturadas a mano", () => {
    expect(dayKeyFromString("2026-10-13").toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(daysAgoKey(2, MX, new Date("2026-10-14T02:00:00Z")).toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(() => dayKeyFromString("2026-02-31")).toThrow(/inválida/);
  });
});
