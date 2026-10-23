import { notFound } from "next/navigation";
import { privateChatEnabled } from "@/lib/ai/pilot/chat";
import { MarkChatVisitor } from "@/components/portal/ai-center/MarkChatVisitor";
export const metadata = { title: "Website Chat · piloto privado", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function MarkChatVisitorPage() {
  if (!privateChatEnabled()) notFound();
  return <main className="mx-auto w-full max-w-xl space-y-4 p-4"><h1 className="text-xl font-semibold">Chat privado de prueba</h1><p className="text-sm">Usa únicamente información ficticia. La forma de respuesta depende del modo seleccionado. Puedes pedir atención de una persona. El enlace caduca en una hora.</p><MarkChatVisitor /></main>;
}
