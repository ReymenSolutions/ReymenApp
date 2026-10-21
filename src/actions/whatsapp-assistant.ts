"use server";

import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
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

/** Edits the existing number only; it never connects an account or overwrites the public name. */
export async function updateAssistantPhoneNumber(phoneNumber: string) {
  const session = await requireAiManager();
  if (!(await prisma.organization.findFirst({ where: { id: session.user.organizationId, isActive: true }, select: { id: true } }))) throw new UserError("Organización inactiva");
  const phone = z.string().max(80).parse(phoneNumber);
  await withLegacyIdentityWrite(session.user.organizationId, tx => tx.whatsAppAssistant.upsert({
    where: { organizationId: session.user.organizationId },
    create: { organizationId: session.user.organizationId, phoneNumber: phone, capabilities: [] },
    update: { phoneNumber: phone },
  }));
  revalidatePath("/portal/whatsapp");
  revalidatePath("/portal/ai-channels");
  return { success: true };
}
