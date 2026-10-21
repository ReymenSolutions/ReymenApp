import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { getServerLang } from "@/lib/i18n-server";
import { aiCenterUiEnabled } from "./center-ui";
export async function centerContext() {
  const session = await auth();
  if (!session?.user.organizationId) redirect("/login");
  await requireModule(session.user.organizationId, "AI_WHATSAPP");
  if (!aiCenterUiEnabled()) redirect("/portal/whatsapp");
  return { session, organizationId: session.user.organizationId, lang: await getServerLang() };
}
