"use server";
import { requireAiManager, requireAdmin } from "@/lib/guards";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assignPrivatePilotSource, privateReviewInput, runPrivateMarkReview, getPrivateReviewSetup } from "@/lib/ai/pilot/review";
import { assertPilotAdminStaging } from "@/lib/ai/pilot/admin";
import { configurePilotBudget } from "@/lib/ai/pilot/budget";
export async function testPrivateMark(raw: z.infer<typeof privateReviewInput>) {
  const s = await requireAiManager();
  return runPrivateMarkReview(s.user.organizationId, s.user.id, raw);
}
export async function assignPrivateMarkSource(raw: { organizationId: string; articleId: string; version: number; policyVersion: number }) {
  assertPilotAdminStaging(); const s = await requireAdmin();
  const input = z.object({ organizationId: z.string().min(1).max(128), articleId: z.string().min(1).max(128), version: z.number().int().positive(), policyVersion: z.number().int().nonnegative() }).strict().parse(raw);
  await assignPrivatePilotSource(input.organizationId, s.user.id, { articleId: input.articleId, version: input.version, policyVersion: input.policyVersion });
  revalidatePath("/admin/ai-pilot");
}
export async function enablePrivateMarkReview(raw: { organizationId: string; policyVersion: number; confirmCost: boolean }) {
  assertPilotAdminStaging(); const s = await requireAdmin();
  const input = z.object({ organizationId: z.string().min(1).max(128), policyVersion: z.number().int().positive(), confirmCost: z.literal(true) }).strict().parse(raw);
  const setup = await getPrivateReviewSetup(input.organizationId, s.user.id);
  if (!setup.ready) throw new Error("pilot_setup_incomplete");
  await configurePilotBudget(input.organizationId, s.user.id, true, input.policyVersion);
  revalidatePath("/admin/ai-pilot");
}
