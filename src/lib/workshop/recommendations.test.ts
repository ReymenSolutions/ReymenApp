import { describe, expect, it } from "vitest";
import { vehicleRecommendations } from "./recommendations";

describe("vehicleRecommendations", () => {
  it("uses the delivered service date for the six-month review", () => {
    const rows = vehicleRecommendations({ lastDeliveredAt: new Date("2026-01-15T12:00:00Z"), nextServiceDate: null, nextServiceKm: null, currentKm: 12000, now: new Date("2026-07-16T00:00:00Z") });
    expect(rows).toEqual([{ kind: "general_review", due: true, date: new Date("2026-07-15T12:00:00Z") }]);
  });

  it("does not invent oil or battery work and respects the recorded mileage", () => {
    const rows = vehicleRecommendations({ lastDeliveredAt: null, nextServiceDate: null, nextServiceKm: 15000, currentKm: 14999, now: new Date("2026-07-16") });
    expect(rows).toEqual([{ kind: "next_service_km", due: false, km: 15000 }]);
    expect(vehicleRecommendations({ lastDeliveredAt: null, nextServiceDate: null, nextServiceKm: null, currentKm: null, now: new Date() })).toEqual([]);
  });

  it("clamps the calendar day when six months later has fewer days", () => {
    const rows = vehicleRecommendations({ lastDeliveredAt: new Date("2026-08-31T00:00:00Z"), nextServiceDate: null, nextServiceKm: null, currentKm: null, now: new Date("2027-02-27T00:00:00Z") });
    expect(rows[0].date?.toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(rows[0].due).toBe(false);
  });
});
