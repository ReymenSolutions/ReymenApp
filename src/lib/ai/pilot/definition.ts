import { createHash } from "node:crypto";

/** Private evaluation metadata only; not a registered commercial runtime or channel route. */
export const PRIVATE_MARK_DEFINITION = {
  key: "mark", version: 1, displayName: "Mark · private pilot", specialty: "private-customer-support",
  manifest: {
    schemaVersion: 1, runtime: "private-review-pilot", mode: "review_only",
    tools: ["knowledge.search"], effects: [], provider: "anthropic",
    maxCalls: 2, maxOutputTokens: 512, customerReadsEnabled: false,
  },
};
export const PRIVATE_MARK_CONFIG = {
  mode: "review_only", provider: "anthropic", publicName: "Mark",
  customerReadsEnabled: false, channelDeliveryEnabled: false,
  limits: { dailyMxn: 25, monthlyMxn: 500, rootMxn: 1, maxCalls: 2 },
};
export function pilotConfigHash(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
    : item !== null && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : item;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
