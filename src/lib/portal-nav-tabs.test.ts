import { afterEach, describe, expect, it, vi } from "vitest";
import { strings } from "./i18n";
import { getAiWhatsappTabs } from "./portal-nav-tabs";
describe("Phase 2 AI navigation rollout", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("flag off preserves all existing URLs and labels", () => {
    vi.stubEnv("AI_AGENT_CENTER_UI_ENABLED", "false");
    expect(getAiWhatsappTabs(strings.es, "OWNER").map(t => t.href)).toEqual(["/portal/whatsapp", "/portal/knowledge-base", "/portal/ai-lab", "/portal/ai-usage"]);
    expect(getAiWhatsappTabs(strings.es, "OWNER")[0].label).toBe(strings.es.whatsapp);
  });
  it("flag on distinguishes assistant/channels and keeps privileged sections out of read-only roles", () => {
    vi.stubEnv("AI_AGENT_CENTER_UI_ENABLED", "true");
    const owner = getAiWhatsappTabs(strings.en, "OWNER", "en");
    expect(owner.map(t => t.label)).toEqual(["Overview", "My assistants", "Channels", "Knowledge", "Test", "Usage & results"]);
    const agent = getAiWhatsappTabs(strings.es, "AGENT", "es").map(t => t.href);
    expect(agent).not.toContain("/portal/ai-lab"); expect(agent).not.toContain("/portal/ai-usage");
  });
});
