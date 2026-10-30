// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

describe("bounded collection validation", () => {
  it("rejects oversized arrays before evaluating their elements", () => {
    const inspect = vi.fn(() => true);
    const schema = z.array(z.string().refine(inspect)).max(2);
    expect(schema.safeParse(["one", "two", "three"]).success).toBe(false);
    expect(inspect).not.toHaveBeenCalled();
    expect(schema.safeParse(["one", "two"]).success).toBe(true);
    expect(inspect).toHaveBeenCalledTimes(2);
  });
});
