"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guards";
import { assertPilotAdminStaging, preparePrivateMark } from "@/lib/ai/pilot/admin";
import { configurePilotBudget } from "@/lib/ai/pilot/budget";
import { closePilotRoot, pilotReconciliationEvidence, reconcilePilotCall } from "@/lib/ai/pilot/gateway";

const id = z.string().min(1).max(128);
async function admin() { assertPilotAdminStaging(); return requireAdmin(); }
export async function preparePrivateMarkAction(raw: { organizationId: string }) {
  const session = await admin();
  const input = z.object({ organizationId: id }).strict().parse(raw);
  const result = await preparePrivateMark(input.organizationId, session.user.id);
  revalidatePath("/admin/ai-pilot");
  return result;
}
export async function pausePrivateMarkAction(raw: { organizationId: string; version: number }) {
  const session = await admin();
  const input = z.object({ organizationId: id, version: z.number().int().positive() }).strict().parse(raw);
  await configurePilotBudget(input.organizationId, session.user.id, false, input.version);
  revalidatePath("/admin/ai-pilot");
}
export async function closePrivateMarkRootAction(raw: { organizationId: string; rootId: string }) {
  const session = await admin();
  const input = z.object({ organizationId: id, rootId: id }).strict().parse(raw);
  await closePilotRoot(input.organizationId, session.user.id, input.rootId, true);
  revalidatePath("/admin/ai-pilot");
}
export async function reconcilePrivateMarkAction(raw: { organizationId: string; usageId: string; confirmEvidence: boolean; evidence: z.infer<typeof pilotReconciliationEvidence> }) {
  const session = await admin();
  const input = z.object({ organizationId: id, usageId: id, confirmEvidence: z.literal(true), evidence: pilotReconciliationEvidence }).strict().parse(raw);
  await reconcilePilotCall(input.organizationId, session.user.id, input.usageId, input.evidence);
  revalidatePath("/admin/ai-pilot");
}
