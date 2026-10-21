"use server";
import { z } from "zod";
import { requireAiManager } from "@/lib/guards";
import { sandboxInput, type SandboxInput } from "@/lib/ai/mark/contract";
import { admitMarkSandbox, executeMarkSandbox, cancelMarkSandbox, readMarkSandbox } from "@/lib/ai/mark/service";
const id = z.string().min(1).max(128);
export async function startMarkSandbox(input: SandboxInput, requestKey: string) {
  const s = await requireAiManager();
  return admitMarkSandbox(s.user.organizationId, s.user.id, z.string().uuid().parse(requestKey), sandboxInput.parse(input));
}
export async function runMarkSandboxPreview(runId: string, input: SandboxInput) {
  const s = await requireAiManager();
  return executeMarkSandbox(s.user.organizationId, s.user.id, id.parse(runId), sandboxInput.parse(input));
}
export async function getMarkSandbox(runId: string) {
  const s = await requireAiManager();
  return readMarkSandbox(s.user.organizationId, s.user.id, id.parse(runId));
}
export async function stopMarkSandbox(runId: string) {
  const s = await requireAiManager();
  return cancelMarkSandbox(s.user.organizationId, s.user.id, id.parse(runId));
}
