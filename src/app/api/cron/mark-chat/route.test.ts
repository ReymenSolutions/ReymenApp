// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ enabled: vi.fn(), recover: vi.fn() }));
vi.mock("@/lib/ai/pilot/chat", () => ({ privateChatEnabled: mocks.enabled, recoverPrivateChatJobs: mocks.recover }));
import { POST } from "./route";
const request = (authorization?: string) => new NextRequest("http://localhost/api/cron/mark-chat", { method: "POST", headers: authorization ? { authorization } : {} });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("fails closed without staging or a matching secret", async () => {
  mocks.enabled.mockReturnValue(false); expect((await POST(request())).status).toBe(404);
  mocks.enabled.mockReturnValue(true); vi.stubEnv("CRON_SECRET", ""); expect((await POST(request("Bearer x"))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "synthetic-private-secret");
  for (const value of [undefined, "Bearer x", "Bearer synthetic-private-secrex", "synthetic-private-secret"]) expect((await POST(request(value))).status).toBe(401);
  expect(mocks.recover).not.toHaveBeenCalled();
});
it("recovers the dedicated private queue only when authorized", async () => {
  mocks.enabled.mockReturnValue(true); mocks.recover.mockResolvedValue({ processed: 2 }); vi.stubEnv("CRON_SECRET", "synthetic-private-secret");
  const response = await POST(request("Bearer synthetic-private-secret")); expect(response.status).toBe(200); expect(await response.json()).toEqual({ success: true, processed: 2 }); expect(mocks.recover).toHaveBeenCalledTimes(1);
});
