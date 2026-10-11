// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const runAutomationTick = vi.fn();
vi.mock("@/lib/automation-tick", () => ({ runAutomationTick: (...a: unknown[]) => runAutomationTick(...a) }));

const { POST } = await import("./route");
const req = (auth?: string) => new NextRequest("http://localhost/api/cron/automations/tick", { method: "POST", headers: auth ? { authorization: auth } : {} });

describe("POST /api/cron/automations/tick", () => {
  beforeEach(() => runAutomationTick.mockReset());

  it("401 si CRON_SECRET no está configurado", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(req("Bearer x"))).status).toBe(401);
    expect(runAutomationTick).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("401 con token incorrecto o ausente", async () => {
    vi.stubEnv("CRON_SECRET", "ok");
    expect((await POST(req("Bearer mal"))).status).toBe(401);
    expect((await POST(req())).status).toBe(401);
    expect(runAutomationTick).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("con el token correcto corre el tick", async () => {
    vi.stubEnv("CRON_SECRET", "ok");
    runAutomationTick.mockResolvedValue({ ran: true, outbox: { processed: 2, failed: 0, retried: 0 }, purged: 0 });
    const res = await POST(req("Bearer ok"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, ran: true });
    vi.unstubAllEnvs();
  });
});
