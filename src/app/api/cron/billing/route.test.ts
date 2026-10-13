// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const runBillingNotices = vi.fn();
vi.mock("@/lib/billing-notices", () => ({ runBillingNotices: (...a: unknown[]) => runBillingNotices(...a) }));
const { POST } = await import("./route");
const req = (h?: string) => new NextRequest("http://localhost/api/cron/billing", { method: "POST", headers: h ? { authorization: h } : {} });

describe("POST /api/cron/billing", () => {
  beforeEach(() => { runBillingNotices.mockReset(); vi.unstubAllEnvs(); });

  it("falla cerrado sin CRON_SECRET y con credencial incorrecta", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(req("Bearer x"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer nope"))).status).toBe(401);
    expect(runBillingNotices).not.toHaveBeenCalled();
  });

  it("con la credencial correcta corre los avisos", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    runBillingNotices.mockResolvedValue({ checked: 2, sent: 1 });
    const res = await POST(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, checked: 2, sent: 1 });
  });
});
