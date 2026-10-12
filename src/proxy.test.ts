// @vitest-environment node
import { describe, it, expect } from "vitest";
import { vi } from "vitest";

// The real NextAuth wrapper reads/verifies the session JWT cookie before
// calling our handler — irrelevant to what this test checks (path
// classification), so it's replaced with a passthrough that just forwards
// the request, with `req.auth` standing in for the resolved session.
vi.mock("next-auth", () => ({
  default: () => ({ auth: (handler: (req: unknown) => unknown) => handler }),
}));
vi.mock("@/lib/auth.config", () => ({ authConfig: {} }));

const { default: middleware } = await import("./proxy");

function makeReq(pathname: string, session: unknown = null) {
  return {
    nextUrl: { pathname },
    url: `http://localhost${pathname}`,
    auth: session,
    cookies: { get: () => undefined },
  } as never;
}

describe("middleware", () => {
  it("CRITICAL: does not redirect /api/v1/* pull routes even with no session (n8n authenticates itself via X-Api-Key)", async () => {
    const res = (await middleware(makeReq("/api/v1/leads/due-followups"), {} as never)) as Response;
    expect(res.status).not.toBe(307);
  });

  it("does not redirect /api/webhooks/* even with no session", async () => {
    const res = (await middleware(makeReq("/api/webhooks/n8n/followup-sent"), {} as never)) as Response;
    expect(res.status).not.toBe(307);
  });

  it("still redirects /portal/* to /login when there is no session", async () => {
    const res = (await middleware(makeReq("/portal/leads"), {} as never)) as Response;
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("still redirects /admin/* to /login when there is no session", async () => {
    const res = (await middleware(makeReq("/admin/clients"), {} as never)) as Response;
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("lets the public loyalty enrollment and card pages through without a session", async () => {
    for (const path of ["/lealtad/cafe-norte-demo", "/lealtad/cafe-norte-demo/tarjeta/abcdefghijklmnopqrstuvwx"]) {
      const res = (await middleware(makeReq(path), {} as never)) as Response;
      expect(res.status).not.toBe(307);
    }
  });

  it("does not open look-alike paths: /lealtadx and the portal loyalty dashboard still need a session", async () => {
    for (const path of ["/lealtadx/algo", "/portal/food/loyalty"]) {
      const res = (await middleware(makeReq(path), {} as never)) as Response;
      expect(res.status).toBe(307);
    }
  });
});
