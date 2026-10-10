import { describe, it, expect } from "vitest";
import { phoneKey } from "./phone";

describe("phoneKey", () => {
  it("gives the same key for the same number in different formats", () => {
    const keys = ["+52 1 55 1234 5678", "5215512345678", "(55) 1234-5678", "55 1234 5678", "+52 55 1234 5678"].map(phoneKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("5512345678");
  });
  it("keeps different numbers apart", () => {
    expect(phoneKey("+52 55 1234 5678")).not.toBe(phoneKey("+52 55 1234 5679"));
  });
  it("returns null for empty or too-short numbers", () => {
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey("")).toBeNull();
    expect(phoneKey("12345")).toBeNull();
    expect(phoneKey("abc")).toBeNull();
  });
});
