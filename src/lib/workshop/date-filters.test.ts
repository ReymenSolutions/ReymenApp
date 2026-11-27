import { describe, expect, it } from "vitest";
import { workshopDateFilter } from "./date-filters";

describe("workshop calendar filters", () => {
  it("includes the full requested day in the organization's timezone, including older years", () => {
    const range = workshopDateFilter("2021-03-01", "2021-03-31", "America/Mexico_City");
    expect(range.gte?.toISOString()).toBe("2021-03-01T06:00:00.000Z");
    expect(range.lt?.toISOString()).toBe("2021-04-01T06:00:00.000Z");
  });
  it("ignores invalid or inverted ranges", () => {
    expect(workshopDateFilter("2026-02-30", "invalid", "America/Mexico_City")).toEqual({});
    expect(workshopDateFilter("2026-12-01", "2026-01-01", "America/Mexico_City")).toEqual({});
  });
});
