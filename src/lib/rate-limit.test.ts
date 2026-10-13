// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  const key = `test:${Math.random().toString(36).slice(2)}`;

  beforeEach(async () => {
    await prisma.rateLimitHit.deleteMany({ where: { key } });
  });

  it("allows attempts under the limit", async () => {
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(key, { limit: 3, windowMs: 60_000 });
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the attempt once the limit is reached", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    }
    const blocked = await checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate counters per key", async () => {
    const otherKey = `${key}:other`;
    for (let i = 0; i < 3; i++) await checkRateLimit(key, { limit: 3, windowMs: 60_000 });

    const otherResult = await checkRateLimit(otherKey, { limit: 3, windowMs: 60_000 });
    expect(otherResult.allowed).toBe(true);

    await prisma.rateLimitHit.deleteMany({ where: { key: otherKey } });
  });

  it("allows again once the window has fully expired", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect((await checkRateLimit(key, { limit: 3, windowMs: 60_000 })).allowed).toBe(false);

    // Simulate the window having passed by backdating existing hits.
    await prisma.rateLimitHit.updateMany({
      where: { key },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });

    const result = await checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
  });

  it("AUD-013: peticiones simultáneas no se cuelan por encima del límite", async () => {
    const key = `rl-concurrent-${Date.now()}`;
    const results = await Promise.all(Array.from({ length: 12 }, () => checkRateLimit(key, { limit: 5, windowMs: 60_000 })));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.filter((r) => !r.allowed)).toHaveLength(7);
    await prisma.rateLimitHit.deleteMany({ where: { key } });
  });
});
