// Internal work only. The signed channel webhooks and their payloads stay unchanged.
export const AUTO_JOB_SOURCE = "ai-center";
export const AUTO_JOB_TYPE = "ai.auto_reply";
export const AUTO_JOB_MAX_ATTEMPTS = 3;
export const AUTO_JOB_LEASE_MS = 10 * 60_000;

export type AutoJobPayload = {
  conversationId: string;
  messageId: string;
  stage: "queued" | "generating" | "dispatching";
  draftId?: string;
  outboundMessageId?: string;
};

export const PIPELINE_JOB_TYPE = "ai.pipeline";
