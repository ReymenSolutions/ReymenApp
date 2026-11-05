"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { TaskFormDialog, type TaskLeadOption, type TaskUserOption } from "./TaskFormDialog";
import { TASK_COPY } from "./copy";

/** Botón «Nueva tarea» con su formulario. Desde la ficha de un contacto llega `fixedLead`. */
export function NewTaskButton({ users, currentUser, fixedLead, opportunities, variant = "default" }: {
  users: TaskUserOption[];
  currentUser: { id: string; role: string };
  fixedLead?: TaskLeadOption;
  opportunities?: { id: string; title: string }[];
  variant?: "default" | "outline";
}) {
  const { lang } = usePreferences();
  const t = TASK_COPY[lang === "en" ? "en" : "es"];
  return (
    <TaskFormDialog
      users={users}
      currentUser={currentUser}
      fixedLead={fixedLead}
      opportunities={opportunities}
      trigger={
        <Button size="sm" variant={variant}>
          <Plus className="h-4 w-4" />
          {t.newTask}
        </Button>
      }
    />
  );
}
