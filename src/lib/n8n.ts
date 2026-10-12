import { createWebhookSignature } from "./webhook-validator";
import type { AutomationEnvelope } from "./automation/config-delivery";

const N8N_BASE_URL = process.env.N8N_BASE_URL ?? "http://localhost:5678";
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET ?? "";

export interface N8nTriggerPayload {
  organizationId: string;
  event: string;
  data: Record<string, unknown>;
  /** Cuando el evento es para una automatización concreta: quién es y su configuración (ver automation/config-delivery.ts). */
  automation?: AutomationEnvelope;
}

// webhookPath ends up in the request URL — restrict it to a safe path
// segment so a caller can't smuggle "../" or an absolute/protocol-relative
// URL into it and redirect the request off N8N_BASE_URL.
function isValidWebhookPath(webhookPath: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(webhookPath);
}

function signedRequestInit(payload: N8nTriggerPayload, timeoutMs: number): RequestInit & { body: string } {
  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();
  const signature = createWebhookSignature(body, N8N_WEBHOOK_SECRET, timestamp);

  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Reymen-Signature": signature,
      "X-Reymen-Timestamp": timestamp,
      "X-Reymen-Source": "platform",
    },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  };
}

export async function triggerN8nWorkflow(
  webhookPath: string,
  payload: N8nTriggerPayload
): Promise<{ success: boolean; error?: string }> {
  if (!isValidWebhookPath(webhookPath)) {
    return { success: false, error: "Invalid webhookPath" };
  }

  try {
    const res = await fetch(
      `${N8N_BASE_URL}/webhook/${webhookPath}`,
      // n8n being slow or unreachable must never hang the caller (e.g. a
      // user-facing "send message" Server Action) indefinitely.
      signedRequestInit(payload, 5_000)
    );

    if (!res.ok) {
      return { success: false, error: `n8n returned ${res.status}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export interface N8nSyncResult {
  success: boolean;
  reply?: string;
  // KnowledgeBase article ids the workflow reports it actually had available
  // while composing the reply — echoed straight from what the platform sent
  // (see `runAiLabInference` in src/lib/ai-lab.ts), never invented here.
  knowledgeBaseContext?: string[];
  error?: string;
}

// Unlike triggerN8nWorkflow (fire-and-forget: the platform doesn't wait for
// or need n8n's answer), the AI Lab (Fase 7) needs the actual generated
// reply back to show it in the sandbox/test-case/experiment UI. This still
// follows the same n8n-invisibility principle — the platform never calls an
// LLM provider directly, it only asks the org's own n8n workflow to do it
// and waits synchronously for that workflow's response. The n8n webhook
// node must be configured with "Respond" set to "Using 'Respond to Webhook'
// Node" (not "Immediately") so the HTTP response carries the real reply.
export async function triggerN8nWorkflowSync(
  webhookPath: string,
  payload: N8nTriggerPayload,
  timeoutMs = 20_000
): Promise<N8nSyncResult> {
  if (!isValidWebhookPath(webhookPath)) {
    return { success: false, error: "Invalid webhookPath" };
  }

  try {
    const res = await fetch(`${N8N_BASE_URL}/webhook/${webhookPath}`, signedRequestInit(payload, timeoutMs));

    if (!res.ok) {
      return { success: false, error: `n8n returned ${res.status}` };
    }

    const data: unknown = await res.json();
    const reply = (data as { reply?: unknown })?.reply;
    if (typeof reply !== "string" || reply.trim() === "") {
      return { success: false, error: "La respuesta de n8n no incluyó un 'reply' válido." };
    }

    const rawContext = (data as { knowledgeBaseContext?: unknown })?.knowledgeBaseContext;
    const knowledgeBaseContext = Array.isArray(rawContext)
      ? rawContext.filter((id): id is string => typeof id === "string")
      : undefined;

    return { success: true, reply, knowledgeBaseContext };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
