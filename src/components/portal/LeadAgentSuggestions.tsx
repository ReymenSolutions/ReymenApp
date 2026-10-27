"use client";

import { useRouter } from "next/navigation";
import { LeadAgentActions, type AgentActionItem } from "./LeadAgentActions";

/** Lo que el Agente IA hizo o sugiere para este contacto, en la ficha completa (se recarga al resolver). */
export function LeadAgentSuggestions({ actions, canManage }: { actions: AgentActionItem[]; canManage: boolean }) {
  const router = useRouter();
  if (actions.length === 0) return null;
  return (
    <div className="rounded-card border border-violet-200 bg-violet-50/60 p-4 shadow-card">
      <LeadAgentActions actions={actions} canManage={canManage} onChanged={() => router.refresh()} />
    </div>
  );
}
