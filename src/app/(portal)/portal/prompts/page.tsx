import { redirect } from "next/navigation";

// Los prompts se unificaron en el Rulebook y la base de conocimiento (el Agente IA tiene una sola fuente).
export default function PromptsRedirect() {
  redirect("/portal/knowledge-base");
}
