import { expect, it } from "vitest";
import { agentDisplayName } from "./identities";
import { PRIVATE_MARK_CONFIG, pilotConfigHash } from "../pilot/definition";
it("aliases the historical pilot name without rewriting immutable configuration or custom names", () => {
  const before = pilotConfigHash(PRIVATE_MARK_CONFIG);
  expect(agentDisplayName("mark", "Mark")).toBe("Lía");
  expect(agentDisplayName("mark", "Mi asistente")).toBe("Mi asistente");
  expect(agentDisplayName("legacy-assistant", "Mark")).toBe("Mark");
  expect(PRIVATE_MARK_CONFIG.publicName).toBe("Mark"); expect(pilotConfigHash(PRIVATE_MARK_CONFIG)).toBe(before);
});
