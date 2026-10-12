"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Headset, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences } from "@/context/preferences";
import {
  escalateConversation, resolveConversation, takeHumanControl, releaseToAI, assignConversation,
} from "@/actions/conversations";
import type { ConversationStatus } from "@prisma/client";
import { getErrorMessage } from "@/lib/user-error";

interface TeamUser { id: string; name: string | null; email: string }

interface ConversationActionsProps {
  conversationId: string;
  status: ConversationStatus;
  aiHandled: boolean;
  assignedTo: TeamUser | null;
  teamUsers: TeamUser[];
  canReply: boolean;
  canAssign: boolean;
  /** Para pantallas que guardan la conversación en su propio estado (el inbox): vuelve a cargarla tras un cambio. */
  onChanged?: () => void;
}

export function ConversationActions({
  conversationId, status, aiHandled, assignedTo, teamUsers, canReply, canAssign, onChanged,
}: ConversationActionsProps) {
  const { lang } = usePreferences();
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  async function run(key: string, action: () => Promise<unknown>, successMsg: string) {
    setLoading(key);
    try {
      await action();
      toast.success(successMsg);
      router.refresh();
      onChanged?.();
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error" : "Error")));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canAssign && (
        <Select
          value={assignedTo?.id ?? "__unassigned__"}
          onValueChange={(value) =>
            run(
              "assign",
              () => assignConversation(conversationId, value === "__unassigned__" ? null : value),
              lang === "es" ? "Asignación actualizada" : "Assignment updated"
            )
          }
          disabled={loading !== null}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder={lang === "es" ? "Sin asignar" : "Unassigned"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__unassigned__">{lang === "es" ? "Sin asignar" : "Unassigned"}</SelectItem>
            {teamUsers.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name ?? u.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {canReply && (aiHandled ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => run("take", () => takeHumanControl(conversationId), lang === "es" ? "Tomaste el control de la conversación" : "You took control of the conversation")}
          disabled={loading !== null}
          className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
        >
          {loading === "take" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headset className="h-4 w-4" />}
          {lang === "es" ? "Tomar control" : "Take control"}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => run("release", () => releaseToAI(conversationId), lang === "es" ? "Conversación devuelta a la IA" : "Conversation returned to AI")}
          disabled={loading !== null}
          className="text-brand-600 border-brand-200 hover:bg-brand-50"
        >
          {loading === "release" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
          {lang === "es" ? "Devolver a IA" : "Return to AI"}
        </Button>
      ))}

      {status === "OPEN" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => run("escalate", () => escalateConversation(conversationId), lang === "es" ? "Conversación escalada al equipo humano" : "Conversation escalated to the human team")}
          disabled={loading !== null}
          className="text-amber-600 border-amber-200 hover:bg-amber-50"
        >
          {loading === "escalate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
          {lang === "es" ? "Escalar a humano" : "Escalate to human"}
        </Button>
      )}

      {(status === "OPEN" || status === "ESCALATED") && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => run("resolve", () => resolveConversation(conversationId), lang === "es" ? "Conversación marcada como resuelta" : "Conversation marked as resolved")}
          disabled={loading !== null}
          className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
        >
          {loading === "resolve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {lang === "es" ? "Marcar como resuelta" : "Mark as resolved"}
        </Button>
      )}
    </div>
  );
}
