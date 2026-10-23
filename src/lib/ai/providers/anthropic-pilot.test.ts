// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), options: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: mocks.create }; constructor(options: unknown) { mocks.options(options); } } }));
import { callAnthropicPilot } from "./anthropic-pilot";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("uses a dedicated key, explicit model and one bounded attempt without caching, beta fallback or automatic retries", async () => {
  vi.stubEnv("AI_MARK_PILOT_ANTHROPIC_API_KEY", "pilot-fixture-key");
  mocks.create.mockResolvedValue({ id: "msg_fixture", model: "explicit-fixture", stop_reason: "end_turn", content: [{ type: "text", text: "Fixture" }], usage: { input_tokens: 10, output_tokens: 2 } });
  await expect(callAnthropicPilot({ system: "s", messages: [{ role: "user", content: "q" }], model: "explicit-fixture", maxOutputTokens: 64 })).resolves.toMatchObject({ text: "Fixture", externalId: "msg_fixture" });
  expect(mocks.options).toHaveBeenCalledWith({ apiKey: "pilot-fixture-key", baseURL: "https://api.anthropic.com", maxRetries: 0, timeout: 5000, logLevel: "off" });
  expect(mocks.create).toHaveBeenCalledWith({ system: "s", messages: [{ role: "user", content: "q" }], model: "explicit-fixture", max_tokens: 64, stream: false });
});
it("never borrows the commercial key when the pilot key is absent", async () => {
  vi.stubEnv("AI_MARK_PILOT_ANTHROPIC_API_KEY", ""); vi.stubEnv("ANTHROPIC_API_KEY", "commercial-fixture");
  await expect(callAnthropicPilot({ system: "s", messages: [{ role: "user", content: "q" }], model: "m", maxOutputTokens: 1 })).rejects.toThrow(/not_configured/);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("allows only the fixed internal proxy in staging and rejects arbitrary proxy URLs", async () => {
  vi.stubEnv("AI_MARK_PILOT_ANTHROPIC_API_KEY", "pilot-fixture-key");
  vi.stubEnv("REYMEN_STAGING", "true"); vi.stubEnv("AI_MARK_PILOT_PROXY_URL", "http://ingress:8081");
  mocks.create.mockResolvedValue({ id: "msg_fixture", model: "m", stop_reason: "end_turn", content: [], usage: { input_tokens: 1, output_tokens: 1 } });
  const input = { system: "s", messages: [{ role: "user" as const, content: "q" }], model: "m", maxOutputTokens: 1 };
  await callAnthropicPilot(input);
  expect(mocks.options).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "http://ingress:8081", maxRetries: 0 }));
  mocks.create.mockClear(); vi.stubEnv("AI_MARK_PILOT_PROXY_URL", "http://arbitrary-host");
  await expect(callAnthropicPilot(input)).rejects.toThrow(/proxy_invalid/);
  vi.stubEnv("AI_MARK_PILOT_PROXY_URL", "http://ingress:8081"); vi.stubEnv("REYMEN_STAGING", "false");
  await expect(callAnthropicPilot(input)).rejects.toThrow(/proxy_invalid/);
  expect(mocks.create).not.toHaveBeenCalled();
});
