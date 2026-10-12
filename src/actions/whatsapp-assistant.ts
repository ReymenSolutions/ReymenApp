"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { UserError } from "@/lib/user-error";

const upsertSchema = z.object({
  name: z.string().min(1),
  phoneNumber: z.string().optional(),
});

export async function upsertWhatsAppAssistant(
  data: z.infer<typeof upsertSchema>
) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  await assertModuleEnabled(session.user.organizationId, "AI_WHATSAPP");

  const parsed = upsertSchema.parse(data);

  await prisma.whatsAppAssistant.upsert({
    where: { organizationId: session.user.organizationId },
    create: { organizationId: session.user.organizationId, ...parsed, capabilities: [] },
    update: parsed,
  });

  revalidatePath("/portal/whatsapp");
  return { success: true };
}
