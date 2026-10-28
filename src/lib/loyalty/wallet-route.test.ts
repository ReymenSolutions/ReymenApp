// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("./wallet-data", () => ({ getWalletPassDataByToken: vi.fn() }));
vi.mock("./wallet-google", async (orig) => ({ ...(await orig<typeof import("./wallet-google")>()), googleWalletConfig: vi.fn(), upsertGoogleObjects: vi.fn() }));

import { checkRateLimit } from "@/lib/rate-limit";
import { getWalletPassDataByToken } from "./wallet-data";
import { googleWalletConfig, upsertGoogleObjects } from "./wallet-google";
import { appleWalletResponse, googleWalletResponse } from "./wallet-route";

const params = { slug: "taller-wolf", token: "ABCDEFGHIJKLMNOPQRSTUVWX" };
const cfg = { issuerId: "3388000000012345678", clientEmail: "w@x.iam.gserviceaccount.com", privateKey: "k" };

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.reymen.mx";
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
});
afterEach(() => vi.clearAllMocks());

describe("wallet buttons send the customer back to the card when something fails", () => {
  it("Google not configured → card with ?wallet=not_configured", async () => {
    vi.mocked(googleWalletConfig).mockReturnValue(null);
    const res = await googleWalletResponse(params);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://app.reymen.mx/lealtad/taller-wolf/tarjeta/ABCDEFGHIJKLMNOPQRSTUVWX?wallet=not_configured");
  });

  it("Google API error → card with ?wallet=unavailable (no JSON, no download)", async () => {
    vi.mocked(googleWalletConfig).mockReturnValue(cfg);
    vi.mocked(getWalletPassDataByToken).mockResolvedValue({ memberId: "m1", programId: "p1" } as never);
    vi.mocked(upsertGoogleObjects).mockRejectedValue(new Error("google_class_403: API disabled"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await googleWalletResponse(params);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/tarjeta\/ABCDEFGHIJKLMNOPQRSTUVWX\?wallet=unavailable$/);
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it("too many attempts → card with ?wallet=limited", async () => {
    vi.mocked(googleWalletConfig).mockReturnValue(cfg);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false } as never);
    const res = await googleWalletResponse(params);
    expect(res.headers.get("location")).toMatch(/\?wallet=limited$/);
  });

  it("Apple not configured → card with ?wallet=not_configured", async () => {
    for (const k of ["APPLE_WALLET_PASS_TYPE_ID", "APPLE_WALLET_TEAM_ID", "APPLE_WALLET_CERT_P12_BASE64", "APPLE_WALLET_WWDR_PEM_BASE64"]) delete process.env[k];
    const res = await appleWalletResponse(params);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\?wallet=not_configured$/);
  });

  it("an unknown card still answers 404", async () => {
    vi.mocked(googleWalletConfig).mockReturnValue(cfg);
    vi.mocked(getWalletPassDataByToken).mockResolvedValue(null);
    const res = await googleWalletResponse(params);
    expect(res.status).toBe(404);
  });
});
