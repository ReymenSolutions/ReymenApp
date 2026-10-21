import { z } from "zod";
export const MARK_PREVIEW = Object.freeze({ key: "mark", version: 1, fixtureVersion: "mark-fixtures-v1", maxSteps: 4, maxCalls: 2, maxTools: 2, maxHandoffs: 1, deadlineMs: 5000 });
export const markSandboxEnabled = () => process.env.AI_MARK_SANDBOX_ENABLED === "true";
export const sandboxInput = z.object({
  mode: z.literal("simulation"),
  question: z.string().trim().min(1).max(1000),
  channel: z.enum(["webchat", "whatsapp"]),
  permissions: z.object({ knowledge: z.boolean(), customer: z.boolean() }).strict(),
}).strict();
export type SandboxInput = z.infer<typeof sandboxInput>;
const request = z.discriminatedUnion("name", [
  z.object({ name: z.literal("knowledge.search"), input: z.object({ query: z.string().max(120) }).strict() }).strict(),
  z.object({ name: z.literal("customer.summary"), input: z.object({}).strict() }).strict(),
]);
export type ReadRequest = z.infer<typeof request>;
export const decision = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), requests: z.array(request).min(1).max(2) }).strict(),
  z.object({ action: z.literal("reply"), text: z.string().trim().min(1).max(800), sources: z.array(z.string().max(80)).max(8) }).strict(),
  z.object({ action: z.literal("handoff"), reason: z.enum(["human_requested", "insufficient_information"]) }).strict(),
]);
export type StopCode = "human_requested" | "insufficient_information" | "tool_denied" | "invalid_model_output" | "limit_reached" | "timeout" | "cancelled" | "authority_changed" | "provider_failed" | "unsafe_reply";
export type Step = { number: number; kind: "decision" | "read"; status: "ok" | "denied"; tool?: ReadRequest["name"]; sources?: string[]; code?: StopCode };
export type ReadResult = { sources: string[]; facts: string[] };
export type SandboxResult = {
  mode: "simulation"; outcome: "reply" | "handoff" | "cancelled"; reply?: string; reason?: StopCode;
  trace: Step[]; simulatedCalls: number; reads: number; elapsedMs: number; providerCalls: 0; externalEffects: 0;
  definitionVersion: number; fixtureVersion: string;
};
