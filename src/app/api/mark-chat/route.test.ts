// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ enabled: vi.fn(), limit: vi.fn(), read: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.limit }));
vi.mock("@/lib/ai/pilot/chat", () => ({ privateChatEnabled: mocks.enabled, readPrivateVisitor: mocks.read, postPrivateVisitor: mocks.post }));
import { GET, POST } from "./route";
const key = "A".repeat(43);
function request(body?: string, auth = `Bearer ${key}`) { return new NextRequest("http://localhost/api/mark-chat", { method: body === undefined ? "GET" : "POST", headers: { authorization: auth, "content-type": "application/json" }, ...(body === undefined ? {} : { body }) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.enabled.mockReturnValue(true); mocks.limit.mockResolvedValue({ allowed: true }); mocks.read.mockResolvedValue({ messages: [] }); mocks.post.mockResolvedValue({ id: "synthetic" }); });
it("fails closed before reading messages if disabled or missing a bearer capability", async () => {
  mocks.enabled.mockReturnValue(false); expect((await GET(request())).status).toBe(404);
  mocks.enabled.mockReturnValue(true); expect((await GET(request(undefined, ""))).status).toBe(404);
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled();
});
it("never caches private visitor data and rate limits a hash rather than the capability", async () => {
  const result = await GET(request()); expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("no-store"); expect(result.headers.get("referrer-policy")).toBe("no-referrer");
  expect(mocks.read).toHaveBeenCalledWith(key); expect(mocks.limit.mock.calls[0][0]).not.toContain(key);
  mocks.limit.mockResolvedValue({ allowed: false }); expect((await GET(request())).status).toBe(429); expect(mocks.read).toHaveBeenCalledTimes(1);
});
it("bounds request bodies even without Content-Length and never echoes internal errors", async () => {
  expect((await POST(request(JSON.stringify({ content: "x".repeat(5000) })))).status).toBe(404); expect(mocks.post).not.toHaveBeenCalled();
  mocks.post.mockRejectedValue(new Error("database-secret-details")); const result = await POST(request(JSON.stringify({ requestKey: "example", content: "hola" })));
  expect(result.status).toBe(404); expect(await result.text()).not.toContain("database-secret-details");
});
