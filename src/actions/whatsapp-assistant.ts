"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withLegacyIdentityWrite } from "@/lib/ai/agents/model";
import { requireAiManager } from "@/lib/guards";

const upsertSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().optional(),
});

export async function upsertWhatsAppAssistant(
  data: z.infer<typeof upsertSchema>
) {
  const session = await requireAiManager();

  const parsed = upsertSchema.parse(data);

  await withLegacyIdentityWrite(session.user.organizationId, tx => tx.whatsAppAssistant.upsert({
    where: { organizationId: session.user.organizationId },
    create: { organizationId: session.user.organizationId, ...parsed, capabilities: [] },
    update: parsed,
  }));

  revalidatePath("/portal/whatsapp");
  return { success: true };
}
